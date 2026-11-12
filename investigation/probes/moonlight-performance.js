/* Installed-app performance check. No live TCP logging or persistent settings
 * changes. The resident owns the task after this finite activation returns. */
(async function(g){
 'use strict';
 var config=g.__moonlightPerformanceConfig||{},core=g.__civhomebrewCore,session=g.CivNanoVGSession&&g.CivNanoVGSession.current;
 if(!core||!session||!session.renderer.bindSurface)throw Error('Native Launcher is required');
 if(g.__moonlightPerformance&&!g.__moonlightPerformance.finished)throw Error('Performance test is already active');
 var r={version:1,config:config,started:Date.now(),stage:'armed',samples:[],intervals:[],complete:false,error:null};g.__moonlightPerformance=r;
 var profileRemovers=[],measurementBegan=0,profileCore=null;r.profile={};r.slowCalls=[];r.physicalTouchSamples=0;
 function taskProfile(){
  if(!profileCore||!profileCore._ml_runtime_profile)return null;
  var names=['Other','InputDispatch','InputSend','AudioRecv','AudioDec','VideoRecv','VideoDec','ControlRecv','LossStats','ReqIdrFrame','CtrlAsyncCb','InvRefFrames','Ping'],at=profileCore._ml_runtime_profile(),v=new DataView(profileCore.HEAPU8.buffer),result={};
  for(var i=0;i<names.length;i++){var row={};['calls','totalMs','maxMs','over20Ms','over100Ms'].forEach(function(key,j){row[key]=v.getFloat64(at+(i*5+j)*8,true);});result[names[i]]=row;}return result;
 }
 function phase(){return config.touchPattern==='alternating'&&measurementBegan?['off-before','touch','off-after'][Math.min(2,Math.floor((Date.now()-measurementBegan)/(duration/3)))]:config.simulateTouch?'touch':'physical';}
 function instrument(object,key,label){
  if(!config.profile||typeof object[key]!=='function')return;
  var original=object[key];object[key]=function(){
   if(r.stage!=='measuring')return original.apply(this,arguments);
   var begin=g.MoonlightTelemetry.now(),name=typeof label==='function'?label(arguments):label,p=phase(),value;
   try{return value=original.apply(this,arguments);}finally{
    var ms=g.MoonlightTelemetry.now()-begin,k=p+':'+name,s=r.profile[k]||(r.profile[k]={calls:0,totalMs:0,maxMs:0,over20Ms:0});s.calls++;s.totalMs+=ms;s.maxMs=Math.max(s.maxMs,ms);if(ms>20)s.over20Ms++;
    if(ms>20&&r.slowCalls.length<300)r.slowCalls.push({time:Date.now(),phase:p,name:name,ms:ms,touchCount:r.lastPhysicalTouchCount||0});
   }
  };profileRemovers.push(function(){object[key]=original;});
 }
 var nativeValue=null,nativeOriginal=null,nativeDescriptor=Object.getOwnPropertyDescriptor(g,'MoonlightNative'),clientValue=null,clientDescriptor=Object.getOwnPropertyDescriptor(g,'MoonlightStreamClient'),clientOriginal=null,live=null,controllerCreate=null,touchCreate=null,injectChord=false;
 var width=config.width||1920,height=config.height||1080,fps=config.fps||60,bitrate=config.bitrate||50000,warmup=Math.max(3000,Math.min(15000,config.warmupMs||5000)),duration=Math.max(10000,Math.min(180000,config.durationMs||60000));
 var codec=config.codec||'h264',pacing=config.pacing||'smooth';
 if(['h264','av1'].indexOf(codec)<0||['smooth','latency'].indexOf(pacing)<0)throw Error('Invalid codec/pacing');
 if(fps!==60&&fps!==120)throw Error('Invalid test frame rate');
 if(![[1920,1080],[2560,1440],[3840,2160]].some(function(s){return s[0]===width&&s[1]===height;})||bitrate<128||bitrate>80000||!Number.isInteger(bitrate)||width>1920&&codec!=='av1'||width>2560&&fps>60)throw Error('Invalid resolution/bitrate combination');
 function delay(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
 function identity(){var d=session.renderer.owner.display;return {device:String(d.device),swapchain:String(d.swapchain)};}
 r.identity=identity();
 function check(){if(r.aborted)throw Error('Performance test canceled');if(session.stats.errors.length)throw Error(session.stats.errors.join('; '));if(JSON.stringify(identity())!==JSON.stringify(r.identity))throw Error('Display owner changed');}
 async function wait(stage,predicate,timeout){r.stage=stage;var end=Date.now()+(timeout||30000);while(Date.now()<end){check();var value=predicate();if(value)return value;await delay(50);}throw Error('Timed out: '+stage);}
 function shown(id){var n=document.getElementById(id);return n&&n.style.display!=='none';}
 async function press(name,x,y){for(var status of [0,1]){var e=document.createEvent('CustomEvent');e.initCustomEvent('engine-input',true,true,{name:name,status:status,x:x,y:y});g.dispatchEvent(e);await delay(status===0?220:100);}}
 async function pointer(id){var n=document.getElementById(id);if(!n)throw Error('Missing '+id);var e=document.createEvent('Event');e.initEvent('click',true,true);n.dispatchEvent(e);await delay(250);}
 async function launcher(){await wait('launcher',function(){var s=core.getState();return !s.busy&&s.mode==='launcher'&&session.active&&session.active.root.id==='civhomebrew';});await delay(300);}
 async function selectLauncher(){
  for(var i=0;i<35;i++){
   var tiles=Array.from(document.querySelectorAll('#payload-grid [data-id]')),wanted=tiles.findIndex(function(n){return n.getAttribute('data-id')==='moonlight-civswitch';}),at=tiles.findIndex(function(n){return n.getAttribute('data-selected')==='true';});
   if(wanted<0)throw Error('Installed Moonlight tile missing');if(at===wanted)return;
   await press(Math.floor(at/6)<Math.floor(wanted/6)?'nav-down':Math.floor(at/6)>Math.floor(wanted/6)?'nav-up':at<wanted?'nav-right':'nav-left');
  }throw Error('Could not select Moonlight');
 }
 async function selectStreamApp(){
  for(var i=0;i<40;i++){
   var cards=Array.from(document.querySelectorAll('#moonlight-game-list [data-app-id]')),target=config.appId?cards.find(function(n){return n.getAttribute('data-app-id')===String(config.appId)&&n.getAttribute('aria-disabled')!=='true';}):cards.find(function(n){return n.getAttribute('data-running')==='true';})||cards.find(function(n){return /desktop/i.test(n.getAttribute('aria-label')||'')&&n.getAttribute('aria-disabled')!=='true';})||cards.find(function(n){return n.getAttribute('aria-disabled')!=='true';}),at=document.querySelector('#moonlight-game-list [data-selected="true"]');
   if(!target)throw Error('No available Sunshine application');if(target===at)return {id:target.getAttribute('data-app-id'),title:target.getAttribute('aria-label')};
   if(!at){await press('nav-up');continue;}
   var row=Number(at.getAttribute('aria-rowindex')),wanted=Number(target.getAttribute('aria-rowindex')),col=Number(at.getAttribute('aria-colindex')),wc=Number(target.getAttribute('aria-colindex'));
   await press(row<wanted?'nav-down':row>wanted?'nav-up':col<wc?'nav-right':'nav-left');
  }throw Error('Could not select Sunshine application');
 }
 // Intercept only the app's fresh adapters. Pairing and saved settings are read,
 // never rewritten. An alternate route reuses the first host's pinned identity.
 Object.defineProperty(g,'MoonlightNative',{configurable:true,get:function(){return nativeValue;},set:function(value){
  nativeValue=value;nativeOriginal=value.create;
  value.create=function(){var t=nativeOriginal.apply(this,arguments),list=t.listHosts,load=t.loadHost,loadSettings=t.loadStreamSettings,hosts=list.call(t),chosen=hosts.find(function(h){return h.address===config.sunshine;})||hosts[0];
   if(!chosen)throw Error('No paired Sunshine host');var endpoint=config.sunshine||chosen.address;r.host=endpoint;
   t.listHosts=function(){return [Object.assign({},chosen,{address:endpoint})];};t.loadHost=function(address){return load.call(t,address===endpoint?chosen.address:address);};
   t.loadStreamSettings=function(){return g.MoonlightSettings.validate(Object.assign({},loadSettings.call(t),{width:width,height:height,fps:fps,bitrate:bitrate,codec:codec,videoPacing:pacing,showStats:!!config.showStats}));};return t;
  };
 }});
 var previousLuma=null;r.motionSamples=[];r.statsUpdateCosts=[];
 function sampleMotion(){
  var d=g.MoonlightNativeDisplay&&g.MoonlightNativeDisplay.state(),l=g.MoonlightNativeModules&&g.MoonlightNativeModules.layout;
  if(!d||!d.ready||!l||!d.sequence)return;
  var n=d.context.native,p=BigInt(d.storage),stride=Number(n.read32(p+BigInt(l.VIDEO.base+l.VIDEO.stride))),w=Number(n.read32(p+BigInt(l.VIDEO.base+l.VIDEO.width))),h=Number(n.read32(p+BigInt(l.VIDEO.base+l.VIDEO.height)));
  if(w!==width||h!==height||stride<w||stride*h>l.FRAME_BYTES)return;
  var values=[],changed=0;
  for(var y=0;y<5;y++)for(var x=0;x<5;x++){var offset=Math.floor((y+.5)*h/5)*stride+Math.floor((x+.5)*w/5),v=Number(n.read32(p+BigInt(l.FRAMES_OFFSET+offset)))&255;values.push(v);if(previousLuma&&Math.abs(v-previousLuma[values.length-1])>8)changed++;}
  r.motionSamples.push({time:Date.now(),changed:previousLuma?changed:null,luma:values});if(r.motionSamples.length>200)r.motionSamples.shift();previousLuma=values;
 }
 Object.defineProperty(g,'MoonlightStreamClient',{configurable:true,get:function(){return clientValue;},set:function(value){
  clientValue=value;clientOriginal=value.create;
  value.create=function(options){
   options=Object.assign({},options,{mode:Object.assign({},options.mode,{width:width,height:height,fps:fps,bitrate:bitrate,codec:codec,videoPacing:pacing})});
   if(config.profile){
    for(var displayMethod of ['videoBuffer','publish','finish'])instrument(g.MoonlightNativeDisplay,displayMethod,'display-'+displayMethod);
    var ioCreate=g.MoonlightStreamIO.create;g.MoonlightStreamIO.create=function(){
     var io=ioCreate.apply(this,arguments),attach=io.attachCore,originalIo=io.io,closeIo=io.close,optionMemory=0;
     r.receiveBuffers=[];
     io.io=function(op,a,heap){var result=originalIo.apply(this,arguments);
      if(optionMemory&&op===7&&a[1]===1&&a[2]===8){var view=new DataView(heap.buffer),requested=view.getInt32(a[3],true);view.setUint32(optionMemory+4,4,true);var got=originalIo(8,[a[0],1,8,optionMemory,optionMemory+4,0],heap);r.receiveBuffers.push({fd:a[0],requested:requested,result:result,actual:got===0?view.getInt32(optionMemory,true):null,getResult:got});}
      return result;
     };
     instrument(io,'io',function(a){return 'socket-'+a[0];});instrument(io,'receiveVideoBatch','receive-video-batch');io.attachCore=function(c){
      profileCore=c;optionMemory=c._malloc(8);if(!optionMemory)throw Error('Profile option allocation failed');
      if(c._ml_crypto_cache_benchmark){if(c._ml_test_crypto()!==0)throw Error('Console crypto known-answer check failed');r.cryptoBenchmark={messages:100,referenceMs:c._ml_crypto_cache_benchmark(100,0),cachedMs:c._ml_crypto_cache_benchmark(100,1)};if(r.cryptoBenchmark.referenceMs<0||r.cryptoBenchmark.cachedMs<0)throw Error('Console crypto benchmark failed');}
      instrument(c,'_ml_runtime_pump','pump');return attach.apply(this,arguments);
     };io.close=function(){if(optionMemory){profileCore._free(optionMemory);optionMemory=0;}return closeIo.apply(this,arguments);};return io;
    };profileRemovers.push(function(){g.MoonlightStreamIO.create=ioCreate;});
    var mediaCreate=g.MoonlightNativeVideo.createMedia;g.MoonlightNativeVideo.createMedia=async function(){var media=await mediaCreate.apply(this,arguments);for(var name of ['videoFrame','audioFrame','drainVideo','finishVideo','drainAudio'])instrument(media,name,name);return media;};profileRemovers.push(function(){g.MoonlightNativeVideo.createMedia=mediaCreate;});
    var gestureCreate=g.MoonlightTouchInput.create;g.MoonlightTouchInput.create=function(){var gesture=gestureCreate.apply(this,arguments);instrument(gesture,'update','touch-route');return gesture;};profileRemovers.push(function(){g.MoonlightTouchInput.create=gestureCreate;});
    instrument(document.getElementById('moonlight-stream-screen'),'getBoundingClientRect','touch-bounds');
   }
   var onStats=options.onStats,onError=options.onError,onPresented=options.onPresented,lastPresentedAt=null;
   options.onPresented=function(){var at=g.MoonlightTelemetry.now();if(lastPresentedAt!==null)r.intervals.push({time:Date.now(),phase:phase(),ms:at-lastPresentedAt});lastPresentedAt=at;if(r.intervals.length>20000)r.intervals.shift();if(onPresented)onPresented();};
   options.onStats=function(s){sampleMotion();r.latest=s;var ui=session.active&&session.active.ui;r.samples.push({time:Date.now(),phase:phase(),physicalTouchSamples:r.physicalTouchSamples,stats:s,ui:ui?Object.assign({},ui.stats):null});if(r.samples.length>200)r.samples.shift();var updateBegin=g.MoonlightTelemetry.now();if(onStats)onStats(s);r.statsUpdateCosts.push({time:Date.now(),ms:g.MoonlightTelemetry.now()-updateBegin});};
   options.onError=function(error){r.streamError=String(error.message||error);if(onError)onError(error);};
   live=clientOriginal(options);
   if(config.simulateTouch){var button=live.mouseButton;live.mouseButton=function(){if(r.stage==='measuring'){r.suppressedMouseButtons=(r.suppressedMouseButtons||0)+1;return 0;}return button.apply(this,arguments);};profileRemovers.push(function(){live.mouseButton=button;});}
   instrument(live,'mouseMove','mouse-enqueue');instrument(live,'gamepad','controller-enqueue');return live;
  };
 }});
 function summary(first,last){
  var seconds=(last.time-first.time)/1000,a=first.stats,b=last.stats;
  function delta(k){return (b[k]||0)-(a[k]||0);}var count=delta('intervalCount'),mean=count?delta('intervalMs')/count:null;
  var intervals=r.intervals.filter(function(v){return v.time>first.time&&v.time<=last.time;}).map(function(v){return v.ms;}).sort(function(a,b){return a-b;});
  function percentile(p){return intervals.length?intervals[Math.min(intervals.length-1,Math.floor((intervals.length-1)*p))]:null;}
  return {seconds:seconds,decodedFps:delta('decoded')/seconds,presentedFps:delta('presented')/seconds,receivedMbps:((b.network.receivedBytes||0)-(a.network.receivedBytes||0))*8/seconds/1000000,
   frameIntervalMs:mean,frameJitterMs:count?Math.sqrt(Math.max(0,delta('intervalSquaredMs')/count-mean*mean)):null,maxIntervalMs:percentile(1),p50IntervalMs:percentile(.5),p95IntervalMs:percentile(.95),p99IntervalMs:percentile(.99),
   stallsOver25Ms:intervals.filter(function(v){return v>25;}).length,stallsOver50Ms:intervals.filter(function(v){return v>50;}).length,stallsOver100Ms:intervals.filter(function(v){return v>100;}).length,
   stallsOverOneAndHalfFrames:intervals.filter(function(v){return v>1500/fps;}).length,
   videoSuperseded:delta('videoSuperseded'),videoExpired:delta('videoExpired'),videoBacklogDrops:delta('videoBacklogDrops'),decoderRejected:b.telemetry.decoderRejected-a.telemetry.decoderRejected,
   videoFrameGaps:b.telemetry.videoFrameGaps-a.telemetry.videoFrameGaps,audioEmptyEpisodes:delta('audioEmptyEpisodes'),audioEmptyMs:delta('audioEmptyMs'),audioDiscardedMs:delta('audioDiscardedMs'),
   pumpAvgMs:delta('iterations')?delta('pumpMs')/delta('iterations'):null,drainAvgMs:delta('iterations')?delta('drainMs')/delta('iterations'):null,
   decoderPending:b.decoderPending,copyPresentMs:delta('presented')?delta('conversionMs')/delta('presented'):null,presentationTimings:Object.fromEntries(Object.keys(b.presentationTimings||{}).map(function(k){return [k,b.presentationTimings[k]-(a.presentationTimings&&a.presentationTimings[k]||0)];})),
   uiSnapshots:first.ui&&last.ui?last.ui.snapshots-first.ui.snapshots:null,uiFrames:first.ui&&last.ui?last.ui.frames-first.ui.frames:null,simulatedTouchSamples:r.simulatedTouchSamples||0};
 }
 r.stop=async function(){r.aborted=true;if(live)await live.stop();if(g.__moonlightSimpleUI)await g.__moonlightSimpleUI.close();};
 r.run=async function(){
  try{
   await core.showLauncher();await launcher();r.servicesBefore=core.getState().services;
   await selectLauncher();await press('accept');
   await wait('hosts',function(){return shown('moonlight-hosts-screen')&&core.getState().mode==='app';},60000);await delay(500);
   controllerCreate=g.MoonlightControllerInput.createNative;
   g.MoonlightControllerInput.createNative=function(){var adapter=controllerCreate.apply(this,arguments),poll=adapter.poll;adapter.poll=function(){var input=poll.apply(adapter,arguments);if(injectChord){input={state:input.state.slice(),exit:true};input.state[0]|=0x30;injectChord=false;}return input;};return adapter;};
   if(config.simulateTouch||config.profile){
    touchCreate=g.MoonlightTouchInput.createNative;
    g.MoonlightTouchInput.createNative=function(){var adapter=touchCreate.apply(this,arguments);instrument(adapter,'poll','hid-touch');var poll=adapter.poll,lastSource=null;adapter.poll=function(){
     var real=poll.apply(adapter,arguments);r.lastPhysicalTouchCount=real.length;if(real.length){r.physicalTouchSamples++;var counts=r.physicalTouchesByPhase||(r.physicalTouchesByPhase={}),name=phase();counts[name]=(counts[name]||0)+1;}
     if(config.simulateTouch&&r.stage==='measuring'&&config.touchPattern==='alternating'&&phase()!=='touch'){if(real.length)r.suppressedPhysicalSamples=(r.suppressedPhysicalSamples||0)+1;lastSource=null;return [];}
     if(!config.simulateTouch||r.stage!=='measuring')return real;
     var source=real.length?'physical':'synthetic',changed=lastSource&&lastSource!==source;lastSource=source;
     // A direct primary-ID replacement deliberately cancels a gesture. Supply
     // a release between probe sources so the safety gate can become neutral.
     if(changed){r.touchSourceReleases=(r.touchSourceReleases||0)+1;return [];}
     if(real.length)return real;r.simulatedTouchSamples=(r.simulatedTouchSamples||0)+1;return [{id:0xfffffff0,x:.5+Math.sin(Date.now()/500)*.15,y:.5}];
    };return adapter;};
   }
   await press('accept');await wait('games',function(){return shown('moonlight-games-screen')&&document.querySelector('#moonlight-game-list [data-app-id]');});await delay(500);
   r.app=await selectStreamApp();if(config.terminateDesktop&&!/^(desktop|virtual display)$/i.test(r.app.title))throw Error('Terminate check only permits Desktop or Virtual Display');await press('accept');
   await wait('first-frames',function(){if(r.streamError)throw Error(r.streamError);return r.latest&&r.latest.presented>=3;},30000);
   var graphics=g.MoonlightNativeDisplay.state(),refreshController=graphics&&graphics.refresh;
   if(refreshController)r.refreshDuring=await refreshController.read();
   if(r.latest.mode.width!==width||r.latest.mode.height!==height||r.latest.mode.fps!==fps||r.latest.mode.bitrate!==bitrate||r.latest.codec!==codec)throw Error('Requested stream mode mismatch');
   r.stage='warmup';await delay(warmup);check();if(r.streamError)throw Error(r.streamError);
   r.measurementStart=r.samples[r.samples.length-1];measurementBegan=Date.now();if(profileCore&&profileCore._ml_runtime_profile_enable)profileCore._ml_runtime_profile_enable(1);r.stage='measuring';
   var end=Date.now()+duration;
   while(Date.now()<end){await delay(250);check();if(r.streamError)throw Error(r.streamError);if(!shown('moonlight-stream-screen'))throw Error('Stream exited during measurement');}
   r.measurementEnd=r.samples[r.samples.length-1];r.summary=summary(r.measurementStart,r.measurementEnd);
   r.taskProfile=taskProfile();if(profileCore&&profileCore._ml_runtime_profile_enable)profileCore._ml_runtime_profile_enable(0);
   r.phaseSummaries={};for(var name of ['off-before','touch','off-after']){var samples=r.samples.filter(function(s){return s.phase===name&&s.time>=measurementBegan;});if(samples.length>1)r.phaseSummaries[name]=summary(samples[0],samples[samples.length-1]);}
   if(config.showStats){
    var graphicsState=g.MoonlightNativeDisplay.state(),layout=g.MoonlightNativeModules.layout,native=graphicsState.context.native,at=BigInt(graphicsState.storage);
    r.overlay={method:graphicsState.statistics?'native-badge':'dom',visible:Number(native.read32(at+BigInt(layout.BADGE.visible))),width:Number(native.read32(at+BigInt(layout.BADGE.width))),height:Number(native.read32(at+BigInt(layout.BADGE.height))),counters:graphicsState.statisticsCounters||null};
    if(graphicsState.statistics){r.overlay.background=Number(native.read32(at+BigInt(layout.BADGE_OFFSET)));r.overlay.textPixel=Number(native.read32(at+BigInt(layout.BADGE_OFFSET+(8*672+12)*4)));}
   }
   if(r.measurementEnd.stats.presented<=r.measurementStart.stats.presented)throw Error('Video presentation stopped');
   // Normal UI disconnect, followed by normal navigation back to Launcher.
   injectChord=true;
   await wait('stream-menu',function(){return shown('moonlight-stream-menu');},5000);
   await pointer('moonlight-stream-menu-logout');await wait('disconnect-dialog',function(){return shown('moonlight-stream-exit');},5000);if(config.terminateDesktop)await press('nav-right');await press('accept');
   await wait('games-return',function(){return shown('moonlight-games-screen')&&!shown('moonlight-stream-screen');});
   r.stopped=g.__moonlightStreamDiagnostics.stats;if(g.__moonlightStreamUnfinished||r.stopped.tasks!==0)throw Error('Stream did not clean up');
   r.messages=g.__moonlightStreamDiagnostics.messages.slice();
   if(refreshController){r.refreshAfter=await refreshController.read();await refreshController.close();if(r.refreshAfter.flags===null||(BigInt(r.refreshAfter.flags)&2n)!==0n)throw Error('Display refresh did not restore after disconnect');}
   await delay(400); // The Games view deliberately debounces input after close.
   if(config.terminateDesktop){
    await wait('terminated-library',function(){return !document.querySelector('#moonlight-game-list [data-running="true"]')&&document.querySelector('#moonlight-game-list [aria-disabled="false"]');});
    r.navigation=[];
    for(var step=0;step<48;step++){
     if(step<24)await press(['nav-right','nav-down','nav-left','nav-up'][step%4]);else await press('nav-move',[1,0,-1,0][step%4],[0,-1,0,1][step%4]);check();
     var selected=document.querySelector('#moonlight-games-screen [data-selected="true"]'),ui=session.active.ui;
     if(ui.stats.error)throw Error(ui.stats.error);
     r.navigation.push({step:step,input:step<24?'dpad':'stick',selected:selected&&selected.getAttribute('data-app-id')||selected&&selected.id,frames:ui.stats.frames,renderMs:ui.stats.renderMs});
    }
    r.library={nativeSources:Array.from(document.querySelectorAll('#moonlight-game-list canvas[data-civ-pixels]'),function(n){return n.getAttribute('data-civ-pixels');}),gamefaceImages:document.querySelectorAll('#moonlight-game-list img').length,textureBytes:Array.from(session.geometry.textures.values()).reduce(function(total,t){return total+t.bytes.length;},0)};
   }
   await press('cancel');await wait('hosts-return',function(){return shown('moonlight-hosts-screen');},5000);await press('cancel');await launcher();
   r.finalResident=core.getState();r.finalIdentity=identity();r.complete=true;r.stage='complete';
  }catch(error){r.error=String(error.stack||error).slice(0,1600);r.stage='failed';try{if(live)await live.stop();if(g.__moonlightSimpleUI)await g.__moonlightSimpleUI.close();}catch(cleanup){r.cleanupError=String(cleanup.message||cleanup);}}
  finally{
   profileRemovers.reverse().forEach(function(remove){remove();});
   if(controllerCreate&&g.MoonlightControllerInput)g.MoonlightControllerInput.createNative=controllerCreate;
   if(touchCreate&&g.MoonlightTouchInput)g.MoonlightTouchInput.createNative=touchCreate;
   if(nativeValue){nativeValue.create=nativeOriginal;Object.defineProperty(g,'MoonlightNative',{configurable:true,writable:true,value:nativeValue});}else if(nativeDescriptor)Object.defineProperty(g,'MoonlightNative',nativeDescriptor);else delete g.MoonlightNative;
   if(clientValue){clientValue.create=clientOriginal;Object.defineProperty(g,'MoonlightStreamClient',{configurable:true,writable:true,value:clientValue});}else if(clientDescriptor)Object.defineProperty(g,'MoonlightStreamClient',clientDescriptor);else delete g.MoonlightStreamClient;
   r.finished=Date.now();
  }
 };
 r.done=new Promise(function(resolve){setTimeout(function(){r.run().then(resolve,resolve);},500);});
 await log('MOONLIGHT_PERFORMANCE_ARMED');
})(window);
