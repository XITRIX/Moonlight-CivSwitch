/* Full-UI fault injection. Blackhole only core stream sockets, suppress RAF,
   then inject the local chord through the Npad adapter. No system/Wi-Fi changes. */
(function(){
 var healthy=!!window.__moonlightExitTestHealthy;delete window.__moonlightExitTestHealthy;
 var config=window.__moonlightExitTestConfig||{};delete window.__moonlightExitTestConfig;var samples=[];
 var makeIO=window.MoonlightStreamIO.create,makeClient=window.MoonlightStreamClient.create,makePad=window.MoonlightControllerInput.createNative;
 var originalRAF=window.requestAnimationFrame,originalLog=window.log,now=window.MoonlightTelemetry.now;
 var blackhole=false,forceExit=false,connected=false,launched=false,armed=false,chordAt=0,stopAt=0,doneStats=null,error=null,tcpLogs=0,ticks=0,started=now(),finished=false;
 window.log=function(message){if(blackhole&&String(message).indexOf('MOONLIGHT_STREAM')===0){tcpLogs++;throw Error('Live stream tried loader TCP logging');}return originalLog(message);};
 window.MoonlightStreamIO.create=function(transport){var io=makeIO(transport),invoke=io.io;io.io=function(op,args,heap){
  if(blackhole&&!io.isInterrupted()){if(op===4||op===5)return -11;if(op===11)return 0;}
  return invoke(op,args,heap);
 };return io;};
 window.MoonlightControllerInput.createNative=function(){var pad=makePad();return {close:function(){if(pad)pad.close();},poll:function(){
  if(forceExit)return {state:[0,0,0,0,0,0,0],exit:true};
  if(blackhole)return {state:[0,0,0,(ticks++%20),0,0,0],exit:false};
  return pad?pad.poll():null;
 }};};
 window.MoonlightStreamClient.create=function(options){var onStats=options.onStats,onStopped=options.onStopped;
  if(config.fps)options.mode=Object.assign({},options.mode,{fps:config.fps});
  options.onStats=function(stats){if(onStats)onStats(stats);if(stats.state===2&&!blackhole&&!forceExit)samples.push(stats.telemetry);if(stats.state===2&&stats.presented>10&&!armed){armed=true;
   var delay=config.measureMs||0;
   setTimeout(function(){blackhole=!healthy;},delay+500);
   setTimeout(function(){window.requestAnimationFrame=function(){return -1;};},delay+1500);
   setTimeout(function(){chordAt=now();forceExit=true;},delay+2000);
  }};
  options.onStopped=function(failure,stats){doneStats=stats;error=failure?failure.message:null;if(onStopped)onStopped(failure,stats);};
  var client=makeClient(options),stop=client.stop;client.stop=function(){if(!stopAt)stopAt=now();return stop();};return client;
 };
 function restore(){window.log=originalLog;window.requestAnimationFrame=originalRAF;window.MoonlightStreamIO.create=makeIO;window.MoonlightStreamClient.create=makeClient;window.MoonlightControllerInput.createNative=makePad;}
 async function finish(failed){if(finished)return;finished=true;var backAt=now();restore();
  var graceful=window.__moonlightStreamDiagnostics.messages.some(function(value){return value.text.indexOf('acknowledged disconnection')>=0;});
  var result={failed:!!failed||(healthy&&!graceful),healthy:healthy,error:error,blackhole:blackhole,rafSuppressed:true,chordDetectedMs:stopAt&&chordAt?stopAt-chordAt:null,returnedToGamesMs:chordAt?backAt-chordAt:null,state:doneStats&&doneStats.state,tasks:doneStats&&doneStats.tasks,tcpStreamLogs:tcpLogs,diagnosticMessages:window.__moonlightStreamDiagnostics.messages.length,gracefulDisconnect:graceful,mode:doneStats&&doneStats.mode,samples:samples};
  window.__moonlightOutageExitResult=result;
  await originalLog('MOONLIGHT_OUTAGE_EXIT_RESULT: '+JSON.stringify(result,function(k,v){return typeof v==='number'?Math.round(v*1000)/1000:v;}));
  if(window.__moonlightSimpleUI)window.__moonlightSimpleUI.close();
 }
 function check(){try{
  if(now()-started>40000+(config.measureMs||0)){finish(true);return;}
  if(!window.__moonlightSimpleUI){setTimeout(check,50);return;}
  var connect=document.getElementById('moonlight-connect');if(!connected&&connect){connected=true;connect.dispatchEvent(new Event('click'));}
  var games=document.getElementById('moonlight-games-screen'),desktop=document.querySelector('#moonlight-game-list [data-app-id="881448767"]');
  if(!launched&&games&&games.style.display==='flex'&&desktop){launched=true;desktop.dispatchEvent(new Event('click'));}
  if(chordAt&&games&&games.style.display==='flex'){
   finish(!stopAt||now()-chordAt>1000||!doneStats||doneStats.state!==0||doneStats.tasks!==0||tcpLogs!==0||!!error);return;
  }
  setTimeout(check,20);
 }catch(e){error=String(e);finish(true);}}
 setTimeout(check,100);
})();
