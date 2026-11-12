(async function(){
 await log('MOONLIGHT_GS_PRESENT_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base),table=base+0x404e108n;await log('MOONLIGHT_GS_PRESENT_WRAPPER '+JSON.stringify({offset:2419632,hex:c.read(base+2419632n,32).toString('hex')}));for(var slot of [0x88,0x90,0x98,0xa0]){var fn=c.native.read64(table+BigInt(slot));for(var at=0;at<1536;at+=256)await log('MOONLIGHT_GS_PRESENT_CODE '+JSON.stringify({slot:slot,offset:String(fn-base+BigInt(at)),hex:c.read(fn+BigInt(at),256).toString('hex')}));}await log('MOONLIGHT_GS_PRESENT_COMPLETE');}finally{c.close();}
})();
