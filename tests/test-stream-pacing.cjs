const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

async function runTick(failVideo=false){
 let time=0,state=0,tasks=0,client,closed=0,interrupted=false;
 const order=[],heap=new Uint8Array(1024);
 const core={HEAPU8:heap,_malloc:()=>128,_free(){},lengthBytesUTF8:s=>s.length,stringToUTF8(){},UTF8ToString:()=>'',_LiGetLaunchUrlQueryParameters:()=>0,
  _ml_session_start:()=>{state=2;tasks=1;return 0;},_ml_session_state:()=>state,_ml_runtime_tasks:()=>tasks,_ml_session_video_frames:()=>1,
  _ml_session_stop:()=>{assert(interrupted);state=4;},
  _ml_runtime_pump:budget=>{if(state===4){state=0;tasks=0;}else{order.push('pump:'+budget);time+=budget;}},_ml_session_gamepad:()=>0};
 const scope={setTimeout,clearTimeout,Date,performance,Uint8Array,window:null,__moonlightStreamFactory:async()=>core,
  MoonlightTelemetry:{now:()=>time,create:()=>({sample:()=>({})}),readCore:()=>null},
  MoonlightNative:{create:()=>({})},MoonlightStreamIO:{create:()=>({stats:{},interrupt:()=>{interrupted=true;},close:()=>assert.equal(tasks,0)})},
  MoonlightStreamMedia:{create:()=>({drainVideo:()=>{order.push('video');time+=4;if(failVideo)throw Error('copy failed');return true;},drainAudio:()=>{order.push('audio');time+=1;},stats:()=>({}),close:()=>{assert.equal(tasks,0);closed++;}})},
  MoonlightSessionProtocol:{create:()=>({launch:async()=>({host:'host',version:'7',url:'rtsp://host',key:new Uint8Array(16),keyId:1,codecSupport:1})})}};
 scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync('app/src/streaming/stream-client.js','utf8'),scope);
 client=scope.MoonlightStreamClient.create({host:'host',app:{id:1},onStats:()=>client.stop()});
 const result=await client.start();assert.equal(tasks,0);assert.equal(closed,1);return {order,result};
}

test('presentation runs once per tick and GPU wait stays outside the core budget measurements',async()=>{
 const {order,result}=await runTick();assert.equal(result.error,null);
 assert.deepEqual(order,['video','pump:10','audio']);
 assert.equal(result.stats.iterations,1);assert.equal(result.stats.pumpMs,10);assert.equal(result.stats.drainMs,5);
 assert.equal(result.stats.maxPumpMs,10);assert.equal(result.stats.maxDrainMs,5);
});

test('an early presentation failure still interrupts the core before freeing native media',async()=>{
 const {order,result}=await runTick(true);assert.match(result.error.message,/copy failed/);assert.deepEqual(order,['video']);
});
