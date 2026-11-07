/* Own one core, native media objects, and native sockets for a stream. */
(function(global){
 "use strict";
 function factory(){
  if(global.__moonlightStreamFactory)return global.__moonlightStreamFactory;
  var upload=global.__moonlightStreamModuleUpload;if(!upload||upload.parts.length!==upload.count)throw Error("Streaming runtime is not loaded. Send the UI with --streaming.");
  var source=upload.parts.join("");if(source.length!==upload.length)throw Error("Incomplete streaming runtime");
  global.__moonlightStreamFactory=new Function(source+"\nreturn MoonlightStreamCore;")();delete global.__moonlightStreamModuleUpload;return global.__moonlightStreamFactory;
 }
 function create(options){
  var signal={aborted:false},stopRequested=false,core,io,media,failure=null,done=null,startedAt=0,connectedAt=0,latestStats=null;
  var cpu=options.renderer==="png"||options.renderer==="native-texture";
  var mode=options.mode||(cpu?{width:320,height:180,fps:15,bitrate:1000}:{width:1280,height:720,fps:30,bitrate:5000});
  function status(text){if(options.onStatus)options.onStatus(text);}
  function report(text){if(options.log)options.log(text);}
  function guarded(name,fallback){return function(){try{return media[name].apply(media,arguments);}catch(error){failure=error;stopRequested=true;return fallback;}};}
  function stop(){stopRequested=true;signal.aborted=true;return done;}
  async function run(){
   try{
    status("Preparing streaming runtime…");var make=factory(),transport=global.MoonlightNative.create();transport.signal=signal;
    io=global.MoonlightStreamIO.create(transport);
    var platform={io:io.io,randomFill:io.randomFill,log:report,event:function(event,a,b){
     report("Event "+event+": "+a+", "+b);
     if(event===1)status("Connecting: stage "+a+"…");
     if(event===3)failure=Error("Stream stage "+a+" failed: "+b);
     if(event===4){connectedAt=Date.now();status("Streaming "+mode.width+"×"+mode.height+" · press − and + together to exit");}
     if(event===5&&!stopRequested)failure=Error("Stream terminated: "+a);
    }};
    core=await make({moonlightPlatform:platform});
    if(global.MoonlightNativeTexture&&options.renderer==="native-texture"){status("Preparing native video colors…");await global.MoonlightNativeTexture.prepare();if(stopRequested)return;}
    media=global.MoonlightStreamMedia.create(io,core,{onStatus:status,onImage:options.onImage,canPresent:options.canPresent,renderer:options.renderer});
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
     core._ml_runtime_pump(5);media.drainVideo();
     if(failure)throw failure;
     if(core._ml_session_state()===3)throw Error("Core connection failed: "+core._ml_session_error());
     if(!connectedAt&&Date.now()-startedAt>25000)throw Error("Stream connection timed out");
     if(connectedAt&&!core._ml_session_video_frames()&&Date.now()-connectedAt>12000)throw Error("No decodable video arrived");
     if(options.durationMs&&Date.now()-startedAt>=options.durationMs)stopRequested=true;
     if(Date.now()-lastStats>=2000){latestStats=Object.assign({state:core._ml_session_state(),tasks:core._ml_runtime_tasks(),network:Object.assign({},io.stats)},media.stats());if(options.onStats)options.onStats(latestStats);lastStats=Date.now();}
     await new Promise(function(resolve){setTimeout(resolve,2);});
    }
    if(failure)throw failure;
   }catch(error){if(!signal.aborted||failure){failure=failure||error;if(options.onError)options.onError(failure);}}
   finally{
    if(core){
     status("Stopping stream…");var deadline=Date.now()+15000;
     while((core._ml_session_state()!==0||core._ml_runtime_tasks())&&Date.now()<deadline){core._ml_session_stop();core._ml_runtime_pump(5);await new Promise(function(resolve){setTimeout(resolve,2);});}
     if(core._ml_runtime_tasks()){
      // Never free buffers still referenced by a suspended C task.
      failure=failure||Error("Core cleanup timed out; restart Civ VII before reusing streaming");report(failure.message);
      global.__moonlightStreamUnfinished={core:core,io:io,media:media};
     }else{if(media){latestStats=Object.assign({},latestStats,{state:core._ml_session_state(),tasks:core._ml_runtime_tasks(),network:Object.assign({},io.stats)},media.stats());media.close();}if(io)io.close();}
    }else if(io)io.close();
    if(options.onStopped)options.onStopped(failure,latestStats);
   }
   return {error:failure,stats:latestStats};
  }
  function start(){if(!done){if(global.__moonlightStreamUnfinished)throw Error("Restart Civ VII to clear the previous stream");done=run();}return done;}
  return {start:start,stop:stop,gamepad:function(buttons,lt,rt,lx,ly,rx,ry){if(core&&core._ml_session_state()===2)return core._ml_session_gamepad(buttons,lt,rt,lx,ly,rx,ry);return -1;},key:function(code,down,modifiers){if(core&&core._ml_session_state()===2)return core._ml_session_key(code,down?1:0,modifiers||0);return -1;},stats:function(){return latestStats;}};
 }
 global.MoonlightStreamClient={create:create};
})(window);
