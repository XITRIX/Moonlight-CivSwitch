/* Read-only OLED/Switch 2 comparison. Never construct or invoke a movie object. */
(async function(){
 "use strict";
 var info=0n,page=0n,limit=0x8000000000n,queries=0;
 var names=[
  "_ZN5movie7DecoderC1ENS_11DecoderTypeENS_19DecoderOutputFormatE",
  "_ZN5movie7DecoderC1ENS_11DecoderTypeENS_19DecoderOutputFormatENS_11DecoderModeEi",
  "_ZN5movie7Decoder9ConfigureEPNS_9MediaDataE",
  "_ZN5movie7Decoder5StartEv",
  "_ZN5movie17GetThreadPriorityEv"
 ];
 async function out(key,value){await log("MOONLIGHT_MOVIE_DISCOVERY_"+key+": "+JSON.stringify(value));}
 function query(address){
  if(address<0n||address>=limit)throw Error("Query address outside inspected address space");
  if(++queries>50000)throw Error("Memory query budget exhausted");
  var rc=call_rop(sdk_base+0x168b0cn,info,page,address)&0x3fffffn;
  if(rc)throw Error("Memory query failed at 0x"+address.toString(16)+": 0x"+rc.toString(16));
  var q={base:read64(info),size:read64(info+8n),permissions:Number(read32(info+24n))};
  if(q.base>address||q.size<1n||q.base+q.size<=address)throw Error("Invalid memory query range");
  return q;
 }
 function readable(address,length){
  if(address<0n||!Number.isSafeInteger(length)||length<1||address+BigInt(length)>limit)return false;
  var cursor=address,end=address+BigInt(length);
  for(var i=0;i<32&&cursor<end;i++){var q=query(cursor);if(!(q.permissions&1))return false;cursor=q.base+q.size;}
  return cursor>=end;
 }
 function hash(name){
  var h=0;
  for(var i=0;i<name.length;i++){h=((h<<4)+name.charCodeAt(i))>>>0;var high=h&0xf0000000;if(high)h^=high>>>24;h=(h&~high)>>>0;}
  return h;
 }
 function matches(pointer,name){
  if(!readable(pointer,name.length+1))return false;
  for(var i=0;i<=name.length;i++)if(Number(read8(pointer+BigInt(i)))!==(i===name.length?0:name.charCodeAt(i)))return false;
  return true;
 }
 async function inspect(base){
  var result={base:base.toString(16),role:base===main_base?"main":base===sdk_base?"sdk":"other"};
  if(!readable(base,8))return;
  var offset=read32(base+4n);if(offset<1n||offset>0x10000000n)return;
  var mod=base+offset;if(!readable(mod,8)||read32(mod)!==0x30444f4dn)return;
  var dynamic=mod+BigInt.asIntN(32,read32(mod+4n)),tags={},ended=false;
  for(var i=0;i<128;i++){
   var entry=dynamic+BigInt(i*16);if(!readable(entry,16))break;
   var tag=Number(read64(entry));if(!tag){ended=true;break;}tags[tag]=read64(entry+8n);
  }
  if(!ended||!tags[4]||!tags[5]||!tags[6]){result.rejected="Missing terminated dynamic table or SysV symbols";await out("MODULE",result);return;}
  for(var tag of [4,5,6])if(tags[tag]<base)tags[tag]+=base;
  if(!readable(tags[4],8)){result.rejected="Unreadable hash header";await out("MODULE",result);return;}
  var buckets=Number(read32(tags[4])),count=Number(read32(tags[4]+4n)),size=Number(tags[10]);
  result.symbols=count;result.stringBytes=Number.isFinite(size)?size:null;
  result.appSearchEligible=result.role==="other"&&count>=1&&count<=10000&&size>=1&&size<=1048576;
  if(!Number.isSafeInteger(count)||count<1||count>250000||buckets<1||buckets>250000||!Number.isSafeInteger(size)||size<1||size>16777216||(tags[11]&&tags[11]!==24n))result.rejected="Symbol table bounds or entry size";
  else if(!readable(tags[4],8+(buckets+count)*4)||!readable(tags[6],count*24)||!readable(tags[5],size))result.rejected="Unreadable symbol tables";
  else{
   result.exports={};
   for(var name of names){
    var index=Number(read32(tags[4]+8n+BigInt((hash(name)%buckets)*4))),visited=new Set();
    for(var steps=0;index&&steps<4096;steps++){
     if(index>=count||visited.has(index)){result.rejected="Invalid or cyclic symbol chain";break;}visited.add(index);
     var symbol=tags[6]+BigInt(index*24),start=Number(read32(symbol));
     if(start+name.length<size&&matches(tags[5]+BigInt(start),name)){
      var value=read64(symbol+8n);
      if(value){var address=base+value;result.exports[name]={offset:value.toString(16),executable:address<limit&&(query(address).permissions&5)===5};}
      break;
     }
     index=Number(read32(tags[4]+8n+BigInt((buckets+index)*4)));
     if(steps===4095&&index)result.rejected="Symbol chain budget exhausted";
    }
   }
  }
  await out("MODULE",result);
 }
 try{
  if(read32(sdk_base+0x168b10n)!==0xd40000c1n)throw Error("Unsupported memory query ABI");
  info=malloc(64);page=malloc(8);if(!info||!page)throw Error("Probe allocation failed");
  await out("BASES",{main:main_base.toString(16),sdk:sdk_base.toString(16)});
  var cursor=0n,regions=0,rx=[],seen=new Set();
  for(;regions<2048&&cursor<limit;regions++){
   var q=query(cursor);
   if((q.permissions&5)===5&&!seen.has(q.base.toString())){rx.push(q.base);seen.add(q.base.toString());}
   cursor=q.base+q.size;
   if(regions%32===31)await new Promise(function(done){setTimeout(done,0);});
  }
  await out("SCAN",{regions:regions,rxRegions:rx.length,stoppedAt:cursor.toString(16),complete:cursor>=limit,exceededAppRegionLimit:regions>512});
  for(var base of [main_base,sdk_base].concat(rx)){
   if(!seen.has("inspected:"+base.toString())){seen.add("inspected:"+base.toString());await inspect(base);await new Promise(function(done){setTimeout(done,0);});}
  }
 }catch(error){await out("ERROR",String(error.message||error));throw error;}
 finally{if(page)free(page);if(info)free(info);await out("END",{queries:queries});}
})();
