/* Browser UI checks with a fake paired host. Requires Chrome and Node 22+. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'moonlight-ui-test-'));
 const chrome=spawn(process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--disable-gpu','--disable-extensions','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
 ],{stdio:['ignore','ignore','pipe']});
 let socket,spawnError,stderr='';chrome.on('error',e=>spawnError=e);chrome.stderr.on('data',s=>stderr=(stderr+s).slice(-2000));
 try{
  let port;
  for(let i=0;i<200;i++){
   if(spawnError)throw spawnError;
   try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break;}catch{}
   if(chrome.exitCode!==null)throw Error(stderr);await sleep(50);
  }
  assert(port,'Chrome did not expose its test port');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  const pending=new Map();let nextId=1;
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=nextId++;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(30);}throw Error('UI condition timed out: '+expression);};
  const key=async (name,shiftKey=false)=>{await evaluate('window.dispatchEvent(new KeyboardEvent("keydown",{key:'+JSON.stringify(name)+',shiftKey:'+shiftKey+',bubbles:true}))');await sleep(110);};
  const selected=()=>evaluate('document.querySelector("#moonlight-game-list [data-selected=true]")?.getAttribute("data-app-id")');
  const gameAction=async (name,x=0,y=0)=>{await evaluate('window.dispatchEvent(new CustomEvent("engine-input",{detail:{name:'+JSON.stringify(name)+',status:0,x:'+x+',y:'+y+'}}))');await sleep(110);};
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:pathToFileURL(path.join(__dirname,'../app/index.html')).href});
  await until('!!document.getElementById("moonlight-connect")');
  await evaluate(`
   window.__mode='success';window.__artMode='success';window.__calls=0;window.__artCalls=[];window.__apps=['Desktop','Steam Big Picture','Virtual Display','A very long game title '.repeat(8),'Fifth game','Sixth game','Seventh game','Eighth game','Ninth game','<img src=x onerror=window.__injected=true>'];
   window.__cover=id=>{const canvas=document.createElement('canvas');canvas.width=240;canvas.height=320;const ctx=canvas.getContext('2d');ctx.fillStyle=['#284c83','#28545b','#534878'][id%3];ctx.fillRect(0,0,240,320);ctx.fillStyle='#f4f7ff';ctx.textAlign='center';ctx.font='bold 22px Arial';ctx.fillText('TEST COVER',120,144);ctx.font='16px Arial';ctx.fillText('Application '+id,120,178);return atob(canvas.toDataURL('image/png').split(',')[1]);};
   window.__idOffset=0;window.__xml=()=>'<root status_code="200">'+window.__apps.map((title,i)=>'<App><AppTitle>'+title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</AppTitle><ID>'+(i+1+window.__idOffset)+'</ID></App>').join('')+'</root>';
   window.MoonlightNative.available=true;
   window.MoonlightNative.create=()=>({loadStreamSettings:()=>window.__savedMode||window.MoonlightSettings.defaults(),saveStreamSettings:mode=>{if(window.__failSettingsSave)throw Error("disk full");window.__savedMode=JSON.parse(JSON.stringify(mode));},loadIdentity:()=>({uniqueId:'0123456789abcdef'}),loadHost:()=>({uniqueId:'0123456789abcdef',hostname:'Gaming PC',httpsPort:47984,certificatePem:'pinned'}),randomBytes:n=>new Uint8Array(n),requestHttps:async request=>{window.__calls++;if(request.path.startsWith('/appasset?')){const id=Number(new URL('https://host'+request.path).searchParams.get('appid'));window.__artCalls.push(id);window.__artSignal=request.signal;if(window.__artMode==='pending')return new Promise(r=>window.__artFinish=()=>r(window.__cover(id)));if(window.__artMode==='error')throw Error('Artwork missing');if(window.__artMode==='corrupt')return window.__cover(id).slice(0,33);return window.__cover(id);}window.__signal=request.signal;if(window.__mode==='error')throw Error('Host offline');if(window.__mode==='pending')return new Promise(r=>window.__finish=r);return window.__mode==='empty'?'<root status_code="200"/>':window.__xml();}});
   window.MoonlightPairing.create=()=>({checkAndPair:async()=>({hostname:'Gaming PC',httpsPort:47984,reused:true})});
  `);
  // Host settings: controller directions change values, B saves, errors stay visible.
  await key('ArrowDown');await key('ArrowDown');await key('Enter');
  await until('document.getElementById("moonlight-settings-screen").style.display==="flex"');
  await key('ArrowLeft');
  assert.equal(await evaluate('document.getElementById("moonlight-settings-resolution").getAttribute("data-value")'),'960x540');
  await gameAction('nav-down');await gameAction('nav-right');
  assert.equal(await evaluate('document.getElementById("moonlight-settings-fps").getAttribute("data-value")'),'60');
  await key('ArrowDown');await key('ArrowRight');
  await key('ArrowDown');await key('ArrowRight');
  assert.equal(await evaluate('document.getElementById("moonlight-settings-showStats").getAttribute("data-value")'),'true');
  assert.equal(await evaluate('document.getElementById("moonlight-settings-screen").getBoundingClientRect().bottom<=720'),true);
  await evaluate('window.__failSettingsSave=true');await key('Escape');
  assert.equal(await evaluate('document.getElementById("moonlight-settings-screen").style.display'),'flex');
  assert.match(await evaluate('document.getElementById("moonlight-settings-status").textContent'),/disk full/);
  await evaluate('window.__failSettingsSave=false');await key('Escape');await sleep(250);
  assert.deepEqual(await evaluate('window.__savedMode'),{width:960,height:540,fps:60,bitrate:8000,showStats:true});
  await key('ArrowUp');await key('Enter');
  await until('document.querySelectorAll("#moonlight-game-list button").length===4');
  await until('Array.from(document.querySelectorAll("#moonlight-game-list img")).filter(n=>n.style.display==="block"&&n.naturalWidth===240).length===4');
  assert.deepEqual(await evaluate('window.__artCalls'),[1,2,3,4]);
  await evaluate('window.__firstCover=document.querySelector("#moonlight-game-list img");true');
  assert.equal(await selected(),'1');
  const bounds=await evaluate('(()=>{const p=document.getElementById("moonlight-games-screen").getBoundingClientRect();return {top:p.top,bottom:p.bottom};})()');
  assert(bounds.top>=0&&bounds.bottom<=720,JSON.stringify(bounds));
  const cards=await evaluate('Array.from(document.querySelectorAll("#moonlight-game-list button"),n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})');
  assert(cards[0].height>cards[0].width);assert.equal(cards[0].y,cards[1].y);assert(cards[1].x>cards[0].x);
  await key('ArrowRight');assert.equal(await selected(),'2');await key('ArrowLeft');assert.equal(await selected(),'1');
  await gameAction('nav-right');assert.equal(await selected(),'2');
  await gameAction('nav-move',1,0);assert.equal(await selected(),'3');
  await gameAction('nav-move',0,-1);assert.equal(await selected(),'7');
  await key('ArrowUp');assert.equal(await selected(),'3');await key('ArrowRight');assert.equal(await selected(),'4');
  await key('ArrowRight');assert.equal(await selected(),'4');
  await key('ArrowDown');assert.equal(await selected(),'8');await key('ArrowDown');assert.equal(await selected(),'10');
  assert.equal(await evaluate('!!window.__injected'),false);
  assert.equal(await evaluate('Array.from(document.querySelectorAll("#moonlight-game-list img")).every(n=>n.src.startsWith("data:image/png;base64,")&&n.alt==="")'),true);
  await key('ArrowUp');assert.equal(await selected(),'8');await key('ArrowDown');assert.equal(await selected(),'10');
  await key('ArrowDown');assert.equal(await evaluate('document.getElementById("moonlight-games-back").getAttribute("data-selected")'),'true');
  await key('ArrowLeft');assert.equal(await evaluate('document.getElementById("moonlight-games-settings").getAttribute("data-selected")'),'true');
  await key('ArrowLeft');assert.equal(await evaluate('document.getElementById("moonlight-games-refresh").getAttribute("data-selected")'),'true');
  await key('ArrowRight');assert.equal(await evaluate('document.getElementById("moonlight-games-settings").getAttribute("data-selected")'),'true');
  await key('ArrowRight');assert.equal(await evaluate('document.getElementById("moonlight-games-back").getAttribute("data-selected")'),'true');
  await key('ArrowUp');assert.equal(await selected(),'10');
  await key('ArrowLeft');assert.equal(await selected(),'9');await key('ArrowRight');assert.equal(await selected(),'10');
  await key('ArrowDown');assert.equal(await evaluate('document.getElementById("moonlight-games-refresh").getAttribute("data-selected")'),'true');
  await key('ArrowUp');assert.equal(await selected(),'10');
  await key('Tab');await key('Tab');await key('Tab');assert.equal(await evaluate('document.getElementById("moonlight-games-back").getAttribute("data-selected")'),'true');
  await key('Tab',true);await key('Tab',true);await key('Tab',true);assert.equal(await selected(),'10');
  // The three host entries match the reference arrangement: portrait cards,
  // left to right, with the existing dark styling and title bands.
  await evaluate('window.__allApps=window.__apps;window.__apps=window.__apps.slice(0,3);document.getElementById("moonlight-games-refresh").click()');
  await until('document.querySelectorAll("#moonlight-game-list button").length===3');
  await until('Array.from(document.querySelectorAll("#moonlight-game-list img")).filter(n=>n.style.display==="block").length===3');
  assert.equal(await evaluate('document.querySelector("#moonlight-game-list img")===window.__firstCover'),true);
  const cachedCalls=await evaluate('window.__artCalls.length');
  await key('Escape');await sleep(150);await key('Enter');
  await until('document.querySelectorAll("#moonlight-game-list button").length===3');
  assert.equal(await evaluate('window.__artCalls.length'),cachedCalls);
  assert.equal(await evaluate('document.querySelector("#moonlight-game-list img")===window.__firstCover'),true);
  // Settings from Games returns to the same grid, with covers reused.
  await evaluate('document.getElementById("moonlight-games-settings").click()');
  await until('document.getElementById("moonlight-settings-screen").style.display==="flex"');
  assert.equal(await evaluate('document.getElementById("moonlight-settings-bitrate").getAttribute("data-value")'),'8000');
  const settingsPng=await call('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(__dirname,'../investigation/evidence/settings-screen-preview.png'),Buffer.from(settingsPng.data,'base64'));
  await key('Tab',true);assert.equal(await evaluate('document.getElementById("moonlight-settings-back").getAttribute("data-selected")'),'true');
  await key('Enter');await sleep(250);await key('ArrowUp');
  assert.equal(await selected(),'1');
  assert.equal(await evaluate('window.__artCalls.length'),cachedCalls);
  const png=await call('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(__dirname,'../investigation/evidence/games-screen-preview.png'),Buffer.from(png.data,'base64'));
  // Browser gamepads use the same left/right input routes.
  await evaluate('Object.defineProperty(navigator,"getGamepads",{configurable:true,value:()=>window.__pad?[window.__pad]:[]});window.__pad={buttons:Array.from({length:16},()=>({pressed:false}))};window.__pad.buttons[15].pressed=true');
  await sleep(120);assert.equal(await selected(),'2');
  await evaluate('window.__pad.buttons[15].pressed=false');await sleep(50);
  await evaluate('window.__pad.buttons[14].pressed=true');await sleep(120);assert.equal(await selected(),'1');
  await evaluate('window.__pad.buttons[14].pressed=false');await sleep(50);await evaluate('window.__pad=null');
  // A taller viewport gets two rows; short final rows retain the preferred column.
  await call('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  await evaluate('window.__apps=window.__allApps;document.getElementById("moonlight-games-refresh").click()');
  await until('document.querySelectorAll("#moonlight-game-list button").length===8');
  const rows=await evaluate('Array.from(document.querySelectorAll("#moonlight-game-list button"),n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y};})');
  assert.equal(rows[0].x,rows[4].x);assert(rows[4].y>rows[0].y);
  await key('ArrowDown');assert.equal(await selected(),'5');
  await key('ArrowRight');await key('ArrowRight');await key('ArrowRight');assert.equal(await selected(),'8');
  await key('ArrowDown');assert.equal(await selected(),'10');await key('ArrowUp');assert.equal(await selected(),'8');
  assert.equal(await evaluate('document.getElementById("moonlight-games-screen").getBoundingClientRect().bottom<=1080'),true);
  // Download errors and decoder errors retain navigable initial placeholders.
  await evaluate('window.__idOffset=20;window.__artMode="error";document.getElementById("moonlight-games-refresh").click()');
  await until('document.querySelectorAll("#moonlight-game-list button").length===8&&document.getElementById("moonlight-games-refresh").getAttribute("aria-disabled")==="false"');
  await sleep(100);assert.equal(await evaluate('document.querySelectorAll("#moonlight-game-list img").length'),0);
  await key('ArrowRight');assert.equal(await selected(),'22');
  await evaluate('window.__idOffset=40;window.__artMode="corrupt";document.getElementById("moonlight-games-refresh").click()');
  await sleep(200);assert.equal(await evaluate('document.querySelectorAll("#moonlight-game-list img").length'),0);
  await evaluate('window.__idOffset=60;window.__artMode="pending";document.getElementById("moonlight-games-refresh").click()');
  await until('!!window.__artFinish');await key('Escape');
  assert.equal(await evaluate('window.__artSignal.aborted'),true);
  await evaluate('window.__artFinish();delete window.__artFinish;window.__artMode="success";window.__idOffset=0');await sleep(100);
  assert.equal(await evaluate('document.querySelectorAll("#moonlight-game-list img").length'),0);
  await sleep(150);await key('Enter');await until('document.querySelectorAll("#moonlight-game-list button").length===8');
  await evaluate('window.__mode="empty";document.getElementById("moonlight-games-refresh").click()');
  await until('document.getElementById("moonlight-games-status").textContent.includes("No games or applications")');
  await key('ArrowRight');assert.equal(await evaluate('document.getElementById("moonlight-games-settings").getAttribute("data-selected")'),'true');
  await key('ArrowRight');assert.equal(await evaluate('document.getElementById("moonlight-games-back").getAttribute("data-selected")'),'true');
  await key('ArrowLeft');assert.equal(await evaluate('document.getElementById("moonlight-games-settings").getAttribute("data-selected")'),'true');
  await key('ArrowLeft');assert.equal(await evaluate('document.getElementById("moonlight-games-refresh").getAttribute("data-selected")'),'true');
  await evaluate('window.__mode="error";document.getElementById("moonlight-games-refresh").click()');
  await until('document.getElementById("moonlight-games-status").textContent==="Host offline"');
  await evaluate('window.__mode="pending";document.getElementById("moonlight-games-refresh").click()');
  await until('!!window.__finish');await key('Escape');
  assert.equal(await evaluate('document.getElementById("moonlight-games-screen").style.display'),'none');
  assert.equal(await evaluate('window.__signal.aborted'),true);
  await evaluate('window.__finish(window.__xml())');await sleep(100);
  assert.equal(await evaluate('document.getElementById("moonlight-games-screen").style.display'),'none');
  assert.equal(await evaluate('!!window.__moonlightSimpleUI'),true);
  await evaluate('window.__mode="success"');await key('Enter');
  await until('document.getElementById("moonlight-games-screen").style.display==="flex"&&document.querySelectorAll("#moonlight-game-list button").length===8');
  // A card launches a stream; Escape stops it, then restores the cached grid.
  await evaluate(`window.__streamEvents=[];window.MoonlightStreamClient.create=options=>{window.__streamOptions=options;let finish;const done=new Promise(r=>finish=r);return {start:()=>{window.__streamEvents.push(['start',options.app.id]);options.onStatus('Test stream connected');return done;},stop:()=>{window.__streamEvents.push(['stop']);finish({error:null});return done;},gamepad:(...args)=>window.__streamEvents.push(['pad',...args]),key:(...args)=>window.__streamEvents.push(['key',...args])};}`);
  await key('Enter');await until('document.getElementById("moonlight-stream-screen").style.display==="flex"');
  assert.deepEqual(await evaluate('window.__streamOptions.mode'),{width:960,height:540,fps:60,bitrate:8000,showStats:true});
  await evaluate('window.__streamOptions.onImage("live:/moonlight-experiment/1");window.__streamOptions.onImage("live:/moonlight-experiment/1");true');
  assert.equal(await evaluate('document.getElementById("moonlight-stream-native-image").style.display'),'block');
  await evaluate('window.__streamOptions.onStats({mode:window.__streamOptions.mode,telemetry:{textureFps:59.8,decodedFps:60,rttMs:3,decodeReadyMs:4,audioBufferedMsUpperBound:40}});true');
  assert.equal(await evaluate('document.getElementById("moonlight-performance-overlay").style.display'),'block');
  assert.match(await evaluate('document.getElementById("moonlight-performance-overlay").textContent'),/Texture 59.8 FPS/);
  await evaluate('window.__logBefore=window.log;window.log=()=>{throw Error("stream attempted TCP logging");};for(let i=0;i<100;i++)window.__streamOptions.log("diagnostic "+i);window.__streamOptions.onStats({mode:window.__streamOptions.mode,telemetry:{textureFps:59.8}});true');
  assert.equal(await evaluate('window.__moonlightStreamDiagnostics.messages.length'),64);
  assert.equal(await evaluate('window.__moonlightStreamDiagnostics.stats.telemetry.textureFps'),59.8);
  await evaluate('window.log=window.__logBefore;true');
  assert.equal(await evaluate('getComputedStyle(document.getElementById("moonlight-performance-overlay")).pointerEvents'),'none');
  const overlayPng=await call('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(__dirname,'../investigation/evidence/performance-overlay-preview.png'),Buffer.from(overlayPng.data,'base64'));
  assert.equal(await evaluate('window.__streamOptions.canPresent()'),true);
  assert.equal(await evaluate('document.querySelector("#moonlight-stream-screen img").hasAttribute("src")'),false);
  assert.equal(await evaluate('(()=>{const n=document.getElementById("moonlight-stream-native-image"),r=n.getBoundingClientRect();return r.x===0&&r.y===0&&r.width===innerWidth&&r.height===innerHeight&&getComputedStyle(n).backgroundSize==="contain";})()'),true);
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#moonlight-stream-screen [role=status]")).display'),'none');
  await key('ArrowUp');assert.equal(await evaluate('window.__streamEvents.some(e=>e[0]==="key"&&e[1]===38&&e[2]===true)'),true);
  await key('Escape');await until('document.getElementById("moonlight-games-screen").style.display==="flex"');
  assert.equal(await evaluate('document.getElementById("moonlight-stream-native-image").style.backgroundImage'),'none');
  assert.equal(await evaluate('window.__streamEvents.filter(e=>e[0]==="stop").length'),1);
  await sleep(300);await evaluate('document.getElementById("moonlight-games-settings").click()');
  await key('ArrowDown');await key('ArrowDown');await key('ArrowDown');await key('ArrowLeft');await key('Escape');await sleep(250);await key('ArrowUp');
  assert.equal(await evaluate('window.__savedMode.showStats'),false);
  await key('Enter');await until('document.getElementById("moonlight-stream-screen").style.display==="flex"');
  await evaluate('window.__streamOptions.onStats({mode:window.__streamOptions.mode,telemetry:{textureFps:60}});true');
  assert.equal(await evaluate('document.getElementById("moonlight-performance-overlay").style.display'),'none');
  await gameAction('cancel');await sleep(1300);
  assert.equal(await evaluate('document.getElementById("moonlight-stream-screen").style.display'),'flex','B must remain a game button');
  assert.equal(await evaluate('window.__streamEvents.some(e=>e[0]==="pad"&&(e[1]&0x1000))'),true);
  await evaluate('window.__pad={mapping:"standard",connected:true,buttons:Array.from({length:17},()=>({pressed:false,value:0})),axes:[1,-1,-1,1]};window.__pad.buttons[4].pressed=true;window.__pad.buttons[6].value=1;true');
  await until('window.__streamEvents.some(e=>e[0]==="pad"&&e[1]===0x100&&e[2]===255&&e[4]===32767&&e[5]===32767&&e[6]===-32767&&e[7]===-32767)');
  await evaluate('window.dispatchEvent(new Event("blur"));true');
  assert.deepEqual(await evaluate('window.__streamEvents.filter(e=>e[0]==="pad").at(-1)'),['pad',0,0,0,0,0,0,0]);
  await evaluate('window.dispatchEvent(new Event("focus"));window.__pad.connected=false;true');
  await sleep(100);
  assert.deepEqual(await evaluate('window.__streamEvents.filter(e=>e[0]==="pad").at(-1)'),['pad',0,0,0,0,0,0,0]);
  await evaluate('window.__pad.connected=true;window.__pad.axes=[0,0,0,0];window.__pad.buttons.forEach(b=>{b.pressed=false;b.value=0;});window.__pad.buttons[8].pressed=true;true');
  await until('window.__streamEvents.some(e=>e[0]==="pad"&&e[1]===0x20)');
  assert.equal(await evaluate('document.getElementById("moonlight-stream-screen").style.display'),'flex','minus alone must not exit');
  // Suppress animation callbacks and suspend remote input: the timer must still
  // recognize the local exit chord, without forwarding it to the host.
  await evaluate('window.__realRAF=window.requestAnimationFrame;window.requestAnimationFrame=()=>-1;window.dispatchEvent(new Event("blur"));true');
  await sleep(100);
  await evaluate('window.__pad.buttons[9].pressed=true;true');
  await until('document.getElementById("moonlight-games-screen").style.display==="flex"');
  await evaluate('window.requestAnimationFrame=window.__realRAF;window.dispatchEvent(new Event("focus"));true');
  assert.equal(await evaluate('window.__streamEvents.some(e=>e[0]==="pad"&&(e[1]&0x30)===0x30)'),false,'exit chord stays local');
  await evaluate('window.__pad=null');
  await key('Escape');await key('F8');assert.equal(await evaluate('!!document.getElementById("moonlight-simple-ui")'),false);
  console.log('UI tests passed: saved stream settings, save errors, settings-to-stream mode forwarding, overlay on/off and cleanup, PNG covers and lazy pages, download/decode fallback and cancellation, 720p/1080p grid, four-way input, paging, horizontal footer, safe titles, list errors/retry, reconnect, close.');
 }finally{
  if(socket)socket.close();
  chrome.kill('SIGTERM');for(let i=0;i<100&&chrome.exitCode===null;i++)await sleep(30);
  if(chrome.exitCode===null){chrome.kill('SIGKILL');await sleep(100);}
  fs.rmSync(profile,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
