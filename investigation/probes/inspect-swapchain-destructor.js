(async function(){
 var s=window.__moonlightCleanupProbe,c=s.context,info=await c.rpc.request({command:'module-probe',name:'nnCompat'});
 var target=BigInt(info.base)+37033568n;
 await log('MOONLIGHT_SWAPCHAIN_DESTRUCTOR_BEGIN '+JSON.stringify({offset:37033568}));
 for(var at=0;at<8192;at+=384)await log('MOONLIGHT_SWAPCHAIN_DESTRUCTOR_CODE '+JSON.stringify({at:at,hex:c.read(target+BigInt(at),Math.min(384,8192-at)).toString('hex')}));
 await log('MOONLIGHT_SWAPCHAIN_DESTRUCTOR_COMPLETE');
})();
