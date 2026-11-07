/* Locate the loaded multimedia module by its exported Decoder constructor. */
(function(){
 var N=window.MoonlightProbeNative,info=malloc(64),page=malloc(8);
 function query(address){if(call_rop(sdk_base+0x168b0cn,info,page,address)&0x3fffffn)return null;return {base:read64(info),size:read64(info+8n),permissions:Number(read32(info+24n))};}
 function readable(address,length){var cursor=address,end=address+BigInt(length);for(var i=0;i<32&&cursor<end;i++){var m=query(cursor);if(!m||!(m.permissions&1)||m.base+m.size<=cursor)return false;cursor=m.base+m.size;}return cursor>=end;}
 try{
  var cursor=0n;
  for(var regions=0;regions<512&&cursor<0x8000000000n;regions++){
   var mapping=query(cursor);if(!mapping||!mapping.size||mapping.base+mapping.size<=cursor)break;cursor=mapping.base+mapping.size;
   var base=mapping.base;if((mapping.permissions&5)!==5||base===main_base||base===sdk_base||!readable(base,8))continue;
   var offset=read32(base+4n);if(offset<1n||offset>0x10000000n)continue;
   var mod=base+offset;if(!readable(mod,8)||read32(mod)!==0x30444f4dn)continue;
   var dynamic=mod+BigInt.asIntN(32,read32(mod+4n)),tags={},ended=false;
   for(var i=0;i<128;i++){var entry=dynamic+BigInt(i*16);if(!readable(entry,16))break;var tag=Number(read64(entry));if(!tag){ended=true;break;}tags[tag]=read64(entry+8n);}
   if(!ended||!tags[4]||!tags[5]||!tags[6])continue;for(var tag of [4,5,6])if(tags[tag]<base)tags[tag]+=base;
   if(!readable(tags[4],8))continue;var count=Number(read32(tags[4]+4n)),size=Number(tags[10]);
   if(!Number.isSafeInteger(count)||count<1||count>10000||!Number.isSafeInteger(size)||size<1||size>1048576||!readable(tags[6],count*24)||!readable(tags[5],size))continue;
   var symbols=N.copyFrom(tags[6],count*24),strings=N.copyFrom(tags[5],size),view=new DataView(symbols.buffer),exports={};
   for(var i=0;i<count;i++){
    var start=view.getUint32(i*24,true),name="";for(var j=start;j<strings.length&&j<start+4096&&strings[j];j++)name+=String.fromCharCode(strings[j]);
    var value=view.getBigUint64(i*24+8,true);if(value)exports[name]={address:base+value,offset:value.toString(16),size:Number(view.getBigUint64(i*24+16,true))};
   }
   if(exports._ZN5movie7DecoderC1ENS_11DecoderTypeENS_19DecoderOutputFormatE){N.movieExports=exports;N.movieBase=base;break;}
  }
 }finally{free(info);free(page);}
 if(!N.movieExports)throw Error("Loaded movie decoder module not found");
 N.movieResolve=function(name){if(!N.movieExports[name])throw Error("Missing movie export "+name);return N.movieExports[name].address;};
 N.movieCall=function(name,args){return call_rop.apply(null,[N.movieResolve(name)].concat((args||[]).map(BigInt)));};
})();
