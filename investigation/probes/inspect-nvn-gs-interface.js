/* Read-only virtual targets used by the active NVN window implementation. */
(async function(){
 await log('MOONLIGHT_NVN_GS_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base),p=base+3436504n,b=c.read(p,12),op=b.readUInt32LE(0),ld=b.readUInt32LE(8);if((op&0x9f00001f)!==(0x90000008|0))throw Error('NVN dispatch changed');var delta=((op>>>5&0x7ffff)*4+(op>>>29&3));if(delta&0x100000)delta-=0x200000;var slot=(p&~4095n)+BigInt(delta*4096+(ld>>>10&0xfff)*8),holder=c.native.read64(slot),object=c.native.read64(holder),table=c.native.read64(object);
  await log('MOONLIGHT_NVN_GS_ROOT '+JSON.stringify({slotOffset:String(slot-base),holder:String(holder),object:String(object),objectHex:c.read(object,128).toString('hex'),tableOffset:String(table-base),tableHex:c.read(table,160).toString('hex')}));
  for(var at=0;at<160;at+=8){var fn=c.native.read64(table+BigInt(at));if(!fn)continue;c.native.checkMemory(fn,384,5);await log('MOONLIGHT_NVN_GS_CODE '+JSON.stringify({slot:at,offset:String(fn-base),hex:c.read(fn,384).toString('hex')}));}
  await log('MOONLIGHT_NVN_GS_COMPLETE');
 }finally{c.close();}
})();
