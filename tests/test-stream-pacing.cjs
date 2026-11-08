const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

async function runTick(failVideo=false,failClose=false,videoPacing="smooth",mode={width:1280,height:720,fps:60,bitrate:3000},emptyFirst=false){
 let time=0,state=0,tasks=0,client,closed=0,interrupted=false,ioClosed=false,mediaOptions,videoCalls=0;
 const order=[],heap=new Uint8Array(1024);
 const core={HEAPU8:heap,_malloc:()=>128,_free(){},lengthBytesUTF8:s=>s.length,stringToUTF8(){},UTF8ToString:()=>'',_LiGetLaunchUrlQueryParameters:()=>0,
  _ml_session_start:()=>{state=2;tasks=1;return 0;},_ml_session_state:()=>state,_ml_runtime_tasks:()=>tasks,_ml_session_video_frames:()=>1,
  _ml_session_stop:()=>{assert(interrupted);state=4;},
  _ml_runtime_pump:budget=>{if(state===4){state=0;tasks=0;}else{order.push('pump:'+budget);time+=budget;}},_ml_session_gamepad:()=>0};
 const scope={setTimeout,clearTimeout,Date,performance,Uint8Array,window:null,__moonlightStreamFactory:async()=>core,
  MoonlightTelemetry:{now:()=>time,create:()=>({sample:()=>({})}),readCore:()=>null},
  MoonlightNative:{create:()=>({})},MoonlightStreamIO:{create:()=>({stats:{},interrupt:()=>{interrupted=true;},close:()=>{assert.equal(tasks,0);ioClosed=true;}})},
  MoonlightStreamMedia:{create:(io,runtime,options)=>(mediaOptions=options,{drainVideo:()=>{videoCalls++;order.push('video');time+=4;if(failVideo&&(!emptyFirst||videoCalls>1))throw Error('copy failed');return !(emptyFirst&&videoCalls===1);},finishVideo:()=>{order.push('finish');},drainAudio:()=>{order.push('audio');time+=1;},stats:()=>({}),close:()=>{assert.equal(tasks,0);closed++;if(failClose)throw Error('GPU pending');}})},
  MoonlightSessionProtocol:{create:()=>({launch:async()=>({host:'host',version:'7',url:'rtsp://host',key:new Uint8Array(16),keyId:1,codecSupport:1})})}};
 scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync('app/src/streaming/stream-client.js','utf8'),scope);
 client=scope.MoonlightStreamClient.create({host:'host',app:{id:1},mode:{...mode,videoPacing},onStats:()=>client.stop()});
 const result=await client.start();assert.equal(tasks,0);assert.equal(closed,1);return {order,result,ioClosed,mediaOptions,unfinished:scope.__moonlightStreamUnfinished};
}

test('presentation runs once per tick and GPU wait stays outside the core budget measurements',async()=>{
 const {order,result}=await runTick();assert.equal(result.error,null);
 assert.deepEqual(order,['video','pump:4','finish','pump:6','finish','audio']);
 assert.equal(result.stats.iterations,1);assert.equal(result.stats.pumpMs,10);assert.equal(result.stats.drainMs,5);
 assert.equal(result.stats.maxPumpMs,10);assert.equal(result.stats.maxDrainMs,5);
});

test('an early presentation failure still interrupts the core before freeing native media',async()=>{
 const {order,result}=await runTick(true);assert.match(result.error.message,/copy failed/);assert.deepEqual(order,['video']);
});
test('an empty early drain gets one mid-frame retry without extending the core budget',async()=>{
 const {order,result}=await runTick(false,false,"smooth",{width:1920,height:1080,fps:60,bitrate:40000},true);assert.equal(result.error,null);
 assert.deepEqual(order,['video','pump:4','finish','video','pump:8','finish','audio']);
 assert.equal(result.stats.pumpMs,12);assert.equal(result.stats.drainMs,9);
});
test('a mid-frame presentation failure still cleans up the core and native ownership',async()=>{
 const {order,result,ioClosed}=await runTick(true,false,"smooth",{width:1920,height:1080,fps:60,bitrate:40000},true);
 assert.match(result.error.message,/copy failed/);assert.deepEqual(order,['video','pump:4','finish','video']);assert.equal(ioClosed,true);
});
test('lower-rate modes retain one early decoder drain even when it is empty',async()=>{
 const {order,result}=await runTick(false,false,"smooth",undefined,true);
 assert.equal(result.error,null);assert.deepEqual(order,['video','pump:4','finish','pump:6','finish','audio']);assert.equal(result.stats.pumpMs,10);
});
test('an unfinished GPU transfer quarantines native resources after C tasks stop',async()=>{
 const {result,unfinished,ioClosed}=await runTick(false,true);assert.equal(ioClosed,false);assert.match(result.error.message,/GPU pending/);assert(unfinished.media);assert(unfinished.io);assert(unfinished.core);
});

test("Low latency preference disables the spare-frame buffer",async()=>{const {result,mediaOptions}=await runTick(false,false,"latency");assert.equal(result.error,null);assert.equal(mediaOptions.smoothVideo,false);});


test('demanding 60 FPS modes get 12 ms while lighter modes retain 10 ms',async()=>{
 for(const mode of [{width:1920,height:1080,fps:60,bitrate:40000},{width:1920,height:1080,fps:60,bitrate:10000},{width:1280,height:720,fps:60,bitrate:8000},{width:1920,height:1080,fps:30,bitrate:10000}]){
  const {order,result,mediaOptions}=await runTick(false,false,"smooth",mode),budget=mode.fps===60?12:10;
  assert.equal(result.error,null);assert.equal(result.stats.pumpBudgetMs,budget);assert.equal(result.stats.pumpMs,budget);
  const first=budget===12&&mode.bitrate<40000?6:4;assert.deepEqual(order,['video','pump:'+first,'finish','pump:'+(budget-first),'finish','audio']);
 }
});
