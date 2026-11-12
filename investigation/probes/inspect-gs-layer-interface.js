/* Read-only GS indirection targets reached by verified VI layer wrappers. */
(async function(){
 await log('MOONLIGHT_GS_INTERFACE_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base),p=base+2419440n,b=c.read(p,8),op=b.readUInt32LE(0),add=b.readUInt32LE(4),delta=((op>>>5&0x7ffff)*4+(op>>>29&3));if(delta&0x100000)delta-=0x200000;var table=(p&~4095n)+BigInt(delta*4096+(add>>>10&0xfff));
  c.native.checkMemory(table,512,1);await log('MOONLIGHT_GS_INTERFACE_TABLE '+JSON.stringify({offset:String(table-base),hex:c.read(table,512).toString('hex')}));
  for(var slot of [0x28,0x30,0x38,0x40,0x48,0x50,0x58,0x60]){var fn=c.native.read64(table+BigInt(slot));if(!fn)continue;c.native.checkMemory(fn,768,5);for(var at=0;at<768;at+=384)await log('MOONLIGHT_GS_INTERFACE_CODE '+JSON.stringify({slot:slot,offset:String(fn-base+BigInt(at)),hex:c.read(fn+BigInt(at),384).toString('hex')}));}
  await log('MOONLIGHT_GS_INTERFACE_COMPLETE');
 }finally{c.close();}
})();
