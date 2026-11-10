const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

async function runTick(failVideo=false,failClose=false,videoPacing="smooth",mode={width:1280,height:720,fps:60,bitrate:3000},emptyFirst=false,failPoolClose=false,cancelPreparation=false,betweenFrames=null){
 let time=0,state=0,tasks=0,client,closed=0,interrupted=false,ioClosed=false,mediaOptions,videoCalls=0;
 let ioOptions;
 const pairCalls=[],poolCalls=[],batchCalls=[],referenceCalls=[],order=[],heap=new Uint8Array(1024);
 const core={HEAPU8:heap,_malloc:()=>128,_free(){},lengthBytesUTF8:s=>s.length,stringToUTF8(){},UTF8ToString:()=>'',_LiGetLaunchUrlQueryParameters:()=>0,
  _ml_video_batch_configure:enabled=>{assert.equal(tasks,0);batchCalls.push(enabled);return 0;},
  _ml_session_set_reference_recovery:enabled=>{assert.equal(tasks,0);referenceCalls.push(enabled);return 0;},
  _ml_session_reference_recovery:()=>referenceCalls.includes(1),
  _ml_fec_prepare_pair:coefficient=>{assert.equal(tasks,0);pairCalls.push(coefficient);if(cancelPreparation&&coefficient===1)client.stop();return 0;},
  _ml_packet_pool_configure:enabled=>{assert.equal(tasks,0);poolCalls.push(enabled);return !enabled&&failPoolClose?-1:0;},
  _ml_session_start:()=>{state=2;tasks=1;return 0;},_ml_session_state:()=>state,_ml_runtime_tasks:()=>tasks,_ml_session_video_frames:()=>1,
  _ml_session_stop:()=>{assert(interrupted);state=4;},
  _ml_runtime_pump:budget=>{assert(budget>0);if(state===4){state=0;tasks=0;}else{order.push('pump:'+budget);time+=betweenFrames==='overrun'&&budget===2?20:budget;if(betweenFrames==='stop'&&budget===2)client.stop();}},_ml_session_gamepad:()=>0};
 const scope={setTimeout,clearTimeout,Date,performance,Uint8Array,window:null,__moonlightStreamFactory:async()=>core,
  MoonlightTelemetry:{now:()=>time,create:()=>({sample:()=>({})}),readCore:()=>null},
  MoonlightNative:{create:()=>({})},MoonlightStreamIO:{create:(transport,options)=>(ioOptions=options,{stats:{},interrupt:()=>{interrupted=true;},close:()=>{assert.equal(tasks,0);ioClosed=true;}})},
  MoonlightStreamMedia:{create:(io,runtime,options)=>(mediaOptions=options,{drainVideo:()=>{videoCalls++;order.push('video');time+=4;if(failVideo&&(!emptyFirst||videoCalls>1))throw Error('copy failed');return !(emptyFirst&&videoCalls===1);},finishVideo:()=>{order.push('finish');},drainAudio:()=>{order.push('audio');time+=1;if(betweenFrames==='audioError')throw Error('audio service failed');},stats:()=>({}),close:()=>{assert.equal(tasks,0);closed++;if(failClose)throw Error('GPU pending');}})},
  MoonlightSessionProtocol:{create:()=>({launch:async()=>({host:'host',version:'7',url:'rtsp://host',key:new Uint8Array(16),keyId:1,codecSupport:1})})}};
 const timers=new Map(),frames=new Map();let next=0;
 if(betweenFrames){
  scope.performance={now:()=>time};scope.setTimeout=(fn,delay)=>{const id=++next;if(delay===0)queueMicrotask(fn);else timers.set(id,{fn,delay});return id;};scope.clearTimeout=id=>timers.delete(id);
  scope.cancelAnimationFrame=id=>frames.delete(id);scope.requestAnimationFrame=fn=>{
   const id=++next;frames.set(id,fn);queueMicrotask(()=>{
    if(betweenFrames!=='earlyFrame'){time+=4;const service=[...timers].find(([,t])=>t.delay===4);if(service){timers.delete(service[0]);service[1].fn();}}
    if(frames.has(id))frames.get(id)();
   });return id;
  };
 }
 scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync('app/src/streaming/stream-client.js','utf8'),scope);
 client=scope.MoonlightStreamClient.create({host:'host',app:{id:1},mode:{...mode,videoPacing},onStats:()=>client.stop()});
 const result=await client.start();assert.equal(tasks,0);assert.equal(closed,cancelPreparation?0:1);assert.equal(timers.size,0);assert.equal(frames.size,0);return {order,result,ioClosed,mediaOptions,poolCalls,pairCalls,batchCalls,referenceCalls,ioOptions,unfinished:scope.__moonlightStreamUnfinished};
}

test('between-frame service moves work within the existing budget and never presents video',async()=>{
 const r=await runTick(false,false,'smooth',undefined,false,false,false,'service');
 assert.equal(r.result.error,null);assert.deepEqual(r.order,['pump:2','audio','video','pump:4','finish','pump:3','finish','audio']);
 assert.equal(r.result.stats.serviceIterations,1);assert.equal(r.result.stats.servicePumpMs,2);assert.equal(r.result.stats.serviceDrainMs,1);
 assert.equal(r.result.stats.pumpMs+r.result.stats.servicePumpMs+r.result.stats.serviceDrainMs,10);
 const early=await runTick(false,false,'smooth',undefined,false,false,false,'earlyFrame');assert.equal(early.result.stats.serviceIterations,0);assert.equal(early.result.stats.pumpMs,10);
});
test('service overruns consume the next pump allowance instead of adding another full budget',async()=>{
 const r=await runTick(false,false,'smooth',undefined,false,false,false,'overrun');
 assert.equal(r.result.error,null);assert.deepEqual(r.order,['pump:2','audio','video','finish','finish','audio']);
 assert.equal(r.result.stats.pumpMs,0);assert.equal(r.result.stats.servicePumpMs,20);assert.equal(r.result.stats.maxServiceMs,21);
});
test('stop and audio failure during between-frame service cancel display work and clean up ownership',async()=>{
 for(const mode of ['stop','audioError']){
  const r=await runTick(false,false,'smooth',undefined,false,false,false,mode);
  assert.deepEqual(r.order,['pump:2','audio']);assert.equal(r.ioClosed,true);
  if(mode==='audioError')assert.match(r.result.error.message,/audio service failed/);else assert.equal(r.result.error,null);
 }
});

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

test('80 Mbps uses fractional receive headroom and owns packet reuse until all C tasks stop',async()=>{
 const mode={width:1920,height:1080,fps:60,bitrate:80000};
 const {order,result,poolCalls,pairCalls,batchCalls,referenceCalls,ioOptions}=await runTick(false,false,"smooth",mode);
 assert.equal(result.error,null);assert.equal(result.stats.pumpBudgetMs,13.5);
 assert.deepEqual(batchCalls,[1]);assert.deepEqual(referenceCalls,[1]);assert.equal(ioOptions.directVideoBatch,true);assert.equal(result.stats.referenceRecovery,true);
 assert.deepEqual(order,['video','pump:4','finish','pump:9.5','finish','audio']);assert.deepEqual(poolCalls,[1,0]);assert.deepEqual(pairCalls,[...Array.from({length:256},(_,i)=>i),-1]);
 const lower=await runTick(false,false,"smooth",{...mode,bitrate:30000});assert.deepEqual(lower.poolCalls,[0]);assert.deepEqual(lower.pairCalls,[-1]);assert.equal(lower.result.stats.pumpBudgetMs,12);assert.deepEqual(lower.batchCalls,[]);assert.deepEqual(lower.referenceCalls,[]);assert.equal(lower.ioOptions.directVideoBatch,false);
 const failed=await runTick(false,false,"smooth",mode,false,true);
 assert.match(failed.result.error.message,/live buffers/);assert(failed.unfinished.core);assert.equal(failed.ioClosed,false);
});

test('40–70 Mbps uses direct reception and reference recovery without increasing the pump budget',async()=>{
 for(const bitrate of [40000,50000,60000,70000]){
  const r=await runTick(false,false,"smooth",{width:1920,height:1080,fps:60,bitrate});
  assert.equal(r.result.error,null);assert.equal(r.result.stats.pumpBudgetMs,12);
  assert.deepEqual(r.batchCalls,[1]);assert.deepEqual(r.referenceCalls,[1]);assert.equal(r.ioOptions.directVideoBatch,true);
  assert.deepEqual(r.poolCalls,[1,0]);assert.deepEqual(r.pairCalls,[...Array.from({length:256},(_,i)=>i),-1]);
 }
});

test('cancel during 80 Mbps table preparation frees allocations before any host launch',async()=>{
 const r=await runTick(false,false,"smooth",{width:1920,height:1080,fps:60,bitrate:80000},false,false,true);
 assert.deepEqual(r.pairCalls,[0,1,-1]);assert.deepEqual(r.poolCalls,[1,0]);assert.equal(r.mediaOptions,undefined);assert.deepEqual(r.batchCalls,[]);assert.deepEqual(r.referenceCalls,[]);assert.equal(r.ioClosed,true);assert.equal(r.unfinished,undefined);
});
