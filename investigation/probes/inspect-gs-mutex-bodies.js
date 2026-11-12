(async function(){
 await log('MOONLIGHT_GS_MUTEX_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base);for(var offset of [1301984,1302080])await log('MOONLIGHT_GS_MUTEX_CODE '+JSON.stringify({offset:offset,hex:c.read(base+BigInt(offset),192).toString('hex')}));await log('MOONLIGHT_GS_MUTEX_COMPLETE');}finally{c.close();}
})();
