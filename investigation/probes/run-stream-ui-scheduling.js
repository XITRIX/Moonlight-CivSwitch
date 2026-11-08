/* Run before the UI entry point, inside the same async lifetime wrapper. */
(function(){
 var make=window.MoonlightStreamClient.create;
 window.MoonlightStreamClient.create=function(options){
  var stopped=options.onStopped;
  options.onStopped=function(error,s){
   var final={error:error?String(error.message):null,state:s&&s.state,tasks:s&&s.tasks,decoded:s&&s.decoded,presented:s&&s.presented,audioDecoded:s&&s.audioDecoded,audioDiscardedMs:s&&s.audioDiscardedMs,clock:s&&s.clock,budgetYields:s&&s.budgetYields};
   log('MOONLIGHT_SCHEDULING_UI_RESULT: '+JSON.stringify(final,function(k,v){return typeof v==='number'?Math.round(v*1000)/1000:v;}));
   if(stopped)stopped(error,s);
  };
  return make(options);
 };
 var begin=Date.now(),connected=false;
 function check(){try{
  if(Date.now()-begin>45000){log('MOONLIGHT_SCHEDULING_UI_TIMEOUT');if(window.__moonlightSimpleUI)window.__moonlightSimpleUI.close();return;}
  if(!window.__moonlightSimpleUI){setTimeout(check,100);return;}
  var connect=document.getElementById('moonlight-connect');
  if(!connected&&connect){connected=true;log('MOONLIGHT_SCHEDULING_UI_CONNECT');connect.dispatchEvent(new Event('click'));}
  var games=document.getElementById('moonlight-games-screen'),desktop=document.querySelector('#moonlight-game-list [data-app-id="881448767"]');
  if(games&&games.style.display==='flex'&&desktop){
   log('MOONLIGHT_SCHEDULING_UI_START');desktop.dispatchEvent(new Event('click'));
   if(document.getElementById('moonlight-stream-screen').style.display==='flex'){
    log('MOONLIGHT_SCHEDULING_UI_LAUNCHED');
    setTimeout(function(){window.MoonlightStreamClient.create=make;log('MOONLIGHT_SCHEDULING_UI_CLOSE');if(window.__moonlightSimpleUI)window.__moonlightSimpleUI.close();},30000);
    return;
   }
  }
  setTimeout(check,100);
 }catch(error){log('MOONLIGHT_SCHEDULING_UI_ERROR: '+String(error));if(window.__moonlightSimpleUI)window.__moonlightSimpleUI.close();}
 }
 setTimeout(check,100);
})();
