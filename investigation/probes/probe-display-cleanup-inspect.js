(async function(){
 await log('MOONLIGHT_DISPLAY_CLEANUP_INSPECT_BEGIN');
 var c=MoonlightNativeContext.create(),m=MoonlightNativeModules;
 var s=window.__moonlightCleanupProbe={context:c};
 s.stage=await m.display.createDisplay(c.rpc,{resolve:c.resolve,size:{width:1920,height:1080}});
 var d=s.stage.display,p=c.allocate(4096);s.query=p;c.write(p,new Uint8Array(4096));
 var rc=c.call(BigInt(c.resolve('vkGetPhysicalDeviceSurfaceCapabilitiesKHR')),BigInt(d.physical),BigInt(d.surface),BigInt(p));
 await log('MOONLIGHT_DISPLAY_CLEANUP_CAPS '+JSON.stringify({result:String(rc),hex:c.read(p,52).toString('hex'),display:d}));
 var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});
 var dispatch=c.native.read64(BigInt(d.device));
 await log('MOONLIGHT_DISPLAY_DISPATCH '+JSON.stringify({device:d.device,dispatch:String(dispatch),signature:c.read(dispatch,8).toString('hex')}));
 var target=c.native.read64(dispatch+0x678n);
 await log('MOONLIGHT_DISPLAY_DESTROY_TARGET '+JSON.stringify({address:String(target),offset:String(target-BigInt(info.base))}));
 for(var at=0;at<4096;at+=384)await log('MOONLIGHT_DISPLAY_DESTROY_CODE '+JSON.stringify({at:at,hex:c.read(target+BigInt(at),Math.min(384,4096-at)).toString('hex')}));
 c.release(p);s.query=null;
 await log('MOONLIGHT_DISPLAY_CLEANUP_INSPECT_COMPLETE');
})();
