/* RETIRED: diagnostic only. Visible Gameface return failed; content-restore crashed. Do not rerun as a recovery action. */
/* Corrected owned teardown: disconnect the native window before VI Close.
 * Unlike the earlier attempt, require the layer's completed-close state before
 * releasing its backing allocation. No native-window ID accessor is invoked. */
(async function(){
 await log('MOONLIGHT_WINDOW_CLEANUP_BEGIN');
 var c=MoonlightNativeContext.create(),m=MoonlightNativeModules,stage;
 var banner=document.createElement('div');Object.assign(banner.style,{position:'fixed',left:'0',right:'0',top:'0',bottom:'0',zIndex:'99999',backgroundColor:'#16334b',color:'#ffffff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'38px'});banner.textContent='MOONLIGHT DISPLAY CLEANUP TEST';document.body.appendChild(banner);
 await new Promise(function(r){setTimeout(r,250);});
 stage=await m.display.createDisplay(c.rpc,{resolve:c.resolve,size:{width:1920,height:1080}});
 var info=await c.rpc.request({command:'module-probe',name:'nnCompat'}),f=c.findSymbols(/^_ZN2nn2vi6detail17LayerNativeWindow10DisconnectEv$/)[0];
 if(!f||f.offset!==2474320||f.size!==68)throw Error('Disconnect export changed');
 var address=BigInt(info.base)+BigInt(f.offset),signature='7f2303d5fd7bbea9f30b00f9fd030091f30300aa000c40f9badca594688200917f1600f91ffd9f08600240f9f30b40f9080040f9010940f9fd7bc2a8ff2303d520001fd6';
 await c.rpc.request({command:'verify-function',address:String(address),hex:signature});
 var layer=BigInt(stage.display.layer),nativeWindow=layer+0x4a8n;
 var ledger=MoonlightNativeCleanup.create(c,async function(e){
  await log('MOONLIGHT_WINDOW_CLEANUP_STAGE '+JSON.stringify(e));
  if(e.kind==='layer'&&e.stage==='cleanup-begin'){
   var connected=c.read(nativeWindow+0x20n,1)[0];await log('MOONLIGHT_WINDOW_BEFORE '+JSON.stringify({connected:connected,flags:c.read(layer+0x500n,2).toString('hex')}));
   if(connected===1)c.call(address,nativeWindow);else if(connected!==0)throw Error('Unknown window connection state');
   await log('MOONLIGHT_WINDOW_DISCONNECTED '+JSON.stringify({connected:c.read(nativeWindow+0x20n,1)[0]}));
  }
  if(e.kind==='layer'&&e.stage==='cleanup-complete'){
   var flags=c.read(layer+0x500n,2).toString('hex');await log('MOONLIGHT_WINDOW_CLOSED '+flags);if(flags!=='0000')throw Error('VI layer is still owned');
  }
 });
 ledger.recordDisplay(stage);window.__moonlightWindowCleanup={context:c,stage:stage,ledger:ledger};
 await ledger.close({display:stage.display,allowSwapchainDestroy:true});
 banner.textContent='MOONLIGHT DISPLAY CLEANED UP';
 await log('MOONLIGHT_WINDOW_CLEANUP_RESULT '+JSON.stringify({closed:ledger.snapshot().closed}));
 await new Promise(function(r){setTimeout(r,8000);});banner.parentNode.removeChild(banner);
 await log('MOONLIGHT_WINDOW_CLEANUP_COMPLETE');
})();
