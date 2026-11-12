const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('stop cancels core I/O immediately, wakes the loop, and frees media only after C tasks finish',async()=>{
 let state=0,tasks=0,interrupted=false,closed=false,mediaClosed=false,stopCalls=0,ready,platform;const rumble=[],scroll=[];
 const running=new Promise(r=>ready=r),heap=new Uint8Array(1024);
 const core={HEAPU8:heap,_malloc:()=>128,_free:()=>{},lengthBytesUTF8:s=>s.length,stringToUTF8:()=>{},UTF8ToString:()=>'',_LiGetLaunchUrlQueryParameters:()=>0,
  _ml_session_set_rumble:enabled=>{assert.equal(enabled,1);assert.equal(state,0);return 0;},
  _ml_session_start:()=>{state=2;tasks=1;platform.rumble(0,65535,32768);return 0;},_ml_session_state:()=>state,_ml_runtime_tasks:()=>tasks,_ml_session_video_frames:()=>1,
  _ml_session_stop:()=>{assert(interrupted,'network cancellation precedes C teardown');stopCalls++;if(state===2)state=4;},
  _ml_runtime_pump:()=>{if(state===4){platform.rumble(0,123,456);state=0;tasks=0;}},_ml_session_gamepad:()=>0,_ml_session_mouse_scroll:(...args)=>{scroll.push(args);return -2;}};
 const scope={setTimeout,clearTimeout,Date,performance,Uint8Array,window:null,__moonlightStreamFactory:async options=>{platform=options.moonlightPlatform;return core;},
  MoonlightTelemetry:{now:()=>performance.now(),create:()=>({sample:()=>({})}),readCore:()=>null},
  MoonlightNative:{create:()=>({})},MoonlightStreamIO:{create:()=>({stats:{},interrupt:()=>{interrupted=true;},close:()=>{assert.equal(tasks,0);assert(mediaClosed);closed=true;}})},
  MoonlightStreamMedia:{create:()=>({drainVideo:()=>{},finishVideo:()=>{},drainAudio:()=>{},stats:()=>({}),close:async()=>{assert.equal(tasks,0);await new Promise(r=>setTimeout(r,5));mediaClosed=true;}})},
  MoonlightSessionProtocol:{create:()=>({launch:async()=>({host:'host',version:'7',url:'rtsp://host',key:new Uint8Array(16),keyId:1,codecSupport:1})})}};
 scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync('app/src/streaming/stream-client.js','utf8'),scope);
 const client=scope.MoonlightStreamClient.create({renderer:'native-gpu-texture',host:'host',app:{id:1},onRumble:(...args)=>rumble.push(args),onStats:s=>{if(s.state===2)ready();}});
 assert.equal(client.mouseScroll(0,120),-1);
 const done=client.start();await running;assert.equal(client.mouseScroll(5,-120),-2);assert.deepEqual(scroll,[[5,-120]],'scroll forwards wheel units and queue rejection');
 const stopped=client.stop();assert.equal(client.mouseScroll(0,120),-1);assert.equal(scroll.length,1);assert.equal(stopped,done);assert(interrupted);assert.equal(state,4,'stop does not wait for another animation callback');
 const result=await done;assert.equal(result.error,null);assert.equal(tasks,0);assert(closed);assert(stopCalls>0);assert.deepEqual(rumble,[[0,65535,32768],[0,0,0]],"rumble is silenced on teardown and late core callbacks are suppressed");
});

async function failVideoStartup(nativeError){
 let state=0,tasks=0,platform,mediaClosed=false,ioClosed=false,observed;
 const heap=new Uint8Array(1024),messages=[];
 const core={HEAPU8:heap,_malloc:()=>128,_free(){},lengthBytesUTF8:s=>s.length,stringToUTF8(){},UTF8ToString:()=>'',_LiGetLaunchUrlQueryParameters:()=>0,
  _ml_session_start:()=>{state=1;tasks=1;return 0;},_ml_session_state:()=>state,_ml_runtime_tasks:()=>tasks,_ml_session_video_frames:()=>0,
  _ml_session_stop:()=>{state=0;tasks=0;},
  _ml_runtime_pump:()=>{if(state!==1)return;platform.event(1,9,0);assert.equal(platform.videoSetup(1,1280,720,60),-1);platform.event(3,9,-1);platform.event(5,-1,0);state=3;tasks=0;}};
 const scope={setTimeout,clearTimeout,Date,performance,Uint8Array,window:null,
  __moonlightStreamFactory:async options=>{platform=options.moonlightPlatform;return core;},
  MoonlightTelemetry:{now:()=>performance.now(),create:()=>({sample:()=>({})}),readCore:()=>null},
  MoonlightNative:{create:()=>({})},MoonlightStreamIO:{create:()=>({stats:{},interrupt(){},close(){assert.equal(tasks,0);assert(mediaClosed);ioClosed=true;}})},
  MoonlightStreamMedia:{create:()=>({videoSetup(){if(nativeError)throw nativeError;return -1;},drainVideo(){},finishVideo(){},drainAudio(){},stats:()=>({}),close(){assert.equal(tasks,0);mediaClosed=true;}})},
  MoonlightSessionProtocol:{create:()=>({launch:async()=>({host:'host',version:'7',url:'rtsp://host',key:new Uint8Array(16),keyId:1,codecSupport:1})})}};
 scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync('app/src/streaming/stream-client.js','utf8'),scope);
 const result=await scope.MoonlightStreamClient.create({renderer:'native-gpu-texture',host:'host',app:{id:1},mode:{width:1280,height:720,fps:60,bitrate:5000},log:message=>messages.push(message),onError:error=>{observed=error;}}).start();
 assert(mediaClosed);assert(ioClosed);assert.equal(observed,result.error);
 return {result,messages};
}

test('native video setup errors survive generic stage failure and connection termination',async()=>{
 const cause=Error('Unsupported GPU sync ABI');
 const {result,messages}=await failVideoStartup(cause);
 assert.equal(result.error,cause);
 assert(messages.some(message=>message.includes(cause.message)));
});

test('video startup failures retain their stage when no native exception is available',async()=>{
 const {result}=await failVideoStartup(null);
 assert.equal(result.error.message,'Video startup failed: -1');
});
