/* Only validated read primitives are used to inspect loaded SDK exports. */
(function(){
 var base=sdk_base,mod=base+read32(base+4n),dynamic=mod+BigInt.asIntN(32,read32(mod+4n)),tags={};
 for(var i=0;i<128;i++){var tag=Number(read64(dynamic+BigInt(i*16)));if(!tag)break;tags[tag]=read64(dynamic+BigInt(i*16+8));}
 [4,5,6].forEach(function(tag){if(tags[tag]<base)tags[tag]+=base;});
 var count=Number(read32(tags[4]+4n)),stringSize=Number(tags[10]);
 if(count<1||count>100000||stringSize<1||stringSize>8388608)throw Error("Unexpected SDK symbol bounds");
 function copyFrom(pointer,length){var bytes=new Uint8Array(length),view=new DataView(bytes.buffer),n=0;for(;n+8<=length;n+=8)view.setBigUint64(n,read64(pointer+BigInt(n)),true);for(;n<length;n++)bytes[n]=Number(read8(pointer+BigInt(n)));return bytes;}
 function nameAt(bytes,offset){var name="";while(offset<bytes.length&&bytes[offset])name+=String.fromCharCode(bytes[offset++]);return name;}
 var entries=copyFrom(tags[6],count*24),strings=copyFrom(tags[5],stringSize),data=new DataView(entries.buffer),exports={};
 for(var i=0;i<count;i++){var name=nameAt(strings,data.getUint32(i*24,true)),offset=data.getBigUint64(i*24+8,true),size=data.getBigUint64(i*24+16,true);if(offset)exports[name]={address:base+offset,offset:offset.toString(16),size:Number(size)};}
 function resolve(name){if(!exports[name])throw Error("Missing export "+name);return exports[name].address;}
 window.MoonlightProbeNative={exports:exports,resolve:resolve,copyFrom:copyFrom,call:function(name,args){return call_rop.apply(null,[resolve(name)].concat((args||[]).map(BigInt)));}};
})();
