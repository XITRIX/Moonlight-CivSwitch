/* Standard Vulkan pointer/integer ABI only. No layer or swapchain is opened. */
(async function(){
 await log('MOONLIGHT_CLEANUP_FEATURES_BEGIN');
 var c=MoonlightNativeContext.create(),p=c.allocate(131072),instance=0n;
 var B=MoonlightNativeBuffer;
 function w(o,v){c.native.write32(BigInt(p+o),BigInt(v));}
 function q(o,v){c.native.write64(BigInt(p+o),BigInt(v));}
 function ok(name,args){var rc=Number(BigInt.asIntN(32,c.call(BigInt(c.resolve(name)),...args.map(BigInt))));if(rc!==0)throw Error(name+' returned '+rc);}
 try{
  c.write(p,new Uint8Array(131072));
  // VkApplicationInfo and VkInstanceCreateInfo; no instance extensions needed for enumeration.
  w(0,0);w(44,0x404000);w(64,1);q(88,p);
  ok('vkCreateInstance',[p+64,0,p+128]);instance=c.native.read64(BigInt(p+128));
  ok('vkEnumeratePhysicalDevices',[instance,p+136,0]);
  if(Number(c.native.read32(BigInt(p+136)))!==1)throw Error('Unexpected physical count');
  ok('vkEnumeratePhysicalDevices',[instance,p+136,p+144]);
  var physical=c.native.read64(BigInt(p+144)),info=await c.rpc.request({command:'module-probe',name:'nnCompat'});
  var found=c.findSymbols(/^vkEnumerateDeviceExtensionProperties$/);if(found.length!==1)throw Error('Missing standard extension query');
  var f=found[0],address=BigInt(info.base)+BigInt(f.offset);
  await c.rpc.request({command:'verify-function',address:String(address),hex:f.hex});
  var rc=c.call(address,physical,0n,BigInt(p+152),0n);if(BigInt.asIntN(32,rc)!==0n)throw Error('Extension count failed');
  var count=Number(c.native.read32(BigInt(p+152)));if(count<1||count>400)throw Error('Extension count rejected');
  rc=c.call(address,physical,0n,BigInt(p+152),BigInt(p+4096));if(BigInt.asIntN(32,rc)!==0n)throw Error('Extension list failed');
  var bytes=c.read(p+4096,count*260),names=[];
  for(var i=0;i<count;i++){var name='';for(var j=0;j<256&&bytes[i*260+j];j++)name+=String.fromCharCode(bytes[i*260+j]);names.push(name);}
  await log('MOONLIGHT_CLEANUP_FEATURES '+JSON.stringify({count:count,extensions:names}));
  await log('MOONLIGHT_CLEANUP_FEATURES_COMPLETE');
 }finally{if(instance)c.call(BigInt(c.resolve('vkDestroyInstance')),instance,0n);c.release(p);c.close();}
})();
