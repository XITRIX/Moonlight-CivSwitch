/* Resolve NVN procedure names only; never invoke a window/queue mutation. */
(async function(){
 await log('MOONLIGHT_NVN_LOOKUP_BEGIN');var c=MoonlightNativeContext.create(),buffer=c.allocate(256);
 try{
  var info=await c.rpc.request({command:'module-probe',name:'nnCompat'}),base=BigInt(info.base),f=c.findSymbols(/^nvnBootstrapLoader$/)[0];
  if(!f||f.offset!==3640800)throw Error('Live bootstrap changed');
  var bootstrap=base+BigInt(f.offset);await c.rpc.request({command:'verify-function',address:String(bootstrap),hex:f.hex});
  var holder=c.native.read64(main_base+0x4db9ed8n),device=c.native.read64(holder);
  await log('MOONLIGHT_NVN_DEVICE_ROOT '+JSON.stringify({slotOffset:0x4db9ed8,holder:String(holder),device:String(device),holderHex:c.read(holder,64).toString('hex'),deviceHex:c.read(device,64).toString('hex')}));
  var names=['nvnDeviceGetProcAddress','nvnWindowGetNativeWindow','nvnWindowGetPresentInterval','nvnWindowGetNumTextures','nvnWindowGetNumActiveTextures','nvnWindowSetPresentInterval','nvnWindowSetNumActiveTextures','nvnQueuePresentTexture','nvnWindowAcquireTexture','nvnQueueAcquireTexture','nvnQueueGetError','nvnWindowInitialize','nvnWindowFinalize','nvnWindowBuilderSetNativeWindow','nvnWindowBuilderSetDefaults'];
  window.__moonlightNvnLookup={module:info,holder:holder,device:device,functions:{}};
  for(var name of names){c.write(buffer,MoonlightNativeBuffer.from(name+'\0'));var address=c.call(bootstrap,BigInt(buffer));
   window.__moonlightNvnLookup.functions[name]=address;
   await log('MOONLIGHT_NVN_PROC '+JSON.stringify({name:name,address:String(address),driverOffset:String(address-base),hex:address?c.read(address,64).toString('hex'):null}));
  }
  await log('MOONLIGHT_NVN_LOOKUP_COMPLETE');
 }finally{c.release(buffer);c.close();}
})();
