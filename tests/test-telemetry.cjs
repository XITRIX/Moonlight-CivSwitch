const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const scope={};scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync('app/src/streaming/telemetry.js','utf8'),scope);
const telemetry=scope.MoonlightTelemetry;
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
