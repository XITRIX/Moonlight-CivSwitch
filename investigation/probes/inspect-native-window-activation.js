(async function(){
 await log('MOONLIGHT_NATIVE_ACTIVATION_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base);for(var at=0;at<1024;at+=256)await log('MOONLIGHT_NATIVE_ACTIVATION_CODE '+JSON.stringify({offset:2455552+at,hex:c.read(base+BigInt(2455552+at),256).toString('hex')}));await log('MOONLIGHT_NATIVE_ACTIVATION_COMPLETE');}finally{c.close();}
})();
