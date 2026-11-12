/* Owned WSI teardown only. Keep logical device and shared display ref until
 * visible return is assessed. No content-visibility setter or window-ID call. */
(async function(){
 await log('MOONLIGHT_MODE_SWITCH_STAGE1_BEGIN');
 if(window.__moonlightModeSwitchProbe)throw Error('A mode-switch probe already owns native objects');
 var c=MoonlightNativeContext.create(),m=MoonlightNativeModules,info=await c.rpc.request({command:'module-probe',name:'nnCompat'});
 if(info.hash!=='cf649bbd')throw Error('Unqualified driver build');
 var shared=BigInt(info.base)+0x5bd8018n;
 function refs(){return String(c.native.read64(shared+0x28n));}
 var banner=document.createElement('div');Object.assign(banner.style,{position:'fixed',left:'0',top:'0',width:innerWidth+'px',height:innerHeight+'px',zIndex:'99999',backgroundColor:'#164565',color:'#ffffff',fontSize:'36px',display:'flex',alignItems:'center',justifyContent:'center',whiteSpace:'pre-wrap',textAlign:'center'});banner.textContent='GAMEFACE BASELINE\nPress A for the display-switch test';document.body.appendChild(banner);
 var pad=MoonlightControllerInput.createNative(),baseline=refs();
 await log('MOONLIGHT_MODE_SWITCH_BASELINE_READY '+JSON.stringify({displayRefs:baseline}));
 var deadline=Date.now()+60000,neutral=false,advanced=false;
 while(Date.now()<deadline){var input=pad.poll(),buttons=input?input.state[0]:0;if(!buttons)neutral=true;if(neutral&&(buttons&0x2000)){advanced=true;break;}await new Promise(function(r){setTimeout(r,50);});}
 pad.close();
 if(!advanced){banner.parentNode.removeChild(banner);c.close();await log('MOONLIGHT_MODE_SWITCH_STAGE1_CANCELLED_NO_INPUT');return;}
 var stage=await m.display.createDisplay(c.rpc,{resolve:c.resolve,size:{width:1920,height:1080}}),d=stage.display;
 await log('MOONLIGHT_MODE_SWITCH_CREATED '+JSON.stringify({displayRefs:refs(),display:d.display,layer:d.layer,viewport:[innerWidth,innerHeight]}));
 var phaseKinds=['semaphore','swapchain','surface','layer'];
 var objects=stage.objects.filter(function(o){return phaseKinds.indexOf(o.kind)>=0;}),remaining=stage.objects.filter(function(o){return phaseKinds.indexOf(o.kind)<0;});
 var ledger=MoonlightNativeCleanup.create(c,async function(e){await log('MOONLIGHT_MODE_SWITCH_STAGE '+JSON.stringify({stage:e.stage,kind:e.kind,refs:refs()}));});
 ledger.recordDisplay({objects:objects});
 window.__moonlightModeSwitchProbe={context:c,stage:stage,remaining:remaining,banner:banner,baseline:baseline,shared:shared,phase1:ledger};
 await ledger.close({display:d,allowSwapchainDestroy:true,keepContext:true,verifyReleased:async function(){
  var flags=c.read(BigInt(d.layer)+0x500n,2).toString('hex');await log('MOONLIGHT_MODE_SWITCH_LAYER_FLAGS '+JSON.stringify({flags:flags,refs:refs()}));if(flags!=='0000')throw Error('VI close is incomplete');
 }});
 banner.textContent='GAMEFACE AFTER NATIVE LAYER CLOSE\nVulkan device and default display retained';
 await new Promise(function(r){setTimeout(r,1500);});
 await log('MOONLIGHT_MODE_SWITCH_STAGE1_COMPLETE '+JSON.stringify({refs:refs(),remaining:remaining.map(function(o){return o.kind;}),closed:ledger.snapshot().closed}));
})();
