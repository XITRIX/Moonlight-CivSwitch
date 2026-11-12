/* Finite resident-owned test: real installed Launcher/app, Sunshine and native
 * media. Injects UI input events; it does not qualify physical controller input. */
(async function(g){
 'use strict';
 if(typeof g.__sdkTestSunshineAddress!=='string'||!/^\d{1,3}(\.\d{1,3}){3}$/.test(g.__sdkTestSunshineAddress)||g.__sdkTestSunshineAddress.split('.').some(function(v){return Number(v)>255;}))throw Error('Set __sdkTestSunshineAddress to the reachable paired Sunshine IPv4 address');
 if(g.__moonlightRoundtrip&&!g.__moonlightRoundtrip.complete)throw Error('Roundtrip test already active');
 var core=g.__civhomebrewCore,session=g.CivNanoVGSession&&g.CivNanoVGSession.current;
 if(!core||!session||session.api!==1||!session.renderer.bindSurface)throw Error('Matching native Launcher is required');
 var r={version:1,started:Date.now(),stage:'armed',complete:false,error:null,cycles:[],aborted:false,expectedIdentity:g.__civNanoVGMainLauncher.identity};g.__moonlightRoundtrip=r;
 var create=null,controllerCreate=null,injectChord=false;
 var endpoint=g.__sdkTestSunshineAddress,nativeValue=null,nativeOriginal=null,nativeDescriptor=Object.getOwnPropertyDescriptor(g,'MoonlightNative');r.testEndpoint=endpoint;
 Object.defineProperty(g,'MoonlightNative',{configurable:true,get:function(){return nativeValue;},set:function(value){nativeValue=value;nativeOriginal=value.create;var base=value.create;value.create=function(){var transport=base.apply(this,arguments),list=transport.listHosts,load=transport.loadHost,hosts=list.call(transport),original=hosts[0]&&hosts[0].address;transport.listHosts=function(){return hosts.length?[Object.assign({},hosts[0],{address:endpoint+':47989'})]:[];};transport.loadHost=function(address){return load.call(transport,address===endpoint+':47989'?original:address);};return transport;};}});
 function delay(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
 function identity(){var d=session.renderer.owner.display;return {device:String(d.device),swapchain:String(d.swapchain)};}
 var originalIdentity=identity();r.identity=originalIdentity;
 function check(){if(r.aborted)throw Error('Test canceled');if(session.stats.errors.length)throw Error(session.stats.errors.join('; '));if(JSON.stringify(identity())!==JSON.stringify(originalIdentity))throw Error('Native display owner changed');}
 async function wait(name,predicate,timeout){r.stage=name;var end=Date.now()+(timeout||30000);while(Date.now()<end){check();var result=predicate();if(result)return result;await delay(50);}throw Error('Timed out: '+name);}
 async function press(name){var e=document.createEvent('CustomEvent');e.initCustomEvent('engine-input',true,true,{name:name,status:0});g.dispatchEvent(e);await delay(220);var up=document.createEvent('CustomEvent');up.initCustomEvent('engine-input',true,true,{name:name,status:1});g.dispatchEvent(up);await delay(100);}
 async function pointer(id){var node=document.getElementById(id);if(!node)throw Error('Missing control: '+id);var e=document.createEvent('Event');e.initEvent('click',true,true);node.dispatchEvent(e);await delay(250);}
 function shown(id){var n=document.getElementById(id);return n&&n.style.display!=='none';}
 function snapshot(){var active=session.active;if(!active||!active.ui.scene)throw Error('No native UI scene');return {root:active.root.id,frames:active.ui.stats.frames,commands:active.ui.scene.commands.length,error:active.ui.stats.error};}
 function launcherPixels(){var active=session.active,scene=active.ui.scene,border=scene.commands.find(function(c){return c.kind==='border'&&c.color[0]<.01&&c.color[1]>.9&&c.color[2]>.7;});if(!border)throw Error('Native Launcher selected border missing');var rect=border.rect,pixel=session.renderer.sample([[Math.floor(rect[0]+1),Math.floor((rect[1]+rect[3])/2)]])[0];if(pixel[0]>3||Math.abs(pixel[1]-239)>3||Math.abs(pixel[2]-207)>3)throw Error('Native Launcher GPU border mismatch');return pixel;}
 async function launcher(){await wait('launcher-ready',function(){var s=core.getState(),a=session.active;return s.mode==='launcher'&&!s.busy&&a&&a.root.id==='civhomebrew'&&a.ui.stats.frames>0;});await delay(400);return {ui:snapshot(),pixel:launcherPixels(),services:core.getState().services,ftp:core.getState().ftp};}
 async function selectLauncherApp(){
  var tiles=Array.from(document.querySelectorAll('#payload-grid [data-id]')),target=tiles.findIndex(function(n){return n.getAttribute('data-id')==='moonlight-civswitch';});if(target<0)throw Error('Moonlight tile missing');
  for(var i=0;i<30;i++){var current=tiles.findIndex(function(n){return n.getAttribute('data-selected')==='true';});if(current===target)return;var row=Math.floor(current/6),wanted=Math.floor(target/6);await press(row<wanted?'nav-down':row>wanted?'nav-up':current<target?'nav-right':'nav-left');}throw Error('Could not select Moonlight');
 }
 async function selectStreamApp(){
  var cards=Array.from(document.querySelectorAll('#moonlight-game-list [data-app-id]')),target=cards.find(function(n){return n.getAttribute('data-running')==='true';})||cards.find(function(n){return /desktop/i.test(n.getAttribute('aria-label')||'')&&n.getAttribute('aria-disabled')!=='true';})||cards.find(function(n){return n.getAttribute('aria-disabled')!=='true';});if(!target)throw Error('No available Sunshine app');
  for(var i=0;i<40;i++){var current=document.querySelector('#moonlight-game-list [data-selected="true"]');if(current===target)return {id:target.getAttribute('data-app-id'),title:target.getAttribute('aria-label')};if(!current){await press('nav-up');continue;}var row=Number(current.getAttribute('aria-rowindex')),wanted=Number(target.getAttribute('aria-rowindex')),col=Number(current.getAttribute('aria-colindex')),wc=Number(target.getAttribute('aria-colindex'));await press(row<wanted?'nav-down':row>wanted?'nav-up':col<wc?'nav-right':'nav-left');}throw Error('Could not select Sunshine app');
 }
 function stats(){return g.__moonlightStreamDiagnostics&&g.__moonlightStreamDiagnostics.stats;}
 function compact(s){return s?{renderer:s.renderer,codec:s.codec,mode:s.mode,submitted:s.submitted,decoded:s.decoded,presented:s.presented,audioDecoded:s.audioDecoded,audioDropped:s.audioDropped,tasks:s.tasks,state:s.state,displayWidth:s.displayWidth,displayHeight:s.displayHeight,network:s.network}:null;}
 r.stop=async function(){r.aborted=true;if(g.__moonlightSimpleUI)await g.__moonlightSimpleUI.close();};
 r.run=async function(){
  try{
   await core.showLauncher();r.initialLauncher=await launcher();
   for(var codec of ['h264','av1']){
    var cycle={codec:codec,started:Date.now()};r.cycles.push(cycle);await selectLauncherApp();await press('accept');
    await wait('moonlight-hosts',function(){return core.getState().mode==='app'&&shown('moonlight-hosts-screen')&&session.active&&session.active.root.id==='moonlight-simple-ui'&&session.active.ui.stats.frames>0;},60000);await delay(600);cycle.hosts=snapshot();cycle.ftpStopped=!core.getState().ftp;if(!cycle.ftpStopped)throw Error('Launcher FTP remained active in app');
    create=g.MoonlightNative.create;
    g.MoonlightNative.create=function(){var value=create.apply(this,arguments),load=value.loadStreamSettings;value.loadStreamSettings=function(){return g.MoonlightSettings.validate(Object.assign({},load.call(value),{width:1920,height:1080,fps:60,bitrate:20000,codec:codec,videoPacing:'latency'}));};return value;};
    controllerCreate=g.MoonlightControllerInput.createNative;
    g.MoonlightControllerInput.createNative=function(){var adapter=controllerCreate.apply(this,arguments),poll=adapter.poll;adapter.poll=function(){var input=poll.apply(adapter,arguments);if(injectChord){input={state:input.state.slice(),exit:true};input.state[0]|=0x30;injectChord=false;}return input;};return adapter;};
    var hosts=document.querySelectorAll('#moonlight-host-list [data-host-address]');if(!hosts.length)throw Error('No saved paired host');cycle.host=hosts[0].getAttribute('data-host-address');await press('accept');
    await wait('sunshine-games',function(){return shown('moonlight-games-screen')&&document.querySelector('#moonlight-game-list [data-app-id]');},30000);await delay(800);
    // Successful pinned HTTPS above establishes that this is the paired PC.
    // Add its Internet route through the ordinary store, preserving LAN/identity.
    var persistent=nativeOriginal.call(nativeValue),known=persistent.loadHost(cycle.host);
    if(!known){var previousHosts=persistent.listHosts(),record=previousHosts.length&&persistent.loadHost(previousHosts[0].address);if(!record)throw Error('No verified pairing to retain');persistent.saveHost(cycle.host,record);known=persistent.loadHost(cycle.host);if(!known||known.certificatePem!==record.certificatePem||known.uniqueId!==record.uniqueId)throw Error('Public host readback failed');}
    r.publicHostSaved=!!known;
    await wait('native-game-controls',function(){var a=session.active;return a&&a.ui.scene&&a.ui.scene.commands.some(function(c){return c.kind==='text'&&c.id==='moonlight-games-refresh';});},5000);
    cycle.buttonAlignment=['refresh','settings','back'].map(function(name){var n=document.querySelector('#moonlight-games-screen #moonlight-games-'+name),box=n.getBoundingClientRect(),text=session.active.ui.scene.commands.find(function(c){return c.kind==='text'&&c.id===n.id;}),metrics=session.geometry.metrics(text.size,text.font),expected=(box.top+box.bottom)*1080/innerHeight/2,actual=text.baseline-(metrics[0]+metrics[1])/2;if(Math.abs(expected-actual)>1)throw Error('Button is not vertically centered: '+name);return {name:name,expected:expected,actual:actual};});cycle.app=await selectStreamApp();await press('accept');
    await wait('native-stream-frames',function(){var s=stats();return s&&s.renderer==='native-vulkan'&&s.presented>=30;},60000);cycle.firstStats=compact(stats());if(cycle.firstStats.codec!==codec||cycle.firstStats.displayWidth!==1920||cycle.firstStats.displayHeight!==1080)throw Error('Negotiated codec/display mismatch');r.stage='streaming-'+codec;await delay(18000);check();cycle.liveStats=compact(stats());if(cycle.liveStats.presented<=cycle.firstStats.presented)throw Error('Video presentation stopped advancing');
    var overlay=document.getElementById('moonlight-performance-overlay');if(overlay.style.display!=='none'){var lines=session.active.ui.scene.commands.filter(function(c){return c.kind==='text'&&c.id===overlay.id;}),deltas=[];for(var li=1;li<lines.length;li++)deltas.push(lines[li].baseline-lines[li-1].baseline);if(lines.length<2||deltas.some(function(v){return Math.abs(v-lines[0].size*1.4)>1;}))throw Error('Performance overlay line spacing is incorrect');cycle.overlayLayout={computedLineHeight:getComputedStyle(overlay).lineHeight,lines:lines.length,nativeFontSize:lines[0].size,minimumStep:Math.min.apply(null,deltas),maximumStep:Math.max.apply(null,deltas)};}

    injectChord=true;await wait('stream-drawer',function(){return shown('moonlight-stream-menu');},5000);await delay(500);cycle.drawer=snapshot();
    await pointer('moonlight-stream-menu-logout');await wait('disconnect-dialog',function(){return shown('moonlight-stream-exit');},3000);await press('accept');
    await wait('moonlight-games-return',function(){return shown('moonlight-games-screen')&&!shown('moonlight-stream-screen');},30000);await delay(600);cycle.stoppedStats=compact(stats());if(g.__moonlightStreamUnfinished)throw Error('Stream cleanup quarantined resources');if(cycle.stoppedStats.tasks!==0)throw Error('C tasks still running after Disconnect');
    g.MoonlightNative.create=create;create=null;g.MoonlightControllerInput.createNative=controllerCreate;controllerCreate=null;
    await press('cancel');await wait('moonlight-hosts-return',function(){return shown('moonlight-hosts-screen');},5000);await delay(300);await press('cancel');cycle.launcher=await launcher();cycle.identity=identity();cycle.complete=true;cycle.elapsedMs=Date.now()-cycle.started;
   }
   r.complete=true;r.stage='complete';r.elapsedMs=Date.now()-r.started;
  }catch(error){r.error=String(error.stack||error).slice(0,1600);r.stage='failed';try{if(g.__moonlightSimpleUI)await g.__moonlightSimpleUI.close();}catch(cleanup){r.cleanupError=String(cleanup.message||cleanup);}}
  finally{if(create&&g.MoonlightNative)g.MoonlightNative.create=create;if(controllerCreate&&g.MoonlightControllerInput)g.MoonlightControllerInput.createNative=controllerCreate;if(nativeValue){nativeValue.create=nativeOriginal;Object.defineProperty(g,'MoonlightNative',{configurable:true,writable:true,value:nativeValue});}else if(nativeDescriptor)Object.defineProperty(g,'MoonlightNative',nativeDescriptor);else delete g.MoonlightNative;r.finished=Date.now();}
 };
 // The resident lifetime owns this bounded task after the raw activation ends.
 r.done=new Promise(function(resolve){setTimeout(function(){r.run().then(resolve,resolve);},500);});
 await log('MOONLIGHT_NATIVE_ROUNDTRIP_ARMED');
})(typeof window!=='undefined'?window:globalThis);
