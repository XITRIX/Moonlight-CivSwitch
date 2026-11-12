/* A fresh-process, distinct-name takeover and full owned teardown. Intercept
 * only the known Layer.Open label write; all driver calls remain unchanged. */
(async function(){
 await log('MOONLIGHT_UNIQUE_LAYER_BEGIN');
 if(window.__moonlightNativeGraphics)throw Error('Fresh graphics baseline required');
 var banner=document.createElement('div');Object.assign(banner.style,{position:'fixed',left:'0',top:'0',width:innerWidth+'px',height:innerHeight+'px',zIndex:'99999',backgroundColor:'#164565',color:'white',fontSize:'36px',display:'flex',alignItems:'center',justifyContent:'center',whiteSpace:'pre-wrap',textAlign:'center'});banner.textContent='GAMEFACE BASELINE\nDistinct native layer test';document.body.appendChild(banner);
 await new Promise(function(r){setTimeout(r,5000);});
 var create=MoonlightNativeContext.create,changed=0,state=null;
 MoonlightNativeContext.create=function(){var c=create(),plan=c.rpc.callPlan;c.rpc.callPlan=async function(value){var steps=value.steps.map(function(step){if(step.write&&step.hex==='64656661756c7400'){changed++;return Object.assign({},step,{hex:'6d6c766964656f00'});}return step;});return plan(Object.assign({},value,{steps:steps}));};return c;};
 try{
  var pattern=await MoonlightNativeDisplay.pattern({width:1920,height:1080,frames:120,report:function(e){log('MOONLIGHT_UNIQUE_LAYER_STAGE '+JSON.stringify(e));}});
  state=MoonlightNativeDisplay.state();if(changed!==1)throw Error('Layer name interception count changed');
  var logical=BigInt(state.display.layer)+0x408n,ownKey=state.context.read(logical+0x18n,8).toString('hex');if(ownKey!=='6d6c766964656f00')throw Error('Distinct layer key not established');
  await log('MOONLIGHT_UNIQUE_LAYER_PATTERN '+JSON.stringify({name:ownKey,frames:pattern.frames,elapsedMs:pattern.elapsedMs}));
  await new Promise(function(r){setTimeout(r,2000);});
  var ownedLayer=BigInt(state.display.layer);
  await state.ledger.close({display:state.display,present:state.present,allowSwapchainDestroy:true,verifyReleased:async function(){var flags=state.context.read(ownedLayer+0x500n,2).toString('hex');if(flags!=='0000')throw Error('Layer still open');await log('MOONLIGHT_UNIQUE_LAYER_RELEASED '+JSON.stringify({flags:flags}));}});
  state.ready=false;state.retired=true;banner.textContent='GAMEFACE AFTER NATIVE CLOSE\nDistinct layer name: mlvideo';
  await log('MOONLIGHT_UNIQUE_LAYER_CLEANED '+JSON.stringify({closed:state.ledger.snapshot().closed}));
  await new Promise(function(r){setTimeout(r,6000);});
  banner.parentNode.removeChild(banner);await new Promise(function(r){setTimeout(r,1500);});
  await log('MOONLIGHT_UNIQUE_LAYER_COMPLETE');
 }finally{MoonlightNativeContext.create=create;}
})();
