/* Own one core, native media objects, and native sockets for a stream. */
(function(global){
 "use strict";
 function createClock(){
  var pending=null,stats={frameWakes:0,timerWakes:0,forcedWakes:0,waitMs:0,maxWaitMs:0};
  function now(){return global.performance&&global.performance.now?global.performance.now():Date.now();}
  function wait(){
   if(pending)return pending.promise;
   var resolve,promise=new Promise(function(done){resolve=done;}),entry={promise:promise,frame:null,timer:null,begin:now()};pending=entry;
   entry.finish=function(reason){
    if(pending!==entry)return;pending=null;
    if(entry.frame!==null)global.cancelAnimationFrame(entry.frame);if(entry.timer!==null)clearTimeout(entry.timer);
    var elapsed=now()-entry.begin;stats.waitMs+=elapsed;stats.maxWaitMs=Math.max(stats.maxWaitMs,elapsed);stats[reason+"Wakes"]++;resolve();
   };
   var framed=typeof global.requestAnimationFrame==="function";
   // A hidden page may stop animation callbacks; keep startup/stop progressing.
   entry.timer=setTimeout(function(){entry.finish("timer");},framed?50:2);
   if(framed)entry.frame=global.requestAnimationFrame(function(){entry.finish("frame");});
   return promise;
  }
  return {wait:wait,wake:function(){if(pending)pending.finish("forced");},stats:stats};
 }
 function factory(){
  var upload=global.__moonlightStreamModuleUpload;
  if(global.__moonlightStreamFactory&&(!upload||upload.sha256===global.__moonlightStreamFactoryDigest)){if(upload)delete global.__moonlightStreamModuleUpload;return global.__moonlightStreamFactory;}
  if(!upload||upload.parts.length!==upload.count)throw Error("Streaming runtime is not loaded. Send the UI with --streaming.");
  var source=upload.parts.join("");if(source.length!==upload.length)throw Error("Incomplete streaming runtime");
  global.__moonlightStreamFactory=new Function(source+"\nreturn MoonlightStreamCore;")();global.__moonlightStreamFactoryDigest=upload.sha256;delete global.__moonlightStreamModuleUpload;return global.__moonlightStreamFactory;
 }
 function create(options){
  var signal={aborted:false},stopRequested=false,core,io,media,failure=null,done=null,startedAt=0,connectedAt=0,latestStats=null;
  var cpu=options.renderer==="png"||options.renderer==="native-texture";
  var mode=options.mode||(cpu?{width:320,height:180,fps:15,bitrate:1000}:{width:1280,height:720,fps:30,bitrate:5000});
  // Higher-rate streams need another receive/Opus turn before the next frame.
  // Keep room for rendering and input; lighter modes retain their 10 ms budget.
  var highPacketRate=!cpu&&mode.bitrate>=80000;
  var pumpBudgetMs=highPacketRate&&mode.fps===60?13.5:mode.fps===60&&(mode.width>1280||mode.height>720||mode.bitrate>=8000)?12:10;
  // At 40 Mbps, an earlier output check leaves more GPU overlap time.
  var completionBudgetMs=pumpBudgetMs===12&&mode.bitrate<40000?6:4;
  var telemetry=global.MoonlightTelemetry.create(),clock=createClock(),pumpMs=0,drainMs=0,iterations=0,maxPumpMs=0,maxDrainMs=0;
  function collect(active){
   var snapshot=Object.assign({state:core._ml_session_state(),tasks:core._ml_runtime_tasks(),mode:Object.assign({},mode),pumpBudgetMs:pumpBudgetMs,network:Object.assign({},io.stats),clock:Object.assign({},clock.stats),budgetYields:core._ml_runtime_budget_yields?core._ml_runtime_budget_yields():null,pumpMs:pumpMs,drainMs:drainMs,iterations:iterations,maxPumpMs:maxPumpMs,maxDrainMs:maxDrainMs},media.stats());
   snapshot.fec=global.MoonlightTelemetry.readFec?global.MoonlightTelemetry.readFec(core):null;
   snapshot.referenceRecovery=core._ml_session_reference_recovery?!!core._ml_session_reference_recovery():false;
   snapshot.packetPool=global.MoonlightTelemetry.readPacketPool?global.MoonlightTelemetry.readPacketPool(core):null;
   snapshot.telemetry=telemetry.sample(snapshot,active?global.MoonlightTelemetry.readCore(core):null);return snapshot;
  }
  function status(text){if(options.onStatus)options.onStatus(text);}
  function report(text){if(options.log)options.log(text);}
  function guarded(name,fallback){return function(){try{return media[name].apply(media,arguments);}catch(error){failure=error;stopRequested=true;return fallback;}};}
  // A fixed local grace lets healthy peers receive releases/disconnect. It is
  // never extended by repeated stop requests and does not await network recovery.
  function interrupt(){if(io&&io.interrupt)io.interrupt(100);if(core)core._ml_session_stop();}
  function stop(){stopRequested=true;signal.aborted=true;interrupt();clock.wake();return done;}
  async function run(){
   try{
    status("Preparing streaming runtime…");var make=factory(),transport=global.MoonlightNative.create();transport.signal=signal;
    io=global.MoonlightStreamIO.create(transport,{batchReceive:options.batchReceive,directVideoBatch:highPacketRate});
    var platform={io:io.io,receiveVideoBatch:io.receiveVideoBatch,randomFill:io.randomFill,log:report,event:function(event,a,b){
     report("Event "+event+": "+a+", "+b);
     if(event===1)status("Connecting: stage "+a+"…");
     if(event===3)failure=Error("Stream stage "+a+" failed: "+b);
     if(event===4){connectedAt=Date.now();status("Streaming "+mode.width+"×"+mode.height+" · press − and + together to exit");}
     if(event===5&&!stopRequested)failure=Error("Stream terminated: "+a);
    }};
    core=await make({moonlightPlatform:platform});
    // Reuse packet-sized allocations only at the experimental 80 Mbps rate.
    // Configure before any C tasks can borrow buffers; release after they stop.
    if(highPacketRate&&core._ml_packet_pool_configure&&core._ml_packet_pool_configure(1)!==0)throw Error("Cannot prepare packet buffer pool");
    if(highPacketRate&&core._ml_fec_prepare_pair){
     status("Preparing packet recovery…");
     for(var coefficient=0;coefficient<256;coefficient++){
      if(stopRequested)return;
      if(core._ml_fec_prepare_pair(coefficient)!==0)throw Error("Cannot prepare packet recovery");
      // Each coefficient is bounded; keep cancellation and UI input responsive.
      if((coefficient&1)===1)await new Promise(function(resolve){setTimeout(resolve,0);});
     }
    }
    if(highPacketRate&&core._ml_session_set_reference_recovery&&core._ml_session_set_reference_recovery(1)!==0)throw Error("Cannot prepare reference recovery");
    if(io.attachCore)io.attachCore(core);
    if(highPacketRate&&core._ml_video_batch_configure&&core._ml_video_batch_configure(1)!==0)throw Error("Cannot prepare direct video receive");
    if(global.MoonlightNativeTexture&&options.renderer==="native-texture"){status("Preparing native video colors…");await global.MoonlightNativeTexture.prepare();if(stopRequested)return;}
    media=global.MoonlightStreamMedia.create(io,core,{onStatus:status,onImage:options.onImage,canPresent:options.canPresent,renderer:options.renderer,synchronousGpu:options.synchronousGpu,smoothVideo:mode.videoPacing!=="latency"});
    platform.videoSetup=guarded("videoSetup",-1);platform.videoFrame=guarded("videoFrame",-1);
    platform.audioSetup=guarded("audioSetup",-1);platform.audioFrame=guarded("audioFrame",undefined);
    status("Starting application on Sunshine…");
    var session=await global.MoonlightSessionProtocol.create(transport).launch(options.host,options.app.id,mode,core.UTF8ToString(core._LiGetLaunchUrlQueryParameters()));
    if(stopRequested)return;
    var pointers=[];function string(text){var size=core.lengthBytesUTF8(text)+1,p=core._malloc(size);if(!p)throw Error("Core allocation failed");pointers.push(p);core.stringToUTF8(text,p,size);return p;}
    try{
     var key=core._malloc(16);if(!key)throw Error("Core allocation failed");pointers.push(key);core.HEAPU8.set(session.key,key);
     var result=core._ml_session_start(string(session.host),string(session.version),string(session.url),key,session.keyId,mode.width,mode.height,mode.fps,mode.bitrate,session.codecSupport);
     if(result)throw Error("Cannot start core: "+result);
    }finally{session.key.fill(0);for(var p of pointers)core._free(p);}
    startedAt=Date.now();var lastStats=0;
    while(!stopRequested){
     await clock.wait();if(stopRequested)break;
     // Queue video early and service the core while its GPU copy completes.
     // A nonblocking fence check publishes once; pending work keeps its slot.
     // At 40 Mbps, an empty early drain gets one retry after the first pump. Final fence
     // queries may use up to 3 ms of remaining frame headroom.
     var begin=global.MoonlightTelemetry.now(),videoOccupied=media.drainVideo();var early=global.MoonlightTelemetry.now();
     core._ml_runtime_pump(completionBudgetMs);var pumpedEarly=global.MoonlightTelemetry.now();media.finishVideo();if(!videoOccupied&&mode.bitrate>=40000)media.drainVideo();var finishedEarly=global.MoonlightTelemetry.now();
     core._ml_runtime_pump(pumpBudgetMs-completionBudgetMs);var pumped=global.MoonlightTelemetry.now();media.finishVideo(Math.min(begin+pumpBudgetMs+2,global.MoonlightTelemetry.now()+3));media.drainAudio();var drained=global.MoonlightTelemetry.now();
     var pumpElapsed=pumpedEarly-early+pumped-finishedEarly,drainElapsed=early-begin+finishedEarly-pumpedEarly+drained-pumped;
     pumpMs+=pumpElapsed;drainMs+=drainElapsed;maxPumpMs=Math.max(maxPumpMs,pumpElapsed);maxDrainMs=Math.max(maxDrainMs,drainElapsed);iterations++;
     if(failure)throw failure;
     if(core._ml_session_state()===3)throw Error("Core connection failed: "+core._ml_session_error());
     if(!connectedAt&&Date.now()-startedAt>25000)throw Error("Stream connection timed out");
     if(connectedAt&&!core._ml_session_video_frames()&&Date.now()-connectedAt>12000)throw Error("No decodable video arrived");
     if(options.durationMs&&Date.now()-startedAt>=options.durationMs)stopRequested=true;
     if(Date.now()-lastStats>=1000){latestStats=collect(core._ml_session_state()===2);if(options.onStats)options.onStats(latestStats);lastStats=Date.now();}
    }
    if(failure)throw failure;
   }catch(error){if(!signal.aborted||failure){failure=failure||error;if(options.onError)options.onError(failure);}}
   finally{
    if(core){
     interrupt();
     status("Stopping stream…");var deadline=Date.now()+15000;
     // Cleanup must progress even if rendering callbacks have stopped. A short
     // timer also avoids spending the shutdown grace on the frame watchdog.
     while((core._ml_session_state()!==0||core._ml_runtime_tasks())&&Date.now()<deadline){core._ml_session_stop();core._ml_runtime_pump(10);await new Promise(function(resolve){setTimeout(resolve,0);});}
     if(core._ml_runtime_tasks()){
      // Never free buffers still referenced by a suspended C task.
      failure=failure||Error("Core cleanup timed out; restart Civ VII before reusing streaming");report(failure.message);
      global.__moonlightStreamUnfinished={core:core,io:io,media:media};
     }else{try{if(media){latestStats=collect(false);media.close();}if(core._ml_packet_pool_configure&&core._ml_packet_pool_configure(0)!==0)throw Error("Packet pool still owns live buffers");if(core._ml_fec_prepare_pair&&core._ml_fec_prepare_pair(-1)!==0)throw Error("Recovery tables still in use");if(latestStats&&global.MoonlightTelemetry.readPacketPool)latestStats.packetPool=global.MoonlightTelemetry.readPacketPool(core);if(io)io.close();}catch(error){failure=failure||error;report(error.message);global.__moonlightStreamUnfinished={core:core,io:io,media:media};}}
    }else if(io)io.close();
    if(options.onStopped)options.onStopped(failure,latestStats);
   }
   return {error:failure,stats:latestStats};
  }
  function start(){if(!done){if(global.__moonlightStreamUnfinished)throw Error("Restart Civ VII to clear the previous stream");done=run();}return done;}
  return {start:start,stop:stop,gamepad:function(buttons,lt,rt,lx,ly,rx,ry){if(core&&core._ml_session_state()===2)return core._ml_session_gamepad(buttons,lt,rt,lx,ly,rx,ry);return -1;},key:function(code,down,modifiers){if(core&&core._ml_session_state()===2)return core._ml_session_key(code,down?1:0,modifiers||0);return -1;},stats:function(){return latestStats;}};
 }
 global.MoonlightStreamClient={create:create,createClock:createClock};
})(window);
