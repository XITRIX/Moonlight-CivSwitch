(async function(){
 await log('MOONLIGHT_GS_FRAME_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base),table=base+0x404e108n;for(var slot of [0x78,0x80]){var fn=c.native.read64(table+BigInt(slot));for(var at=0;at<2592;at+=256)await log('MOONLIGHT_GS_FRAME_CODE '+JSON.stringify({slot:slot,offset:String(fn-base+BigInt(at)),hex:c.read(fn+BigInt(at),Math.min(256,2592-at)).toString('hex')}));}await log('MOONLIGHT_GS_FRAME_COMPLETE');}finally{c.close();}
})();
