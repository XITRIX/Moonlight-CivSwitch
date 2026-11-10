const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const scope={};scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync('app/src/streaming/telemetry.js','utf8'),scope);
const telemetry=scope.MoonlightTelemetry;
test('rare-stall history is bounded, detached from mutable snapshots and reset between streams',()=>{
 const history=telemetry.createHistory(),s={mode:{bitrate:50000},telemetry:{textureFps:60},input:{gamepadQueued:1},fec:{calls:0},network:{receivedBytes:123,directVideoPackets:4},referenceRecovery:true};
 history.record(s);s.telemetry.textureFps=2;s.input.gamepadQueued=10;s.network.receivedBytes=999;
 assert.equal(history.samples[0].telemetry.textureFps,60);assert.equal(history.samples[0].input.gamepadQueued,1);assert.equal(history.samples[0].network.receivedBytes,123);
 for(let i=0;i<605;i++){s.input.gamepadQueued=i;history.record(s);}
 assert.equal(history.samples.length,600);assert.equal(history.samples[0].input.gamepadQueued,5);assert.equal(history.samples[599].input.gamepadQueued,604);
 const samples=history.samples;history.reset();assert.equal(samples.length,0);assert.equal(history.samples,samples);
 history.record({});assert.equal(history.samples[0].fec,null);assert.equal(history.samples[0].network.directVideoPackets,0);
});
test('packet pool counters are optional, bounded and versioned',()=>{
 const core={HEAPU8:new Uint8Array(256)};assert.equal(telemetry.readPacketPool(core),null);
 core._ml_packet_pool_metrics=()=>64;const v=new Float64Array(core.HEAPU8.buffer,64,8);v.set([1,1456,1024,4,80,2000,1,2]);
 const stats=telemetry.readPacketPool(core);assert.equal(stats.inUse,4);assert.equal(stats.hits,2000);assert.equal(stats.reallocMoves,2);
 v[0]=2;assert.throws(()=>telemetry.readPacketPool(core),/schema/);v[0]=1;v[1]=Infinity;assert.throws(()=>telemetry.readPacketPool(core),/schema/);
 core._ml_packet_pool_metrics=()=>240;assert.throws(()=>telemetry.readPacketPool(core),/range/);
});
test('optional recovery counters reject invalid pointers and schemas',()=>{
 const core={HEAPU8:new Uint8Array(128)};assert.equal(telemetry.readFec(core),null);
 core._ml_fec_metrics=()=>64;const v=new Float64Array(core.HEAPU8.buffer,64,7);v.set([2,4,8,3,0,1024,1]);
 assert.equal(telemetry.readFec(core).calls,4);assert.equal(telemetry.readFec(core).maxWallMs,3);assert.equal(telemetry.readFec(core).budgetYields,1);
 v[0]=1;assert.throws(()=>telemetry.readFec(core),/schema/);v[0]=2;v[1]=NaN;assert.throws(()=>telemetry.readFec(core),/schema/);
 core._ml_fec_metrics=()=>88;assert.throws(()=>telemetry.readFec(core),/range/);
 core._ml_fec_metrics=()=>65;assert.throws(()=>telemetry.readFec(core),/range/);
});
test('interval FPS, throughput, decoder time, jitter and protocol metrics use actual elapsed time',()=>{
 let time=0;const meter=telemetry.create(()=>time),s={decoded:0,presented:0,decodeSamples:0,decodeMs:0,conversionMs:0,intervalCount:0,intervalMs:0,intervalSquaredMs:0,network:{receivedBytes:0,directReceivedBytes:0}},p=Array(22).fill(0);p[0]=1;
 assert.equal(meter.sample(s,p).textureFps,null);time=2000;
 Object.assign(s,{decoded:120,presented:100,decodeSamples:120,decodeMs:600,conversionMs:80,gpuTransfers:100,gpuTransferMs:50,nativePublishMs:20,gpuPolls:200,gpuPollMs:10,gpuCompletionSamples:100,gpuCompletionMs:800,presentAgeSamples:100,presentAgeMs:1800,iterations:100,pumpMs:600,drainMs:80,intervalCount:2,intervalMs:40,intervalSquaredMs:1000,decoderPending:2,audioBufferedMsUpperBound:40});s.network.receivedBytes=1000000;s.network.directReceivedBytes=1000000;
 p[1]=100;p[2]=200;p[4]=20;p[6]=100;p[7]=300;p[9]=1;p[10]=4;p[11]=2;p[20]=3;p[21]=1;
 const v=meter.sample(s,p);assert.equal(v.gpuTransferMs,.5);assert.equal(v.nativePublishMs,.2);assert.equal(v.gpuPollMs,.05);assert.equal(v.gpuCompletionMs,8);assert.equal(v.presentAgeMs,18);assert.equal(v.decodedFps,60);assert.equal(v.loopHz,50);assert.equal(v.pumpAvgMs,6);assert.equal(v.drainAvgMs,.8);assert.equal(v.textureFps,50);assert.equal(v.receivedMbps,4);assert.equal(v.decodeReadyMs,5);assert.equal(v.copyPresentMs,.8);assert.equal(v.frameIntervalMs,20);assert.equal(v.frameJitterMs,10);assert.equal(v.frameReceiveMs,2);assert.equal(v.coreQueueMs,.2);assert.equal(v.hostProcessingMs,3);assert.equal(v.rttMs,4);assert.equal(v.videoFrameGaps,3);assert.equal(v.decoderRejected,1);assert.equal(v.decoderPending,2);assert.equal(v.audioBufferedMsUpperBound,40);
 time=3000;const empty=meter.sample(s,null);assert.equal(empty.decodeReadyMs,null);assert.equal(empty.rttMs,null);assert.equal(empty.frameJitterMs,null);assert.equal(empty.receivedMbps,0);
});
test('core snapshots are bounded/versioned and overlay distinguishes unavailable metrics and texture timing',()=>{
 const heap=new Uint8Array(512),core={HEAPU8:heap,_ml_session_metrics:()=>0};assert.equal(telemetry.readCore(core),null);
 core._ml_session_metrics=()=>64;const data=new Float64Array(heap.buffer,64,22);data[0]=1;assert.equal(telemetry.readCore(core)[0],1);
 data[10]=NaN;assert.throws(()=>telemetry.readCore(core),/schema/);data[10]=0;
 core._ml_session_metrics=()=>400;assert.throws(()=>telemetry.readCore(core),/range/);
 assert.match(telemetry.format({mode:{width:1280,height:720,fps:60,bitrate:5000}}),/RTT — ms/);
 assert.match(telemetry.format({mode:{},telemetry:{textureFps:59.9}}),/Texture 59.9 FPS/);
 assert.match(telemetry.format({mode:{}}),/excludes display scanout/);
});
test('rumble timing uses interval call counts and survives a detached history snapshot',()=>{
 let time=0;const meter=telemetry.create(()=>time),s={network:{receivedBytes:0},rumble:{updates:2,totalMs:1,maxMs:.75}};
 meter.sample(s,null);time=1000;s.rumble={updates:5,totalMs:2.5,maxMs:.8};
 const t=meter.sample(s,null);assert.equal(t.rumbleAvgMs,.5);assert.equal(t.rumbleMaxMs,.8);
 const history=telemetry.createHistory();history.record(s);s.rumble.maxMs=99;assert.equal(history.samples[0].rumble.maxMs,.8);
 assert.match(telemetry.format({mode:{},telemetry:t}),/Rumble 0.5 ms avg · 0.8 ms max/);
 time=2000;assert.equal(meter.sample(s,null).rumbleAvgMs,null);
});

test('service timings and sampled audio starvation survive interval metrics and detached history',()=>{
 let time=0;const meter=telemetry.create(()=>time),s={network:{},clock:{serviceWakes:0},serviceIterations:0,servicePumpMs:0,serviceDrainMs:0};meter.sample(s,null);
 time=1000;Object.assign(s,{serviceIterations:10,servicePumpMs:15,serviceDrainMs:2,maxServiceMs:3,audioPrimed:true,audioPrefillMs:40,audioEmptyEpisodes:2,audioEmptyMs:12});s.clock.serviceWakes=10;
 s.telemetry=meter.sample(s,null);assert.equal(s.telemetry.serviceHz,10);assert.equal(s.telemetry.servicePumpAvgMs,1.5);assert.equal(s.telemetry.serviceDrainAvgMs,.2);
 assert.equal(s.telemetry.audioPrimed,true);assert.equal(s.telemetry.audioPrefillMs,40);assert.equal(s.telemetry.audioEmptyEpisodes,2);assert.equal(s.telemetry.audioEmptyMs,12);
 const h=telemetry.createHistory();h.record(s);s.clock.serviceWakes=99;s.telemetry.audioEmptyMs=999;
 assert.equal(h.samples[0].clock.serviceWakes,10);assert.equal(h.samples[0].telemetry.audioEmptyMs,12);assert.equal(h.samples[0].maxServiceMs,3);
 assert.match(telemetry.format({mode:{},telemetry:h.samples[0].telemetry}),/Audio queue empty \(observed\) 2 × \/ 12 ms/);
 time=2000;assert.equal(meter.sample(s,null).servicePumpAvgMs,null);
});
