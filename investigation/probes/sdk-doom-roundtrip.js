/* Actual installed app, native engine/audio/GPU; synthetic controller samples. */
(async function(g){
 'use strict';
 var core=g.__civhomebrewCore,sdk=g.CivHomebrewSDK,session=sdk.nativeUI.sessions.current;
 if(sdk.version!=='1.3.0'||!session)throw Error('SDK 1.3.0 Launcher required');
 var r={version:1,stage:'armed',complete:false,error:null,cycles:[],started:Date.now()};g.__sdkDoomTest=r;
 if(g.__sdkDoomMonitor)await g.__sdkDoomMonitor.stop();
 if(g.__sdkDoomMonitoring===true)g.__sdkDoomMonitor=g.__civhomebrewBoot.native.serve(9028,function(){var app=g.__civswitchApp;return {response:{ok:true,stage:r.stage,complete:r.complete,error:r.error,finished:r.finished||null,resident:core.getState(),app:app&&app.id==='doom-civhomebrew'?app.getState():null}};},function(e){r.monitorError=String(e);});
 var renderer=session.renderer,factory=g.CivNanoVGFactory,display=renderer.owner.display;
 var owner={device:String(display.device),swapchain:String(display.swapchain)};r.owner=owner;
 var desired=null,exit=false,runner=null,create=null,controllerValue=null,controllerCreate=null;
 var controllerDescriptor=Object.getOwnPropertyDescriptor(g,'DoomControllerInput');
 var io=g.__civhomebrewBoot.native.io,read=io.read;
 io.read=async function(path){
  if(path.indexOf('/apps/doom-civhomebrew/scripts/')>=0){
   r.orderedSourceReads=(r.orderedSourceReads||0)+1;
   if(session.active)throw Error('Launcher view still active during ordered Doom load');
   r.loadingViewClosedBeforeReads=true;
   if(g.__sdkTraceDoomReads){r.stage='reading:'+path;await new Promise(function(resolve){setTimeout(resolve,600);});}
   var value=await read.apply(this,arguments);
   if(g.__sdkTraceDoomReads){r.stage='evaluating:'+path;await new Promise(function(resolve){setTimeout(resolve,600);});}
   return value;
  }
  return read.apply(this,arguments);
 };
 function delay(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
 function check(){if(session.renderer!==renderer||g.CivNanoVGFactory!==factory||String(display.device)!==owner.device||String(display.swapchain)!==owner.swapchain)throw Error('Native owner changed');if(session.stats.errors.length)throw Error(session.stats.errors.join('; '));}
 async function wait(stage,predicate,ms){r.stage=stage;var end=Date.now()+(ms||30000);while(Date.now()<end){check();var v=predicate();if(v)return v;await delay(80);}throw Error('Timed out '+stage+': '+JSON.stringify(core.getState()));}
 async function press(name){var e=document.createEvent('CustomEvent');e.initCustomEvent('engine-input',true,true,{name:name,status:0});g.dispatchEvent(e);await delay(300);e=document.createEvent('CustomEvent');e.initCustomEvent('engine-input',true,true,{name:name,status:1});g.dispatchEvent(e);await delay(180);}
 async function tap(button){desired=[button,0,0,0,0,0,0];await delay(450);desired=[0,0,0,0,0,0,0];await delay(450);}
 function state(){return JSON.parse(JSON.stringify(g.__civswitchApp.getState()));}
 async function profile(name,input){
  r.stage='profiling-'+name;desired=input;await delay(2500);
  var before=state(),uploaded=renderer.owner.uploadedBytes,presentations=renderer.owner.presentations,start=Date.now();
  await delay(8000);var elapsed=Date.now()-start,after=state(),frames=after.timings.renders-before.timings.renders;
  if(frames<1||after.gameState!==0||after.menu)throw Error('Gameplay profile stopped: '+name);
  return {scene:name,elapsedMs:elapsed,frames:frames,fps:frames*1000/elapsed,ticsPerSecond:(after.gametic-before.gametic)*1000/elapsed,
   renderMsPerFrame:(after.timings.renderMs-before.timings.renderMs)/frames,presentMsPerFrame:(after.timings.presentMs-before.timings.presentMs)/frames,
   audioCPUPercent:100*(after.timings.audioMs-before.timings.audioMs)/elapsed,audioBuffersPerSecond:(after.audio.queued-before.audio.queued)*1000/elapsed,
   uploadedBytesPerFrame:(renderer.owner.uploadedBytes-uploaded)/frames,presentations:renderer.owner.presentations-presentations,
   lastPresentation:Object.assign({},renderer.owner.lastTiming),texturePreparation:Object.assign({},session.geometry.stats)};
 }
 async function launcher(){await wait('launcher',function(){var s=core.getState();return s.mode==='launcher'&&!s.busy&&session.active&&session.active.root.id==='civhomebrew'&&session.active.ui.stats.frames>0;});await delay(500);}
 async function selectDoom(){var tiles=Array.from(document.querySelectorAll('#payload-grid [data-id]')),target=tiles.findIndex(function(n){return n.getAttribute('data-id')==='doom-civhomebrew';});if(target<0)throw Error('No Doom tile');for(var i=0;i<30;i++){var at=g.__civswitchApp.getState().selected;if(at===target)return;await press(Math.floor(at/6)<Math.floor(target/6)?'nav-down':Math.floor(at/6)>Math.floor(target/6)?'nav-up':at<target?'nav-right':'nav-left');}throw Error('Doom navigation failed');}
 function hookController(value){controllerValue=value;controllerCreate=value.createNative;value.createNative=function(){var pad=controllerCreate.apply(this,arguments),poll=pad.poll;pad.poll=function(){var physical=poll.apply(pad,arguments);if(exit){exit=false;return {exit:true,state:[0x30,0,0,0,0,0,0]};}return desired?{exit:false,state:desired.slice()}:physical;};return pad;};}
 function parity(){var c=document.querySelector('#doom-civhomebrew canvas'),box=c.getBoundingClientRect(),heap=runner.core.HEAPU8,at=runner.core._doom_framebuffer(),points=[[40,30],[100,70],[170,100],[250,140]],screen=points.map(function(p){return [Math.floor((box.left+(p[0]+.5)*box.width/320)*1920/innerWidth),Math.floor((box.top+(p[1]+.5)*box.height/200)*1080/innerHeight)];}),actual=renderer.sample(screen);return points.map(function(p,i){var offset=at+(p[1]*320+p[0])*4,expected=Array.from(heap.slice(offset,offset+4)),value=Array.from(actual[i]);if(value.some(function(v,j){return Math.abs(v-expected[j])>1;}))throw Error('Engine/GPU pixel mismatch '+JSON.stringify({expected:expected,actual:value}));return {expected:expected,actual:value};});}
 Object.defineProperty(g,'DoomControllerInput',{configurable:true,get:function(){return controllerValue;},set:hookController});
 r.done=new Promise(function(resolve){setTimeout(async function(){try{
  await core.showLauncher();await launcher();
  for(var cycle=0;cycle<(g.__sdkDoomCycles||2);cycle++){
   var result={cycle:cycle};r.cycles.push(result);desired=null;await selectDoom();if(g.__sdkPauseLoadingView&&session.active)await session.active.lease.close();await press('accept');
   await wait('doom-selector',function(){return core.getState().mode==='app'&&g.__civswitchApp&&g.__civswitchApp.id==='doom-civhomebrew'&&session.active&&session.active.root.id==='doom-civhomebrew';},90000);
   if(g.__civswitchApp.getState().sdk!=='1.3.0'||g.__civswitchApp.getState().uiRenderer!=='native-shared')throw Error('Doom is not SDK native');
   if(g.__sdkDoomSelectorOnly){r.stage='selector-visible';await delay(7000);await press('cancel');await launcher();result.complete=true;result.selectorOnly=true;break;}
   var buttons=Array.from(document.querySelectorAll('#doom-civhomebrew button')),index=buttons.findIndex(function(b){return b.textContent==='doom1.wad';});if(index<0)throw Error('Shareware WAD missing');
   for(var i=0;g.__civswitchApp.getState().selected!==index&&i<8;i++)await press(g.__civswitchApp.getState().selected<index?'nav-down':'nav-up');
   create=g.DoomRuntime.create;g.DoomRuntime.create=async function(){runner=await create.apply(this,arguments);return runner;};
   desired=[0,0,0,0,0,0,0];await press('accept');await wait('doom-engine',function(){var s=g.__civswitchApp.getState();return runner&&s.running&&s.frames>2;},120000);
   result.initial=JSON.parse(JSON.stringify(g.__civswitchApp.getState()));if(result.initial.renderer!=='native-shared'||!result.initial.audio||result.initial.audio.kind!=='native')throw Error('Native rendering/audio unavailable');
   if(!runner.menu())await tap(0x10);
   for(var m=0;m<5;m++){await tap(0x2000);var state=g.__civswitchApp.getState();if(state.gameState===0&&!state.menu)break;}
   await wait('doom-gameplay',function(){var s=g.__civswitchApp.getState();return s.running&&s.gameState===0&&!s.menu;},30000);
   result.before=JSON.parse(JSON.stringify(g.__civswitchApp.getState()));result.measurementStart=Date.now();result.uploadedBefore=renderer.owner.uploadedBytes;result.soundBefore=runner.core._doom_sound_starts();r.stage='playing-doom-'+cycle;
   if(cycle===0){result.profiles=[];result.profiles.push(await profile('stationary',[0,0,0,0,0,0,0]));result.profiles.push(await profile('turning',[0,0,0,0,0,22000,0]));result.profiles.push(await profile('firing',[0,0,255,0,0,0,0]));}
   else{desired=[0,0,0,0,26000,0,0];await delay(3500);desired=[0,0,0,0,0,22000,0];await delay(2500);desired=[0,0,255,0,0,0,0];await delay(7000);}
   desired=[0,0,0,0,0,0,0];await delay(700);
   result.measurementMs=Date.now()-result.measurementStart;result.after=JSON.parse(JSON.stringify(g.__civswitchApp.getState()));result.uploadedAfter=renderer.owner.uploadedBytes;result.presentationTiming=Object.assign({},renderer.owner.lastTiming);result.texturePreparation=Object.assign({},session.geometry.stats);result.soundAfter=runner.core._doom_sound_starts();result.pixels=parity();
   if(result.after.gametic<=result.before.gametic||result.after.frames<=result.before.frames||result.soundAfter<=result.soundBefore)throw Error('Gameplay or sound did not advance');
   if(core.getState().ftp||!core.getState().services.rpc||!core.getState().services.raw)throw Error('Child service ownership mismatch');
   g.DoomRuntime.create=create;create=null;exit=true;await launcher();desired=null;runner=null;
   result.pixelSlots=Array.from(session.geometry.textures.values()).filter(function(t){return t.type===3;}).length;
   if(result.pixelSlots!==1||g.__doomAudioOwner||g.__doomQuarantine||g.DoomBundledData)throw Error('Doom native cleanup failed');
   result.returned=core.getState();result.complete=true;check();
  }
  r.complete=true;r.stage='complete';
 }catch(e){r.error=String(e.stack||e).slice(0,2000);r.stage='failed';try{var app=g.__civswitchApp;if(app&&app.id==='doom-civhomebrew')await app.close();}catch(cleanup){r.cleanupError=String(cleanup);}}
 finally{io.read=read;desired=null;runner=null;if(create&&g.DoomRuntime)g.DoomRuntime.create=create;if(controllerValue){controllerValue.createNative=controllerCreate;Object.defineProperty(g,'DoomControllerInput',{configurable:true,writable:true,value:controllerValue});}else if(controllerDescriptor)Object.defineProperty(g,'DoomControllerInput',controllerDescriptor);else delete g.DoomControllerInput;r.finished=Date.now();resolve();}},500);});
 await log('SDK_DOOM_ROUNDTRIP_ARMED');
})(window);
