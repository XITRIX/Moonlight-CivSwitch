const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('stop cancels core I/O immediately, wakes the loop, and frees media only after C tasks finish',async()=>{
 let state=0,tasks=0,interrupted=false,closed=false,mediaClosed=false,stopCalls=0,ready;
 const running=new Promise(r=>ready=r),heap=new Uint8Array(1024);
 const core={HEAPU8:heap,_malloc:()=>128,_free:()=>{},lengthBytesUTF8:s=>s.length,stringToUTF8:()=>{},UTF8ToString:()=>'',_LiGetLaunchUrlQueryParameters:()=>0,
  _ml_session_start:()=>{state=2;tasks=1;return 0;},_ml_session_state:()=>state,_ml_runtime_tasks:()=>tasks,_ml_session_video_frames:()=>1,
  _ml_session_stop:()=>{assert(interrupted,'network cancellation precedes C teardown');stopCalls++;if(state===2)state=4;},
  _ml_runtime_pump:()=>{if(state===4){state=0;tasks=0;}},_ml_session_gamepad:()=>0};
 const scope={setTimeout,clearTimeout,Date,performance,Uint8Array,window:null,__moonlightStreamFactory:async()=>core,
  MoonlightTelemetry:{now:()=>performance.now(),create:()=>({sample:()=>({})}),readCore:()=>null},
  MoonlightNative:{create:()=>({})},MoonlightStreamIO:{create:()=>({stats:{},interrupt:()=>{interrupted=true;},close:()=>{assert.equal(tasks,0);assert(mediaClosed);closed=true;}})},
  MoonlightStreamMedia:{create:()=>({drainVideo:()=>{},drainAudio:()=>{},stats:()=>({}),close:()=>{assert.equal(tasks,0);mediaClosed=true;}})},
  MoonlightSessionProtocol:{create:()=>({launch:async()=>({host:'host',version:'7',url:'rtsp://host',key:new Uint8Array(16),keyId:1,codecSupport:1})})}};
 scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync('app/src/streaming/stream-client.js','utf8'),scope);
 const client=scope.MoonlightStreamClient.create({host:'host',app:{id:1},onStats:s=>{if(s.state===2)ready();}});
 const done=client.start();await running;const stopped=client.stop();assert.equal(stopped,done);assert(interrupted);assert.equal(state,4,'stop does not wait for another animation callback');
 const result=await done;assert.equal(result.error,null);assert.equal(tasks,0);assert(closed);assert(stopCalls>0);
});
