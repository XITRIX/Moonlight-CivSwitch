/* RETIRED: diagnostic only. Visible Gameface return failed; content-restore crashed. Do not rerun as a recovery action. */
/* Owned-only teardown. One bounded attempt; stage logs locate any failure. */
(async function(){
 await log('MOONLIGHT_DISPLAY_CLEANUP_BEGIN');
 var s=window.__moonlightCleanupProbe;if(!s||!s.stage)throw Error('No owned display probe');
 var events=[],ledger=MoonlightNativeCleanup.create(s.context,async function(e){events.push(e);await log('MOONLIGHT_DISPLAY_CLEANUP_STAGE '+JSON.stringify(e));});
 ledger.recordDisplay(s.stage);
 await log('MOONLIGHT_DISPLAY_CLEANUP_READY');
 try{
  await ledger.close({display:s.stage.display,allowSwapchainDestroy:true});
  s.closed=true;s.stage=null;
  var banner=document.createElement('div');banner.id='native-cleanup-result';Object.assign(banner.style,{position:'fixed',left:'0',right:'0',top:'0',bottom:'0',backgroundColor:'#152438',color:'#ffffff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'38px'});banner.textContent='MOONLIGHT DISPLAY CLEANED UP';document.body.appendChild(banner);
  await log('MOONLIGHT_DISPLAY_CLEANUP_RESULT '+JSON.stringify({closed:ledger.snapshot().closed,events:events.length}));
  await new Promise(function(r){setTimeout(r,5000);});banner.parentNode.removeChild(banner);
  await log('MOONLIGHT_DISPLAY_CLEANUP_COMPLETE');
 }catch(e){await log('MOONLIGHT_DISPLAY_CLEANUP_ERROR '+String(e.message||e));throw e;}
})();
