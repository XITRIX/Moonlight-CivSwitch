/* Package smoke: validate the real Moonlight bundle against its source manifest,
 * then launch its scripts in Chrome. No console or Sunshine host is used.
 * node tests/test-package.cjs dist/moonlight.civapp
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const chromeCleanup=require('./helpers/chrome-cleanup.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const pkg=JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
 const root=path.join(__dirname,'..');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'payload.json'),'utf8'));
 assert.equal(pkg.format,'civswitch-app');assert.equal(pkg.version,1);
 assert.equal(pkg.id,manifest.id);assert.equal(pkg.name,manifest.name);
 const expectedMetadata=Object.fromEntries(['author','release','description','api','extensions'].map(key=>[key,manifest[key]]));
 expectedMetadata.release=process.argv[3]||manifest.release;
 if(process.env.GITHUB_REPOSITORY)expectedMetadata.extensions={...expectedMetadata.extensions,updates:{...expectedMetadata.extensions?.updates,schema:1,releasesUrl:'https://github.com/'+process.env.GITHUB_REPOSITORY+'/releases/latest',asset:'moonlight.civapp'}};
 assert.deepEqual(pkg.metadata,expectedMetadata);
 assert.deepEqual(pkg.scripts.map(script=>script.name),manifest.scripts);
 for(const script of pkg.scripts){let expected=fs.readFileSync(path.join(root,script.name),'utf8');assert.equal(script.source,expected,script.name);}
 assert.equal(pkg.scripts.at(-1).name,'app/src/ui/moonlight-ui.js');
 assert.equal(pkg.icon,'data:image/png;base64,'+fs.readFileSync(path.join(root,manifest.icon)).toString('base64'));

 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'civapp-smoke-'));
 const chrome=spawn(process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--disable-gpu','--disable-extensions','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
 ],{stdio:['ignore','ignore','pipe']});
 const cleanup=chromeCleanup(chrome);
 let socket,spawnError,stderr='';chrome.on('error',e=>spawnError=e);chrome.stderr.on('data',s=>stderr=(stderr+s).slice(-2000));
 try{
  let port;
  for(let i=0;i<200;i++){
   if(spawnError)throw spawnError;
   try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break;}catch{}
   if(chrome.exitCode!==null)throw Error(stderr);await pause(50);
  }
  assert(port,'Chrome did not start');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  const pending=new Map();let nextId=1;
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=nextId++;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await evaluate(`window.__package=${JSON.stringify(pkg)};true`);
  const result=await evaluate(`(async()=>{
   const loaded=__package;
   const icon=loaded.icon;
   const image=new Image();image.src=icon;await image.decode();
   if(image.naturalWidth!==256||image.naturalHeight!==256)throw Error('Icon decode failed');
   window.__moonlightStreamModuleUpload={sha256:'stale',count:0,parts:[]};
   window.__done=false;
   window.__lifetime=eval(loaded.scripts.map(script=>script.source).join('\\n;\\n'));
   if(!__lifetime||typeof __lifetime.then!=='function')throw Error('No app lifetime promise');
   __lifetime.then(()=>{__done=true;});
   await new Promise(r=>setTimeout(r,100));
   return {scripts:loaded.scripts.length,factory:typeof __moonlightStreamFactory,
    staleUpload:!!window.__moonlightStreamModuleUpload,pending:!__done,
    hosts:document.getElementById('moonlight-hosts-screen')?.style.display,defaults:MoonlightSettings.defaults()};
  })()`);
  assert.equal(result.scripts,manifest.scripts.length);assert.equal(result.factory,'function');assert.equal(result.staleUpload,false);
  assert.equal(result.pending,true);assert.equal(result.hosts,'flex');
  assert.equal(result.defaults.width,1280);assert.equal(result.defaults.renderer,undefined);assert.equal(result.defaults.codec,'h264');
  // Exercise the installed package's real settings entry point: native AV1 is
  // available in ordinary Moonlight, without a Lab flag or alternate package.
  const nativeSettings=await evaluate(`(()=>{
   for(const name of ['MoonlightNativeContext','MoonlightNativeDisplay','MoonlightNativeVideo'])
    if(!window[name])throw Error('Missing bundled native dependency: '+name);
   window.__savedPackageMode=MoonlightSettings.validate({...MoonlightSettings.defaults(),width:1280,height:720,renderer:'gameface',codec:'h264'});
   MoonlightNative.available=true;
   MoonlightNative.create=()=>({listHosts:()=>[],loadStreamSettings:()=>__savedPackageMode,saveStreamSettings:mode=>{__savedPackageMode=JSON.parse(JSON.stringify(mode));}});
   document.getElementById('moonlight-open-settings').click();
   document.getElementById('moonlight-settings-resolution').click();
   document.getElementById('moonlight-settings-codec').click();
   const notice=document.getElementById('moonlight-settings-status').textContent;
   document.getElementById('moonlight-settings-back').click();
   document.getElementById('moonlight-open-settings').click();
   return {saved:__savedPackageMode,notice,
    codec:document.getElementById('moonlight-settings-codec').getAttribute('data-value'),
    renderer:!!document.getElementById('moonlight-settings-renderer'),
    highModes:MoonlightSettings.frameRates.includes(120)&&MoonlightSettings.resolutions.some(r=>r.width===3840)};
  })()`);
  assert.equal(nativeSettings.saved.width,1920);assert.equal(nativeSettings.saved.height,1080);assert.equal(nativeSettings.saved.fps,60);
  assert.equal(nativeSettings.saved.codec,'av1');assert.equal(nativeSettings.saved.renderer,undefined);
  assert.equal(nativeSettings.codec,'av1');assert.equal(nativeSettings.renderer,false);assert.equal(nativeSettings.highModes,true);
  assert.match(nativeSettings.notice,/Disconnect returns to Moonlight/i);
  const autoSettings=await evaluate(`(()=>{
   document.getElementById('moonlight-settings-bitrate').click();
   document.getElementById('moonlight-bitrate-option-auto').click();
   document.getElementById('moonlight-settings-back').click();
   document.getElementById('moonlight-open-settings').click();
   return {saved:__savedPackageMode.bitrate,value:document.getElementById('moonlight-settings-bitrate').getAttribute('data-value'),label:document.getElementById('moonlight-settings-bitrate-value').textContent};
  })()`);
  assert.equal(autoSettings.saved,'auto');assert.equal(autoSettings.value,'auto');assert.match(autoSettings.label,/Auto \(.*Mbps\)/);

  assert.equal(await evaluate('(async()=>{window.__moonlightSimpleUI.close();await __lifetime;return __done;})()'),true);
  // Start the real packaged UI under a Gameface resident with no native owner.
  const blocked=await evaluate(`(async()=>{
   window.call_rop=()=>{throw Error('The blocker must not call native graphics');};
   window.__civhomebrewCore={};MoonlightNative.available=true;
   window.__blockedDone=false;
   window.__blockedLifetime=eval(__package.scripts.at(-1).source);
   __blockedLifetime.then(()=>__blockedDone=true);
   await new Promise(r=>setTimeout(r,50));
   return {title:document.querySelector('#civ-sdk-update-launcher h1')?.textContent,
    hosts:!!document.getElementById('moonlight-hosts-screen'),pending:!__blockedDone,
    nativeSession:!!CivAppsNativeUI.sessions.current};
  })()`);
  assert.deepEqual(blocked,{title:'Update Launcher',hosts:false,pending:true,nativeSession:false});
  assert.equal(await evaluate(`(async()=>{
   window.dispatchEvent(new CustomEvent('navigate-input',{detail:{name:'cancel',status:0}}));
   await __blockedLifetime;
   return __blockedDone&&!document.getElementById('moonlight-simple-ui')&&!window.__civswitchApp;
  })()`),true);
 }finally{
  await cleanup(socket,profile);
 }
 console.log('Moonlight package smoke passed: bundled scripts matching sources, decoded 256×256 icon, runtime factory, visible Hosts UI, native AV1 selection/save/reopen, high modes, pending lifetime, Gameface Update Launcher blocker and clean close.');
})().catch(error=>{console.error(error);process.exitCode=1;});
