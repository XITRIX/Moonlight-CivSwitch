const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function environment(){
 const g={};g.window=g;vm.createContext(g);
 for(const p of ['app/vendor/native-ui-runtime.js','app/src/streaming/native-buffer.js','app/vendor/moonlight-nx2-runtime.js','app/src/storage/stream-settings.js','app/src/streaming/adaptive-bitrate.js'])vm.runInContext(fs.readFileSync(p,'utf8'),g,{filename:p});
 return g;
}
test('Auto starts at 50 Mbps for each mode and preserves saved/manual settings',()=>{
 const g=environment(),s=g.MoonlightSettings;
 for(const [w,h,fps,codec,want] of [[1920,1080,60,'h264',20000],[1920,1080,120,'h264',28000],[1920,1080,120,'av1',20000],[3840,2160,60,'av1',56000]]){assert.equal(s.resolveBitrate({width:w,height:h,fps,codec,bitrate:'auto'}),50000);assert.equal(g.MoonlightNativeModules.bitrate.defaultBitrate(w,h,fps,codec),want);}
 let file=null;const store=s.create({read:()=>file,write:x=>file=x,commit(){}});
 store.save({...s.defaults(),bitrate:'auto'});assert.equal(store.load().bitrate,'auto');assert.equal(s.resolveBitrate({...s.defaults(),bitrate:40000}),40000);
});
test('Pinned NX2 reference policy warms up, steps down once, holds off and restores after 120 clean seconds',()=>{
 const g=environment(),p=g.MoonlightNativeModules.bitrateAdaptation.createBitrateAdaptation();
 p.observe({type:'video-rate',fps:60,bitrate:20000});let dropped=0,decision;
 const sample=bad=>p.observe({type:'civ7-stats',presented:60,dropped:dropped+=bad?5:0,idrRequests:0,queueAgeMs:0});
 for(let i=0;i<10;i++)assert.equal(sample(true),null);
 decision=sample(true);assert.equal(decision.to,15000);assert.equal(decision.direction,'down');assert.equal(sample(true),null);
 p.observe({type:'video-rate',fps:60,bitrate:15000});dropped=0;
 for(let i=0;i<124;i++)assert.equal(sample(false),null);
 assert.equal(sample(false).to,20000);
 p.observe({type:'video-rate',fps:60,bitrate:20000});for(let i=0;i<200;i++)assert.equal(sample(true),null);
});
test('Pinned NX2 reference excludes render overload',()=>{
 const g=environment(),p=g.MoonlightNativeModules.bitrateAdaptation.createBitrateAdaptation();p.observe({type:'video-rate',fps:120,bitrate:28000});
 for(let i=0;i<200;i++)assert.equal(p.observe({type:'civ7-stats',presented:90,dropped:i*10,idrRequests:0,queueAgeMs:100}),null);
 assert.equal(p.scale(),null);
});
for(const cancelDuringCleanup of [false,true])test('Auto reconnect awaits cleanup and respects exit during cleanup: '+cancelDuringCleanup,async()=>{
 const g=environment();let time=0,api,created=0,released=false,finishCleanup;const rates=[];
 g.MoonlightTelemetry={now:()=>time};
 const make=opts=>{
  rates.push(opts.mode.bitrate);const id=++created;let stopped=false;
  if(id===2)assert(released,'no second decoder/core before first cleanup');
  return {stop(){stopped=true;},gamepad:()=>17,start:async()=>{
   for(let i=0;i<20&&!stopped;i++){
    time+=1000;opts.onStats({state:2,mode:opts.mode,telemetry:{textureFps:60,videoFrameGaps:i*5,decoderRejected:0,coreQueueMs:0,rttMs:0,frameJitterMs:12},stallsOver50Ms:0,stallsOver100Ms:0,stallsOver250Ms:i});
    if(id===2)api.stop();
   }
   if(id===1){await new Promise(r=>finishCleanup=r);released=true;}
   return {error:null,stats:{tasks:0}};
  }};
 };
 api=g.MoonlightAdaptiveBitrate.create({mode:{...g.MoonlightSettings.defaults(),width:1920,height:1080,bitrate:'auto'}},make);
 const done=api.start();assert.equal(api.gamepad(),17);assert.equal(created,1);assert(finishCleanup);
 if(cancelDuringCleanup)api.stop();finishCleanup();await done;
 assert.deepEqual(rates,cancelDuringCleanup?[50000]:[50000,37500]);
});
test('missing or nonfinite stall counters cannot trigger an adaptive restart',async()=>{
 const g=environment();let time=0,stops=0,creates=0;g.MoonlightTelemetry={now:()=>time};
 const api=g.MoonlightAdaptiveBitrate.create({mode:{...g.MoonlightSettings.defaults(),bitrate:'auto'}},opts=>{
  creates++;return {stop(){stops++;},start:async()=>{
   for(let i=0;i<30;i++){time+=1000;opts.onStats({state:2,telemetry:{textureFps:60,videoFrameGaps:i*10,decoderRejected:0,coreQueueMs:i%2?NaN:undefined,rttMs:100,frameJitterMs:0},stallsOver50Ms:0,stallsOver100Ms:0,stallsOver250Ms:i%2?NaN:undefined});}
   return {error:null,stats:{}};
  }};
 });await api.start();assert.equal(stops,0);assert.equal(creates,1);
});
for(const quarantine of [false,true])test('failed or quarantined cleanup prevents Auto reopening: '+quarantine,async()=>{
 const g=environment();let time=0,creates=0;g.MoonlightTelemetry={now:()=>time};
 const api=g.MoonlightAdaptiveBitrate.create({mode:{...g.MoonlightSettings.defaults(),bitrate:'auto'}},opts=>{
  creates++;let stopped=false;return {stop(){stopped=true;},start:async()=>{
   for(let i=0;i<20&&!stopped;i++){time+=1000;opts.onStats({state:2,telemetry:{textureFps:60,videoFrameGaps:i*5,decoderRejected:0,coreQueueMs:0,frameJitterMs:12},stallsOver50Ms:0,stallsOver100Ms:0,stallsOver250Ms:i});}
   assert(stopped);if(quarantine)g.__moonlightStreamUnfinished={};return {error:quarantine?null:Error('cleanup failed'),stats:{}};
  }};
 });await api.start();assert.equal(creates,1);
});
function healthy(fps=90){return {telemetry:{textureFps:fps,videoFrameGaps:0,decoderRejected:0,coreQueueMs:1,rttMs:4,frameJitterMs:2},input:{gamepadRejected:0},stallsOver50Ms:0,stallsOver100Ms:0,stallsOver250Ms:0,audioEmptyMs:0};}

test('Auto stays at 50 Mbps indefinitely during steady lower-FPS playback',()=>{
 const g=environment(),p=g.MoonlightAdaptiveBitrate.createPolicy(50000,120);let time=0;p.start(50000);
 for(let i=0;i<3600;i++)assert.equal(p.observe(healthy(90),time+=1000,true),null);
 assert.equal(p.state().currentKbps,50000);assert.equal(p.state().upwardProbing,false);
});
test('new long stalls back off 25 percent and clean playback never restores the rate',()=>{
 const g=environment(),p=g.MoonlightAdaptiveBitrate.createPolicy(50000,120);let time=0;p.start(50000);
 for(let i=0;i<7;i++)p.observe(healthy(),time+=1000,true);
 const bad=healthy();bad.stallsOver100Ms=1;bad.stallsOver250Ms=1;let d=p.observe(bad,time+=1000,true);assert.equal(d.to,37500);p.start(d.to);
 for(let i=0;i<3600;i++)assert.equal(p.observe(healthy(),time+=1000,true),null);
 assert.equal(p.state().currentKbps,37500);
});
test('audio empty, jitter, input rejection, loss and RTT alone do not interrupt smooth playback',()=>{
 const g=environment(),p=g.MoonlightAdaptiveBitrate.createPolicy(50000,120);let time=0;p.start(50000);
 for(let i=0;i<60;i++){const s=healthy();s.telemetry.videoFrameGaps=i*10;s.telemetry.rttMs=100;s.connectionPoor=true;s.audioEmptyMs=i*200;s.telemetry.frameJitterMs=15;s.input.gamepadRejected=i;assert.equal(p.observe(s,time+=1000,true),null);}
 const s=healthy();s.input.gamepadRejected=1;assert.equal(p.observe(s,time+=1000,true),null);
});
test('repeated stalls back off to a floor and never trigger an increase',()=>{
 const g=environment(),p=g.MoonlightAdaptiveBitrate.createPolicy(50000,60);let time=0,current=50000;p.start(current);
 for(let i=0;i<150;i++){const s=healthy();s.stallsOver100Ms=i;s.stallsOver250Ms=i;const d=p.observe(s,time+=1000,true);if(d){assert(d.to<current);current=d.to;p.start(current);}}
 assert.equal(current,5000);
});
test('a frozen stream backs off even when interval/queue means are unavailable',()=>{
 const g=environment(),p=g.MoonlightAdaptiveBitrate.createPolicy(50000,120);let time=0;p.start(50000);
 for(let i=0;i<7;i++)p.observe(healthy(),time+=1000,true);
 const s=healthy(0);s.telemetry.coreQueueMs=null;s.telemetry.frameJitterMs=null;
 assert.equal(p.observe(s,time+=1000,true),null);
 assert.equal(p.observe(s,time+=1000,true).to,37500);
});
test('menus suppress automatic reconnects and reset the observation boundary',()=>{
 const g=environment(),p=g.MoonlightAdaptiveBitrate.createPolicy(50000,60);let time=0;p.start(50000);
 for(let i=0;i<10;i++)p.observe(healthy(60),time+=1000,true);
 const s=healthy(60);s.stallsOver100Ms=1;assert.equal(p.observe(s,time+=1000,false),null);assert.equal(p.observe(s,time+=1000,true),null);
});
test('recorded smooth-video/audio-empty false positives no longer lower bitrate',()=>{
 const windows=require('./fixtures/auto-audio-false-positive.json'),g=environment();
 for(const event of windows){
  const p=g.MoonlightAdaptiveBitrate.createPolicy(event.decision.from,120);p.start(event.decision.from);let time=0;
  for(let repeat=0;repeat<5;repeat++)for(const sample of event.samples){
   const stats={telemetry:sample.telemetry,stallsOver100Ms:sample.large,stallsOver250Ms:0,input:{gamepadRejected:sample.rejected},audioEmptyMs:sample.audioEmptyMs};
   assert.equal(p.observe(stats,time+=1000,true),null);
  }
 }
});
test('isolated 100 ms gaps do not reconnect, but three within ten seconds do',()=>{
 const g=environment(),p=g.MoonlightAdaptiveBitrate.createPolicy(50000,120);let time=0;p.start(50000);
 for(let i=0;i<7;i++)p.observe(healthy(),time+=1000,true);
 let s=healthy();s.stallsOver100Ms=1;assert.equal(p.observe(s,time+=1000,true),null);
 for(let i=0;i<12;i++)assert.equal(p.observe(s,time+=1000,true),null);
 for(let i=2;i<4;i++){s={...s,stallsOver100Ms:i};assert.equal(p.observe(s,time+=1000,true),null);}
 s.stallsOver100Ms=4;const d=p.observe(s,time+=1000,true);assert.equal(d.to,37500);assert.equal(d.reason,'repeated-video-gaps');
});
