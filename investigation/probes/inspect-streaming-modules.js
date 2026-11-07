/* Read-only module-map and export inspection. No heap/private state dump. */
(async function(){
 var N=window.MoonlightProbeNative,info=malloc(64),pageInfo=malloc(8);
 async function out(name,value){await log("MOONLIGHT_STREAM_MODULE_"+name+": "+JSON.stringify(value));}
 function query(address){var rc=call_rop(sdk_base+0x168b0cn,info,pageInfo,address);if(rc&0x3fffffn)return null;return {base:read64(info),size:read64(info+8n),type:Number(read32(info+16n)),permissions:Number(read32(info+24n))};}
 function readable(address,length){
  if(address<0n||length<1||!Number.isSafeInteger(length)||address+BigInt(length)>0x8000000000n)return false;
  var end=address+BigInt(length),cursor=address;
  for(var i=0;i<32&&cursor<end;i++){var m=query(cursor);if(!m||!(m.permissions&1)||m.base+m.size<=cursor)return false;cursor=m.base+m.size;}
  return cursor>=end;
 }
 function textAt(bytes,offset){if(offset>=bytes.length)return "";var text="";for(var i=offset;i<Math.min(bytes.length,offset+4096)&&bytes[i];i++)text+=String.fromCharCode(bytes[i]);return text;}
 async function copied(pointer,length){
  var bytes=new Uint8Array(length);
  for(var offset=0;offset<length;offset+=65536){var size=Math.min(65536,length-offset);bytes.set(N.copyFrom(pointer+BigInt(offset),size),offset);await new Promise(function(done){setTimeout(done,0);});}
  return bytes;
 }
 async function inspect(base,label){
  if(!readable(base,8))return;
  var modOffset=read32(base+4n);if(modOffset<=0n||modOffset>0x10000000n)return;
  var mod=base+modOffset,mapping=query(mod);if(!mapping||!readable(mod,8)||read32(mod)!==0x30444f4dn)return;
  var dynamic=mod+BigInt.asIntN(32,read32(mod+4n)),tags={},terminated=false;
  for(var i=0;i<128;i++){var entry=dynamic+BigInt(i*16);if(!readable(entry,16))return;var tag=Number(read64(entry));if(!tag){terminated=true;break;}tags[tag]=read64(entry+8n);}
  if(!terminated)return;
  if(!tags[4]||!tags[5]||!tags[6]){await out("NO_SYMBOL_TABLE",label);return;}
  for(var tag of [4,5,6])if(tags[tag]<base)tags[tag]+=base;
  if(!readable(tags[4],8)||(tags[11]&&tags[11]!==24n))return;
  var count=Number(read32(tags[4]+4n)),size=Number(tags[10]);
  await out("SYMBOL_TABLE",{module:label,symbols:count,stringBytes:size});
  if(!Number.isSafeInteger(count)||count<1||count>250000||!Number.isSafeInteger(size)||size>16777216||size<1)return;
  if(!readable(tags[6],count*24)||!readable(tags[5],size))return;
  var symbols=await copied(tags[6],count*24),strings=await copied(tags[5],size),view=new DataView(symbols.buffer),matches=[];
  for(var i=0;i<count;i++){
   if(i%512===0)await new Promise(function(done){setTimeout(done,0);});
   var name=textAt(strings,view.getUint32(i*24,true));
   if(/wasm|WebAssembly|SetFlagsFromString|VideoDecoder|avcodec|nvdec|nvmedia|bink|vpx_codec|movie.*(Player|Decoder)|MediaDecoder/i.test(name))matches.push({name:name,offset:view.getBigUint64(i*24+8,true).toString(16),size:Number(view.getBigUint64(i*24+16,true))});
  }
  await out("MEDIA_EXPORTS",{module:label,count:matches.length,matches:matches.slice(0,100)});
 }
 try{
  if(read32(sdk_base+0x168b10n)!==0xd40000c1n)throw Error("QueryMemory wrapper mismatch");
  var cursor=0n,regions=0,rx=[];
  for(;regions<512&&cursor<0x8000000000n;regions++){
   var mapping=query(cursor);if(!mapping||!mapping.size||mapping.base+mapping.size<=cursor)break;
   if((mapping.permissions&5)===5){rx.push(mapping);await out("RX_REGION",{base:mapping.base.toString(16),size:mapping.size.toString(16),type:mapping.type});}
   if((mapping.type&255)===0x14||(mapping.type&255)===0x15||mapping.permissions===7)await out("JIT_REGION",{base:mapping.base.toString(16),size:mapping.size.toString(16),type:mapping.type,permissions:mapping.permissions});
   cursor=mapping.base+mapping.size;
  }
  await out("MAP_SCAN",{regions:regions,rxRegions:rx.length,stoppedAt:cursor.toString(16)});
  await inspect(main_base,"main");await inspect(sdk_base,"sdk");
  for(var mapping of rx)if(mapping.base!==main_base&&mapping.base!==sdk_base&&mapping.size>=4096n)await inspect(mapping.base,"other@"+mapping.base.toString(16));
 }catch(error){await out("ERROR",String(error.message||error));}
 finally{free(info);free(pageInfo);delete window.MoonlightProbeNative;await out("END",true);}
})();
