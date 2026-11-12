/* Borrow the game's logical GS layer, own only a temporary connected state.
 * Constructor, metadata, NativeWindow and dimensions match Layer.OnOpen; the
 * original logical layer is neither recreated nor finalized. */
(async function(){
 await log('MOONLIGHT_BUFFERED_HANDOFF_BEGIN');
 if(window.__moonlightNativeGraphics)throw Error('An earlier display owns this process');
 var create=MoonlightNativeContext.create,c=create(),info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base),original=base+0x5456558n,logical=original+0x408n,prior=original+8n;
 if(c.read(original+0x500n,2).toString('hex')!=='0101'||c.native.read64(logical+0x30n)!==prior||c.native.read64(prior+0x10n)!==logical)throw Error('Original layer identity changed');
 var profiles={connect:[2419472,'08f0019008210491e20301aae10300aa032140f9000140f960001fd6'],disconnect:[2419504,'08f0019008210491e10300aa022540f9000140f940001fd6'],initialize:[2473712,'010c00f9c88f02f00881119108c1bf38a8000036c18f02f021a01191002000914077fd17'],finalize:[2474160,'7f2303d5fd7bbea9f30b00f9fd030091f30300aa0020009136b6fa977f0e00f9f30b40f9fd7bc2a8ff0f5fd6'],metadata:[2470416,'94cdff17'],size:[2475008,'0160007902640079c0035fd6']},fn={};
 for(var key of Object.keys(profiles)){fn[key]=base+BigInt(profiles[key][0]);await c.rpc.request({command:'verify-function',address:String(fn[key]),hex:profiles[key][1]});}
 var extra={lock:[1301776,'34000014'],unlock:[1301808,'44000014'],select:[2427264,'7f2303d5fd7bbca9f70b00f9f65702a9f44f03a9fd030091f40303aaf50302aaf60301aaf30300aadab4fb97600a40f9200300b4e80f80d277d03bd5']};for(var key of Object.keys(extra)){fn[key]=base+BigInt(extra[key][0]);await c.rpc.request({command:'verify-function',address:String(fn[key]),hex:extra[key][1]});}
 var backend=c.native.read64(c.native.read64(prior)),backendContext=c.native.read64(backend+0x18n),displayKey=c.native.read64(logical+0x10n),layerKey=c.native.read64(logical+0x18n);if(c.native.read64(backend+0xd0n)!==fn.select||layerKey!==0x746c7561666564n||displayKey!==layerKey)throw Error('Selection backend changed');
 var open=BigInt(c.resolve('_ZN2nn2vi5Layer4OpenEPKNS0_21LayerCreationSettingsEPNS0_7DisplayEPKc')),close=BigInt(c.resolve('_ZN2nn2vi5Layer5CloseEb')),invoke=c.call,owned=0n,connected=false,initialized=false,opened=false,returned=false;
 function disconnectOwned(){
  if(!connected)return;
  if(c.native.read64(owned+0x18n)!==logical)throw Error('Owned GS owner is uncertain; retained');
  if(initialized){if(c.native.read32(owned+0x4c8n)!==0n)throw Error('Owned native window is still connected; retained');invoke(fn.finalize,owned+0x4a8n);initialized=false;}
  invoke(fn.disconnect,owned+8n);connected=false;
  if(c.native.read64(owned+0x18n)!==0n||c.native.read64(logical+0x30n)!==prior||c.native.read64(prior+0x10n)!==logical)throw Error('Original selection was not restored');
  returned=true;
 }
 function call(address){var args=Array.prototype.slice.call(arguments,1);address=BigInt(address);
  if(address===open){
   if(owned)throw Error('Only one owned connection per probe');owned=BigInt(args[0]);if(owned===original||c.read(owned+0x500n,2).toString('hex')!=='0000'||c.native.read64(logical+0x30n)!==prior)throw Error('Owned layer preflight failed');
   var settings=BigInt(args[1]),width=c.native.read32(settings),height=c.native.read32(settings+4n);if(width!==1920n||height!==1080n)throw Error('Unexpected owned size');
   log('MOONLIGHT_BUFFERED_HANDOFF_CONNECT_BEGIN');var result=invoke(fn.connect,owned+8n,logical);if(BigInt.asUintN(32,result)!==0n)throw Error('GS connect refused: '+result);connected=true;
   if(c.native.read64(owned+0x18n)!==logical||c.native.read64(logical+0x30n)!==prior||c.native.read64(logical+0x20n)!==owned+0x20n)throw Error('Owned dormant state did not join original list');
   invoke(fn.metadata,owned+8n,4n,0n);invoke(fn.initialize,owned+0x4a8n,owned+8n);initialized=true;invoke(fn.size,owned+0x4a8n,width,height);
   if(c.read(owned+0x500n,2).toString('hex')!=='0000')throw Error('Automatic VI close was enabled');
   opened=true;log('MOONLIGHT_BUFFERED_HANDOFF_CONNECTED');return 0n;
  }
  if(address===close){
   if(!connected||BigInt(args[0])!==owned||c.native.read32(owned+0x4c8n)!==0n)throw Error('Owned native window is still connected');
   log('MOONLIGHT_BUFFERED_HANDOFF_DISCONNECT_BEGIN');disconnectOwned();log('MOONLIGHT_BUFFERED_HANDOFF_DISCONNECTED');return 0n;
  }
  return invoke.apply(c,[address].concat(args));
 }
 c.call=call;c.native.call=call;MoonlightNativeContext.create=function(){return c;};
 var banner=document.createElement('div');Object.assign(banner.style,{position:'fixed',left:'0',top:'0',width:innerWidth+'px',height:innerHeight+'px',zIndex:'99999',backgroundColor:'#164565',color:'white',fontSize:'36px',display:'flex',alignItems:'center',justifyContent:'center',whiteSpace:'pre-wrap',textAlign:'center'});banner.textContent='GAMEFACE BASELINE\nBuffered handoff test';document.body.appendChild(banner);
 try{
  await new Promise(function(r){setTimeout(r,4000);});
  var pattern=await MoonlightNativeDisplay.pattern({width:1920,height:1080,frames:1,report:function(e){log('MOONLIGHT_BUFFERED_HANDOFF_STAGE '+JSON.stringify(e));}}),state=MoonlightNativeDisplay.state();
  var active=false;
  function select(target){
   var lifecycle=state.ledger.snapshot();if(!c.rpc.connected||state.retired||lifecycle.closed||(target===owned+8n&&(state.failed||lifecycle.quarantined)))throw Error('Retained graphics are unavailable');
   if(c.native.read64(owned+0x18n)!==logical||c.native.read32(owned+0x4c8n)!==1n)throw Error('Buffered owned window is not live');
   c.call(fn.lock,logical);var result;
   try{if(c.native.read64(logical+0x30n)!==(active?owned+8n:prior))throw Error('Unexpected selection changed');result=Number(BigInt.asUintN(32,c.call(fn.select,backendContext,displayKey,layerKey,target)));if(result===0){c.native.write64(logical+0x30n,target);active=target===owned+8n;}}finally{c.call(fn.unlock,logical);}
   return result;
  }
  var record={context:c,state:state,logical:logical,prior:prior,owned:owned,select:select,deactivationAttempted:false,activate:function(){if(active)return 0;record.deactivationAttempted=false;return select(owned+8n);},deactivate:function(){if(!active)return 0;record.deactivationAttempted=true;return select(prior);},active:function(){return active;}};window.__moonlightBufferedHandoff=record;
  await log('MOONLIGHT_BUFFERED_HANDOFF_READY');
  // No event-loop yield while the temporary output owns the presentation route.
  var begin=Date.now(),activated=record.activate(),frames=0,restored=null,presentError=null;
  if(activated===0){try{for(var i=0;i<120;i++){state.present(0,false);frames++;}}catch(error){presentError=String(error.message||error);}finally{restored=record.deactivate();}}
  await log('MOONLIGHT_BUFFERED_HANDOFF_RESULT '+JSON.stringify({activated:activated,restored:restored,frames:frames,elapsedMs:Date.now()-begin,error:presentError,selected:String(c.native.read64(logical+0x30n)),prior:String(prior)}));
  if(activated!==0||restored!==0||presentError)throw Error('Buffered handoff incomplete; graphics retained');
  banner.textContent='GAMEFACE AFTER BUFFERED HANDOFF\nNative graphics retained for reuse';
  await new Promise(function(r){setTimeout(r,5000);});banner.parentNode.removeChild(banner);await new Promise(function(r){setTimeout(r,1000);});
  await log('MOONLIGHT_BUFFERED_HANDOFF_COMPLETE');
 }catch(error){
  var retained=window.__moonlightBufferedHandoff;if(retained&&retained.active()&&!retained.deactivationAttempted){try{var restored=retained.deactivate();await log('MOONLIGHT_BUFFERED_HANDOFF_EMERGENCY_RETURN '+JSON.stringify({result:restored}));}catch(restoreError){await log('MOONLIGHT_BUFFERED_HANDOFF_RETURN_UNCERTAIN '+String(restoreError.message||restoreError));}}
  if(connected&&!opened){try{disconnectOwned();}catch(cleanupError){await log('MOONLIGHT_BUFFERED_HANDOFF_QUARANTINED '+String(cleanupError.message||cleanupError));}}
  await log('MOONLIGHT_BUFFERED_HANDOFF_RETAINED '+String(error.message||error));throw error;
 }finally{MoonlightNativeContext.create=create;}
})();
