/* Package smoke: validate the real Moonlight bundle against its source manifest,
 * then launch its scripts in Chrome. No console or Sunshine host is used.
 * node tests/test-package.cjs dist/moonlight.civapp
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
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
 for(const script of pkg.scripts)assert.equal(script.source,fs.readFileSync(path.join(root,script.name),'utf8'),script.name);
 assert.equal(pkg.scripts.at(-1).name,'app/src/ui/moonlight-ui.js');
 assert.equal(pkg.icon,'data:image/png;base64,'+fs.readFileSync(path.join(root,manifest.icon)).toString('base64'));

 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'civapp-smoke-'));
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
    hosts:document.getElementById('moonlight-hosts-screen')?.style.display};
  })()`);
  assert.equal(result.scripts,manifest.scripts.length);assert.equal(result.factory,'function');assert.equal(result.staleUpload,false);
  assert.equal(result.pending,true);assert.equal(result.hosts,'flex');
  assert.equal(await evaluate('(async()=>{window.__moonlightSimpleUI.close();await __lifetime;return __done;})()'),true);
  console.log('Moonlight package smoke passed: bundled scripts matching sources, decoded 256×256 icon, runtime factory, visible Hosts UI, pending lifetime and clean close.');
 }finally{
  if(socket)socket.close();chrome.kill('SIGTERM');
  await Promise.race([new Promise(r=>chrome.once('exit',r)),pause(3000)]);
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
