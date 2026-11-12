(async function(){
 await log('MOONLIGHT_CLEANUP_EXPORTS_BEGIN');
 var c=MoonlightNativeContext.create();
 try{
  var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});
  await log('MOONLIGHT_CLEANUP_MODULE '+JSON.stringify(info));
  var found=c.findSymbols(/^(vkEnumerateDeviceExtensionProperties|vkGetPhysicalDeviceFeatures2(?:KHR)?|vkGetInstanceProcAddr|vkGetDeviceProcAddr|vkDestroySwapchainKHR|vkDestroySurfaceKHR)$|vi.*(Visibility|Layer.*(Close|Release|Destroy|GetNativeWindow))/);
  for(var f of found){
   await log('MOONLIGHT_CLEANUP_EXPORT '+JSON.stringify(f));
   if(/vkDestroySwapchainKHR|vkDestroySurfaceKHR|Layer7OnClose/.test(f.name)){
    var n=Math.min(f.size,8192),base=BigInt(info.base)+BigInt(f.offset);
    for(var at=0;at<n;at+=384)await log('MOONLIGHT_CLEANUP_CODE '+JSON.stringify({name:f.name,offset:f.offset+at,hex:c.read(base+BigInt(at),Math.min(384,n-at)).toString('hex')}));
   }
  }
  await log('MOONLIGHT_CLEANUP_EXPORTS_COMPLETE');
 }finally{c.close();}
})();
