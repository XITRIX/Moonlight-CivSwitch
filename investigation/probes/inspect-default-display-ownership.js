(async function(){
 await log('MOONLIGHT_DEFAULT_DISPLAY_BEGIN');var c=MoonlightNativeContext.create();
 try{
  var info=await c.rpc.request({command:'module-probe',name:'nnCompat'}),base=BigInt(info.base);
  await log('MOONLIGHT_DEFAULT_DISPLAY_GLOBAL '+JSON.stringify({offset:0x5bd8018,hex:c.read(base+0x5bd8018n,256).toString('hex')}));
  for(var f of c.findSymbols(/^_ZN2nn2vi(?:18OpenDefaultDisplayEPPNS0_7DisplayE|12CloseDisplayEPNS0_7DisplayE|11CreateLayerEPPNS0_5LayerEPNS0_7DisplayE|15GetNativeWindowEPPvPNS0_5LayerE)$/)){
   await log('MOONLIGHT_DEFAULT_DISPLAY_FUNCTION '+JSON.stringify({name:f.name,offset:f.offset,size:f.size,hex:c.read(base+BigInt(f.offset),Math.min(f.size,512)).toString('hex')}));
  }
  for(var offset of [0x2bd3740,0x2bd3750,0x2bd2ed0]){
   var p=base+BigInt(offset),bytes=c.read(p,16),op=bytes.readUInt32LE(0),ld=bytes.readUInt32LE(4);
   if((op&0x9f00001f)!==(0x90000010|0)||((ld>>>22)&0x3ff)!==0x3e5)throw Error('Unexpected driver PLT');
   var delta=(((op>>>5)&0x7ffff)*4+((op>>>29)&3));if(delta&0x100000)delta-=0x200000;
   var got=(p&~4095n)+BigInt(delta*4096+((ld>>>10)&0xfff)*8),target=c.native.read64(got);
   await log('MOONLIGHT_DEFAULT_DISPLAY_TARGET '+JSON.stringify({pltOffset:offset,targetOffset:String(target-base),target:String(target)}));
   for(var at=0;at<1024;at+=384)await log('MOONLIGHT_DEFAULT_DISPLAY_CODE '+JSON.stringify({pltOffset:offset,targetOffset:String(target-base),at:at,hex:c.read(target+BigInt(at),Math.min(384,1024-at)).toString('hex')}));
  }
  await log('MOONLIGHT_DEFAULT_DISPLAY_COMPLETE');
 }finally{c.close();}
})();
