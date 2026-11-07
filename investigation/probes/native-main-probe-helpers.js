/* Parse the known main module's dynamic exports using established reads. */
(function(){
 var N=window.MoonlightProbeNative,base=main_base,mod=base+read32(base+4n),dynamic=mod+BigInt.asIntN(32,read32(mod+4n)),tags={};
 if(read32(mod)!==0x30444f4dn)throw Error("Main MOD0 header mismatch");
 for(var i=0;i<128;i++){var tag=Number(read64(dynamic+BigInt(i*16)));if(!tag)break;tags[tag]=read64(dynamic+BigInt(i*16+8));}
 [4,5,6].forEach(function(tag){if(tags[tag]<base)tags[tag]+=base;});
 var count=Number(read32(tags[4]+4n)),size=Number(tags[10]);if(count<1||count>100000||size<1||size>8388608)throw Error("Unexpected main symbol bounds");
 var entries=N.copyFrom(tags[6],count*24),strings=N.copyFrom(tags[5],size),view=new DataView(entries.buffer),exports={};
 for(var i=0;i<count;i++){
  var offset=view.getUint32(i*24,true),name="";for(var j=offset;j<strings.length&&j<offset+4096&&strings[j];j++)name+=String.fromCharCode(strings[j]);
  var address=view.getBigUint64(i*24+8,true);if(address)exports[name]={address:base+address,offset:address.toString(16),size:Number(view.getBigUint64(i*24+16,true))};
 }
 N.mainExports=exports;N.mainResolve=function(name){if(!exports[name])throw Error("Missing main export "+name);return exports[name].address;};
})();
