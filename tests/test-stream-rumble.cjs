const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app/src/streaming/stream-client.js','utf8');
function load(scope={}){scope.window=scope;vm.createContext(scope);vm.runInContext(source,scope);return scope.MoonlightStreamClient;}

test('rumble bursts retain the newest levels without calling native output inside the core callback',()=>{
 let time=0;const calls=[];
 const output=load().createRumbleOutput((...args)=>{calls.push(args);time+=2;},()=>time);
 for(let i=0;i<1000;i++)output.queue(0,i,i+1);
 assert.equal(calls.length,0);output.flush();assert.deepEqual(calls,[[0,999,1000]]);
 assert.equal(output.stats.events,1000);assert.equal(output.stats.coalesced,999);
 for(let i=0;i<100;i++){output.queue(0,i,200);time=10;output.flush();}
 assert.equal(calls.length,1,'changing levels cannot exceed 30 native updates per second');
 time=36;output.flush();assert.deepEqual(calls.at(-1),[0,99,200]);
 time=39;output.queue(0,0,0);output.flush();assert.deepEqual(calls.at(-1),[0,0,0],'zero strength bypasses the rate cap');
 assert.equal(output.stats.totalMs,6);assert.equal(output.stats.maxMs,2);
 output.queue(1,500,500);time=100;output.flush();assert.equal(calls.length,3);
 output.queue(0,65535,65535);output.stop();output.flush();output.stop();
 assert.deepEqual(calls.at(-1),[0,0,0]);assert.equal(calls.length,4,'shutdown drops pending vibration and stops exactly once');
});

test('a failing optional output is disabled and shutdown still attempts zero strength',()=>{
 const calls=[];const output=load().createRumbleOutput((...args)=>{calls.push(args);throw Error('device unavailable');},()=>0);
 output.queue(0,100,200);assert.doesNotThrow(()=>output.flush());
 output.queue(0,300,400);output.flush();assert.equal(calls.length,1);
 assert.doesNotThrow(()=>output.stop());assert.deepEqual(calls.at(-1),[0,0,0]);assert.equal(output.stats.errors,2);
});

async function stream(rumbleEnabled){
 let time=0,state=0,tasks=0,platform,client;const order=[],calls=[],configured=[],heap=new Uint8Array(1024);
 const core={HEAPU8:heap,_malloc:()=>128,_free(){},lengthBytesUTF8:s=>s.length,stringToUTF8(){},UTF8ToString:()=>'',_LiGetLaunchUrlQueryParameters:()=>0,
  _ml_session_set_rumble:enabled=>{configured.push(enabled);return 0;},
  _ml_session_start:()=>{state=2;tasks=1;return 0;},_ml_session_state:()=>state,_ml_runtime_tasks:()=>tasks,_ml_session_video_frames:()=>1,
  _ml_session_stop:()=>{state=4;},_ml_runtime_pump:budget=>{
   if(state===4){state=0;tasks=0;platform.rumble(0,65535,65535);return;}
   order.push('pump');for(let i=0;i<100;i++)platform.rumble(0,i,i+1);time+=budget;
  }};
 const scope={setTimeout,clearTimeout,Date,performance,Uint8Array,
  __moonlightStreamFactory:async options=>{platform=options.moonlightPlatform;return core;},
  MoonlightTelemetry:{now:()=>time,create:()=>({sample:()=>({})}),readCore:()=>null},
  MoonlightNative:{create:()=>({})},MoonlightStreamIO:{create:()=>({stats:{},interrupt(){},close(){}})},
  MoonlightStreamMedia:{create:()=>({drainVideo:()=>{order.push('video');time++;return true;},finishVideo:()=>order.push('present'),drainAudio:()=>{order.push('audio');time++;},stats:()=>({}),close(){}})},
  MoonlightSessionProtocol:{create:()=>({launch:async()=>({host:'host',version:'7',url:'rtsp://host',key:new Uint8Array(16),keyId:1,codecSupport:1})})}};
 client=load(scope).create({renderer:'native-gpu-texture',host:'host',app:{id:1},mode:{width:1920,height:1080,fps:60,bitrate:50000,rumble:rumbleEnabled},onRumble:(...args)=>{order.push('rumble');calls.push(args);time+=5;},onStats:()=>client.stop()});
 return {result:await client.start(),calls,configured,order};
}
test('50 Mbps receives both pump slices and presents video/audio before one coalesced rumble call',async()=>{
 const r=await stream(true);assert.equal(r.result.error,null);assert.deepEqual(r.configured,[1]);
 assert.deepEqual(r.order.slice(0,7),['video','pump','present','pump','present','audio','rumble']);
 assert.deepEqual(r.calls,[[0,99,100],[0,0,0]]);
 assert.equal(r.result.stats.pumpMs,12);assert.equal(r.result.stats.drainMs,2);
 assert.equal(r.result.stats.rumble.events,200);assert.equal(r.result.stats.rumble.coalesced,199);assert.equal(r.result.stats.rumble.maxMs,5);
});
test('rumble off disables host capability and all output calls at 50 Mbps',async()=>{
 const r=await stream(false);assert.equal(r.result.error,null);assert.deepEqual(r.configured,[0]);assert.deepEqual(r.calls,[]);
 assert.equal(r.result.stats.rumble.events,0);assert.equal(r.result.stats.pumpMs,12);
});
