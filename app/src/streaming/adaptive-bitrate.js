/* Downward-only Auto bitrate through fully owned, sequential stream sessions. */
(function(g){
 "use strict";
 // Auto only backs off; clean playback never triggers a reconnect.
 function createPolicy(initial,fps){
  var current=initial,sessionAt=null,previous=null,window=[],noVideoSeconds=0;
  function start(kbps){current=kbps;sessionAt=null;previous=null;window=[];noVideoSeconds=0;}
  function observe(stats,time,allowed){
   var t=stats.telemetry||{},noVideo=t.textureFps===0;
   var values=[time,t.textureFps,stats.stallsOver100Ms,stats.stallsOver250Ms];
   if(!values.every(function(v){return Number.isFinite(v)&&v>=0;})){previous=null;window=[];noVideoSeconds=0;return null;}
   // Startup before the first delivered picture is handled by the connection
   // watchdog, not by guessing that a lower bitrate would fix it.
   if(sessionAt===null){if(noVideo)return null;sessionAt=time;}
   var next={time:time,large:stats.stallsOver100Ms,severe:stats.stallsOver250Ms};
   var old=previous;previous=next;
   if(!old||time<=old.time||time-old.time>2500||allowed===false){window=[];noVideoSeconds=0;if(allowed===false)previous=null;return null;}
   var seconds=(time-old.time)/1000;if(seconds<.9||time-sessionAt<5000)return null;
   var large=Math.max(0,next.large-old.large),severe=Math.max(0,next.severe-old.severe);
   noVideoSeconds=noVideo?noVideoSeconds+seconds:0;
   window.push({time:time,gaps:large});window=window.filter(function(s){return time-s.time<10000;});
   var repeated=window.reduce(function(sum,s){return sum+s.gaps;},0);
   // Queue-empty audio sampling, network loss, RTT, rejected input and low but
   // steady FPS cannot establish a visible video stall. Never back off on them.
   if(severe>0||repeated>=3||noVideoSeconds>=2){
    var to=Math.max(Math.min(initial,5000),Math.floor(current*.75/100)*100);
    if(to>=current)return null;
    return {direction:'down',reason:severe?'long-video-gap':noVideoSeconds>=2?'video-freeze':'repeated-video-gaps',from:current,to:to,time:time,
     trigger:{gapsOver250Ms:severe,gapsOver100MsIn10Seconds:repeated,noVideoSeconds:noVideoSeconds}};
   }
   return null;
  }
  return {start:start,observe:observe,state:function(){return {currentKbps:current,ceilingKbps:initial,upwardProbing:false};}};
 }
 function create(options,makeClient){
  var automatic=g.MoonlightSettings.resolveBitrate(options.mode),child=null,done=null,stopped=false,pending=null,latest=null,reconnects=0,lastDecision=null;
  var policy=createPolicy(automatic,options.mode.fps),nextKbps=automatic,decisions=[];
  function stop(){stopped=true;pending=null;if(child)child.stop();return done;}
  async function run(){
   var result=null,started=Date.now();
   do{
    pending=null;
    var kbps=nextKbps;
    var mode=Object.assign({},options.mode,{bitrate:kbps}),lastSample=null;
    policy.start(kbps,g.MoonlightTelemetry.now());
    child=makeClient(Object.assign({},options,{mode:mode,onStopped:undefined,
     durationMs:options.durationMs?Math.max(1,options.durationMs-(Date.now()-started)):undefined,
     onStats:function(stats){
      latest=stats;stats.bitrateAdaptation=Object.assign({mode:"auto",automaticKbps:automatic,reconnects:reconnects,lastDecision:lastDecision,decisions:decisions.slice()},policy.state());
      var t=stats.telemetry||{},time=g.MoonlightTelemetry.now();
      if(!stopped&&!pending&&stats.state===2&&(lastSample===null||time-lastSample>=900)){
       lastSample=time;
       var decision=policy.observe(stats,time,!options.canAdapt||options.canAdapt());
       if(decision){
        pending=decision;lastDecision=decision;nextKbps=decision.to;
        decisions.push(decision);if(decisions.length>32)decisions.shift();
        if(options.onReconnect)options.onReconnect(decision);
        if(options.onStatus)options.onStatus("Reducing bitrate to "+decision.to/1000+" Mbps…");
        child.stop();
       }
      }
      if(options.onStats)options.onStats(stats);
     }}));
    result=await child.start();
    // A completed stop owns all teardown. Never replace quarantined resources,
    // or reopen after the user exits during that asynchronous cleanup.
    if(stopped||!pending||!result||result.error||g.__moonlightStreamUnfinished)break;
    if(options.durationMs&&Date.now()-started>=options.durationMs)break;
    reconnects++;
   }while(!stopped);
   if(options.onStopped)options.onStopped(result&&result.error,result&&result.stats);
   return result;
  }
  var api={start:function(){if(!done&&!stopped)done=run();return done;},stop:stop,stats:function(){return latest;}};
  for(var method of ["gamepad","key","mouseMove","mouseButton","mouseScroll","touch","resetPointer","resetKeys"])(function(name){api[name]=function(){return child&&!stopped?child[name].apply(child,arguments):-1;};})(method);
  return api;
 }
 g.MoonlightAdaptiveBitrate={create:create,createPolicy:createPolicy};
})(window);
