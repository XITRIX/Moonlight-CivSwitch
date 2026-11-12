/* Read-only: active driver exports and main-module import relocation targets. */
(async function(){
 await log('MOONLIGHT_PRESENTATION_EXPORTS_BEGIN');var c=MoonlightNativeContext.create();
 try{
  var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});
  await log('MOONLIGHT_PRESENTATION_MODULE '+JSON.stringify(info));
  for(var f of c.findSymbols(/^nvn(?:Window|WindowBuilder|Queue(?:Present|Acquire|Finish|GetError))|vi.*(?:ScalingMode|Position|Visibility|Layer.*(?:Connect|Open|Present))/))await log('MOONLIGHT_PRESENTATION_EXPORT '+JSON.stringify(f));
  var base=main_base,header=c.read(base,8),mod=base+BigInt(header.readUInt32LE(4));if(c.native.read32(mod)!==0x30444f4dn)throw Error('Main MOD0 missing');
  var dynamic=mod+BigInt.asIntN(32,c.native.read32(mod+4n)),tags={};
  for(var i=0;i<128;i++){var at=dynamic+BigInt(i*16),tag=Number(c.native.read64(at));if(!tag)break;tags[tag]=c.native.read64(at+8n);}
  function ptr(p){return p<base?base+p:p;}
  if(tags[11]!==24n||!tags[10]||tags[10]>0x800000n)throw Error('Main symbol metadata rejected');
  var hash=c.read(ptr(tags[4]),8),count=hash.readUInt32LE(4);if(count<1||count>200000)throw Error('Main symbol count rejected');
  var strings=c.read(ptr(tags[5]),Number(tags[10])),symbols=c.read(ptr(tags[6]),count*24),imports=new Map();
  for(var i=0;i<count;i++){var at=symbols.readUInt32LE(i*24),name='';if(at>=strings.length)continue;for(var j=at;j<Math.min(strings.length,at+512)&&strings[j];j++)name+=String.fromCharCode(strings[j]);
   if(symbols.readUInt16LE(i*24+6)===0&&(/nvn|^_ZN.*2vi.*(?:Layer|Display|Initialize|Finalize)/.test(name)))imports.set(i,name);
  }
  for(var pair of [[23,2],[7,8]]){var length=Number(tags[pair[1]]||0n);if(!length)continue;if(length%24||length>9600000)throw Error('Main relocations rejected');var relocs=c.read(ptr(tags[pair[0]]),length);
   for(var at=0;at<length;at+=24){var r=relocs.readBigUInt64LE(at+8),index=Number(r>>32n),type=Number(r&0xffffffffn),name=imports.get(index);if(!name||![1025,1026].includes(type))continue;var slot=ptr(relocs.readBigUInt64LE(at)),target=c.native.read64(slot);await log('MOONLIGHT_PRESENTATION_IMPORT '+JSON.stringify({name:name,slotOffset:String(slot-base),target:String(target),driverOffset:String(target-BigInt(info.base)),sdkOffset:String(target-sdk_base),hex:c.read(target,32).toString('hex')}));}
  }
  await log('MOONLIGHT_PRESENTATION_EXPORTS_COMPLETE');
 }finally{c.close();}
})();
