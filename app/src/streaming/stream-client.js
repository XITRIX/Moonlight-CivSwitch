/* Own one core, native media objects, and native sockets for a stream. */
(function(global){
 "use strict";
 function createClock(options){
  var pending=null,stats={frameWakes:0,timerWakes:0,forcedWakes:0,serviceWakes:0,waitMs:0,maxWaitMs:0};
  function now(){return global.performance&&global.performance.now?global.performance.now():Date.now();}
  function wait(service){
   if(pending)return pending.promise;
   var resolve,reject,promise=new Promise(function(done,fail){resolve=done;reject=fail;}),entry={promise:promise,frame:null,timer:null,serviceTimer:null,begin:now()};pending=entry;
   entry.finish=function(reason,error){
    if(pending!==entry)return;pending=null;
    if(entry.frame!==null)global.cancelAnimationFrame(entry.frame);if(entry.timer!==null)clearTimeout(entry.timer);
    if(entry.serviceTimer!==null)clearTimeout(entry.serviceTimer);
    var elapsed=now()-entry.begin;stats.waitMs+=elapsed;stats.maxWaitMs=Math.max(stats.maxWaitMs,elapsed);stats[reason+"Wakes"]++;if(error)reject(error);else resolve();
   };
   var framed=!(options&&options.nativeDisplay)&&typeof global.requestAnimationFrame==="function";
   // A hidden page may stop animation callbacks; keep startup/stop progressing.
   entry.timer=setTimeout(function(){entry.finish("timer");},framed?50:2);
   if(framed)entry.frame=global.requestAnimationFrame(function(){entry.finish("frame");});
   // One bounded receive/audio turn can use otherwise idle time. Keep the same
   // pending display callback; this timer never presents video or rearms itself.
   if(framed&&service)entry.serviceTimer=setTimeout(function(){
    entry.serviceTimer=null;if(pending!==entry)return;stats.serviceWakes++;
    try{service();}catch(error){entry.finish("forced",error);}
   },4);
   return promise;
  }
  return {wait:wait,wake:function(){if(pending)pending.finish("forced");},stats:stats};
 }
 function factory(){
  var upload=global.__moonlightStreamModuleUpload;
  if(global.__moonlightStreamFactory&&(!upload||upload.sha256===global.__moonlightStreamFactoryDigest)){if(upload)delete global.__moonlightStreamModuleUpload;return global.__moonlightStreamFactory;}
  if(!upload||upload.parts.length!==upload.count)throw Error("Streaming runtime is not loaded. Resend the app without --no-streaming.");
  var source=upload.parts.join("");if(source.length!==upload.length)throw Error("Incomplete streaming runtime");
  global.__moonlightStreamFactory=new Function(source+"\nreturn MoonlightStreamCore;")();global.__moonlightStreamFactoryDigest=upload.sha256;delete global.__moonlightStreamModuleUpload;return global.__moonlightStreamFactory;
 }
 function createRumbleOutput(output,now){
  var pending=false,low=0,high=0,nextUpdate=0,stopped=false,failed=false;
  var stats={events:0,coalesced:0,updates:0,totalMs:0,maxMs:0,errors:0};
  function send(low,high){
   var begin=now();
   try{output(0,low,high);}catch(error){stats.errors++;failed=true;}
   var elapsed=Math.max(0,now()-begin);stats.totalMs+=elapsed;stats.maxMs=Math.max(stats.maxMs,elapsed);stats.updates++;
  }
  return {stats:stats,queue:function(controller,newLow,newHigh){
   if(stopped||failed||!output||controller!==0)return;
   stats.events++;if(pending)stats.coalesced++;
   low=newLow;high=newHigh;pending=true;
  },flush:function(){
   if(stopped||failed||!pending)return;
   // Zero strength must not wait behind the update-rate cap.
   if((low||high)&&now()<nextUpdate)return;
   pending=false;send(low,high);nextUpdate=now()+1000/30;
  },stop:function(){if(stopped)return;pending=false;stopped=true;if(output)send(0,0);}};
 }
 function create(options){
  var signal={aborted:false},stopRequested=false,core,io,media,failure=null,done=null,startedAt=0,connectedAt=0,latestStats=null;
  var cpu=options.renderer==="png"||options.renderer==="native-texture";
  var mode=options.mode||(cpu?{width:320,height:180,fps:15,bitrate:1000}:{width:1280,height:720,fps:60,bitrate:20000});
  var nativeDisplay=!options.renderer||options.renderer==="native-vulkan";
  // Higher-rate streams need another receive/Opus turn before the next frame.
  // Keep room for rendering and input; lighter modes retain their 10 ms budget.
  // Loss recovery is also needed during busy 40–70 Mbps gameplay. Reserving
  // this path for 80 Mbps left lower settings waiting for repeated IDRs.
  var highPacketRate=!cpu&&mode.bitrate>=40000;
  var pumpBudgetMs=highPacketRate&&mode.bitrate>=80000&&mode.fps===60?13.5:mode.fps===60&&(mode.width>1280||mode.height>720||mode.bitrate>=8000)?12:10;
  if(nativeDisplay&&mode.fps>60)pumpBudgetMs=5;
  // At 40 Mbps, an earlier output check leaves more GPU overlap time.
  var completionBudgetMs=pumpBudgetMs===12&&mode.bitrate<40000?6:4;
  var telemetry=global.MoonlightTelemetry.create(),clock=createClock({nativeDisplay:nativeDisplay}),pumpMs=0,drainMs=0,iterations=0,maxPumpMs=0,maxDrainMs=0;
  var serviceIterations=0,servicePumpMs=0,serviceDrainMs=0,maxServiceMs=0,waitBudgetMs=0;
  function serviceBetweenFrames(){
   if(stopRequested||failure||core._ml_session_state()!==2)return;
   var begin=global.MoonlightTelemetry.now();core._ml_runtime_pump(2);var pumped=global.MoonlightTelemetry.now();media.drainAudio();var drained=global.MoonlightTelemetry.now();
   serviceIterations++;servicePumpMs+=pumped-begin;serviceDrainMs+=drained-pumped;maxServiceMs=Math.max(maxServiceMs,drained-begin);
   // Charge at least the requested slice, including any observed native-call
   // overrun, against the following display tick. Never create extra CPU budget.
   waitBudgetMs=Math.max(2,drained-begin);
   if(failure)throw failure;
   if(core._ml_session_state()===3)throw Error("Core connection failed: "+core._ml_session_error());
  }
  var rumble=createRumbleOutput(mode.rumble!==false&&typeof options.onRumble==="function"?options.onRumble:null,global.MoonlightTelemetry.now);
  var inputStats={gamepadQueued:0,gamepadRejected:0};
  function collect(active){
   var snapshot=Object.assign({state:core._ml_session_state(),tasks:core._ml_runtime_tasks(),mode:Object.assign({},mode),pumpBudgetMs:pumpBudgetMs,network:Object.assign({},io.stats),clock:Object.assign({},clock.stats),budgetYields:core._ml_runtime_budget_yields?core._ml_runtime_budget_yields():null,pumpMs:pumpMs,drainMs:drainMs,iterations:iterations,maxPumpMs:maxPumpMs,maxDrainMs:maxDrainMs},media.stats());
   snapshot.fec=global.MoonlightTelemetry.readFec?global.MoonlightTelemetry.readFec(core):null;
   snapshot.referenceRecovery=core._ml_session_reference_recovery?!!core._ml_session_reference_recovery():false;
   snapshot.packetPool=global.MoonlightTelemetry.readPacketPool?global.MoonlightTelemetry.readPacketPool(core):null;
   snapshot.input=Object.assign({},inputStats);
   snapshot.rumble=Object.assign({},rumble.stats);
   Object.assign(snapshot,{serviceIterations:serviceIterations,servicePumpMs:servicePumpMs,serviceDrainMs:serviceDrainMs,maxServiceMs:maxServiceMs});
   snapshot.telemetry=telemetry.sample(snapshot,active?global.MoonlightTelemetry.readCore(core):null);return snapshot;
  }
  function status(text){if(options.onStatus)options.onStatus(text);}
  function report(text){if(options.log)options.log(text);}
  function guarded(name,fallback){return function(){try{return media[name].apply(media,arguments);}catch(error){failure=failure||error;stopRequested=true;report("Native "+name+" failed: "+error.message);return fallback;}};}
  function stageName(stage){return ["","Platform initialization","Host resolution","Audio initialization","RTSP handshake","Control initialization","Video initialization","Input initialization","Control startup","Video startup","Audio startup","Input startup"][stage]||"Stream stage "+stage;}
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
     if(event===1)status("Connecting: "+stageName(a)+"…");
     // Native callbacks return -1 after recording their actual exception. Keep
     // that cause instead of replacing it with the C stage's generic result.
     if(event===3)failure=failure||Error(stageName(a)+" failed: "+b);
     if(event===4){connectedAt=Date.now();status("Streaming "+mode.width+"×"+mode.height+" · press − and + together to "+(nativeDisplay?"disconnect":"exit"));}
     if(event===5&&!stopRequested)failure=failure||Error("Stream terminated: "+a);
    }};
    core=await make({moonlightPlatform:platform});
    if(core._ml_session_set_video_format){if(core._ml_session_set_video_format(mode.codec==="av1"?0x1000:1)!==0)throw Error("Cannot prepare the requested video codec");}
    else if(mode.codec==="av1")throw Error("Rebuild the streaming runtime for AV1");
    // C callbacks only retain the latest levels; native HID calls run after media.
    platform.rumble=function(controller,low,high){if(!stopRequested)rumble.queue(controller,low,high);};
    if(core._ml_session_set_rumble&&core._ml_session_set_rumble(mode.rumble!==false&&typeof options.onRumble==="function"?1:0)!==0)throw Error("Cannot prepare controller rumble");
    // Reuse packet-sized allocations at high packet rates.
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
    var mediaOptions={onStatus:status,onImage:options.onImage,canPresent:options.canPresent,renderer:options.renderer,synchronousGpu:options.synchronousGpu,smoothVideo:mode.videoPacing!=="latency",mode:mode,onPresented:options.onPresented,report:function(value){report("NATIVE "+JSON.stringify(value));}};
    media=nativeDisplay?await global.MoonlightNativeVideo.createMedia(io,core,mediaOptions):global.MoonlightStreamMedia.create(io,core,mediaOptions);
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
     waitBudgetMs=0;await clock.wait(cpu?null:serviceBetweenFrames);if(stopRequested)break;
     if(media.prepareVideo)await media.prepareVideo();
     // Queue video early and service the core while its GPU copy completes.
     // A nonblocking fence check publishes once; pending work keeps its slot.
     // At 40 Mbps, an empty early drain gets one retry after the first pump. Final fence
     // queries may use up to 3 ms of remaining frame headroom.
     var frameBudgetMs=Math.max(0,pumpBudgetMs-waitBudgetMs),firstBudgetMs=Math.min(completionBudgetMs,frameBudgetMs);
     var begin=global.MoonlightTelemetry.now(),videoOccupied=media.drainVideo();var early=global.MoonlightTelemetry.now();
     if(firstBudgetMs>0)core._ml_runtime_pump(firstBudgetMs);var pumpedEarly=global.MoonlightTelemetry.now();media.finishVideo();if(!videoOccupied&&mode.bitrate>=40000)media.drainVideo();var finishedEarly=global.MoonlightTelemetry.now();
     if(frameBudgetMs>firstBudgetMs)core._ml_runtime_pump(frameBudgetMs-firstBudgetMs);var pumped=global.MoonlightTelemetry.now();media.finishVideo(Math.min(begin+frameBudgetMs+2,global.MoonlightTelemetry.now()+3));media.drainAudio();var drained=global.MoonlightTelemetry.now();
     var pumpElapsed=pumpedEarly-early+pumped-finishedEarly,drainElapsed=early-begin+finishedEarly-pumpedEarly+drained-pumped;
     pumpMs+=pumpElapsed;drainMs+=drainElapsed;maxPumpMs=Math.max(maxPumpMs,pumpElapsed);maxDrainMs=Math.max(maxDrainMs,drainElapsed);iterations++;
     rumble.flush();
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
    stopRequested=true;
    rumble.stop();
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
     }else{try{if(media){latestStats=collect(false);await media.close();}if(core._ml_packet_pool_configure&&core._ml_packet_pool_configure(0)!==0)throw Error("Packet pool still owns live buffers");if(core._ml_fec_prepare_pair&&core._ml_fec_prepare_pair(-1)!==0)throw Error("Recovery tables still in use");if(latestStats&&global.MoonlightTelemetry.readPacketPool)latestStats.packetPool=global.MoonlightTelemetry.readPacketPool(core);if(io)io.close();}catch(error){failure=failure||error;report(error.message);global.__moonlightStreamUnfinished={core:core,io:io,media:media};}}
    }else if(io)io.close();
    if(options.onStopped)options.onStopped(failure,latestStats);
   }
   return {error:failure,stats:latestStats};
  }
  function start(){if(!done){if(global.__moonlightStreamUnfinished)throw Error("Restart Civ VII to clear the previous stream");done=run();}return done;}
  return {start:start,stop:stop,gamepad:function(buttons,lt,rt,lx,ly,rx,ry){var result=core&&core._ml_session_state()===2?core._ml_session_gamepad(buttons,lt,rt,lx,ly,rx,ry):-1;if(result===0)inputStats.gamepadQueued++;else inputStats.gamepadRejected++;return result;},key:function(code,down,modifiers){if(core&&core._ml_session_state()===2)return core._ml_session_key(code,down?1:0,modifiers||0);return -1;},
   mouseMove:function(dx,dy){return core&&!stopRequested&&core._ml_session_state()===2?core._ml_session_mouse_move(dx,dy):-1;},
   mouseButton:function(button,down){return core&&!stopRequested&&core._ml_session_state()===2?core._ml_session_mouse_button(button,down?1:0):-1;},
   mouseScroll:function(horizontal,vertical){return core&&!stopRequested&&core._ml_session_state()===2?core._ml_session_mouse_scroll(horizontal,vertical):-1;},
   touch:function(action,id,x,y){return core&&!stopRequested&&core._ml_session_state()===2?core._ml_session_touch(action,id,x,y):-1;},
   resetPointer:function(){return core&&core._ml_session_state()===2?core._ml_session_pointer_reset():-1;},
   resetKeys:function(){return core&&core._ml_session_state()===2?core._ml_session_keys_reset():-1;},
   stats:function(){return latestStats;}};
 }
 global.MoonlightStreamClient={create:create,createClock:createClock,createRumbleOutput:createRumbleOutput};
})(window);
