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
  const key=async name=>{await evaluate('window.dispatchEvent(new KeyboardEvent("keydown",{key:'+JSON.stringify(name)+',bubbles:true}))');await sleep(110);};
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:pathToFileURL(path.join(__dirname,'../app/index.html')).href});
  await until('!!document.getElementById("moonlight-connect")');
  await evaluate(`
   window.__mode='success';window.__calls=0;window.__apps=['Desktop','Steam Big Picture','Virtual Display','A very long game title '.repeat(8),'Fifth game','Sixth game','Seventh game','<img src=x onerror=window.__injected=true>'];
   window.__xml=()=>'<root status_code="200">'+window.__apps.map((title,i)=>'<App><AppTitle>'+title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</AppTitle><ID>'+(i+1)+'</ID></App>').join('')+'</root>';
   window.MoonlightNative.available=true;
   window.MoonlightNative.create=()=>({loadIdentity:()=>({uniqueId:'0123456789abcdef'}),loadHost:()=>({uniqueId:'0123456789abcdef',hostname:'Gaming PC',httpsPort:47984,certificatePem:'pinned'}),randomBytes:n=>new Uint8Array(n),requestHttps:async request=>{window.__calls++;window.__signal=request.signal;if(window.__mode==='error')throw Error('Host offline');if(window.__mode==='pending')return new Promise(r=>window.__finish=r);return window.__mode==='empty'?'<root status_code="200"/>':window.__xml();}});
   window.MoonlightPairing.create=()=>({checkAndPair:async()=>({hostname:'Gaming PC',httpsPort:47984,reused:true})});
  `);
  await key('ArrowDown');await key('Enter');
  await until('document.querySelectorAll("#moonlight-game-list button").length===6');
  assert.equal(await evaluate('document.querySelector("#moonlight-game-list [data-selected=true]").textContent'),'Desktop');
  const bounds=await evaluate('(()=>{const p=document.getElementById("moonlight-games-screen").getBoundingClientRect();return {top:p.top,bottom:p.bottom};})()');
  assert(bounds.top>=0&&bounds.bottom<=720,JSON.stringify(bounds));
  const png=await call('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(__dirname,'../investigation/evidence/games-screen-preview.png'),Buffer.from(png.data,'base64'));
  for(let i=0;i<6;i++)await key('ArrowDown');
  assert.equal(await evaluate('document.querySelector("#moonlight-game-list [data-selected=true]").textContent'),'Seventh game');
  await key('ArrowDown');assert.equal(await evaluate('!!document.querySelector("#moonlight-game-list img")||!!window.__injected'),false);
  await key('ArrowDown');assert.equal(await evaluate('document.getElementById("moonlight-games-refresh").getAttribute("data-selected")'),'true');
  await evaluate('window.__mode="empty";document.getElementById("moonlight-games-refresh").click()');
  await until('document.getElementById("moonlight-games-status").textContent.includes("No games or applications")');
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
  await until('document.getElementById("moonlight-games-screen").style.display==="flex"&&document.querySelectorAll("#moonlight-game-list button").length===6');
  await key('Escape');await key('F8');assert.equal(await evaluate('!!document.getElementById("moonlight-simple-ui")'),false);
  console.log('UI tests passed: connect-to-library, 720p layout, paged D-pad navigation, safe titles, empty/error/retry, B cancellation, late responses, reconnect, close.');
 }finally{
  if(socket)socket.close();
  chrome.kill('SIGTERM');for(let i=0;i<100&&chrome.exitCode===null;i++)await sleep(30);
  if(chrome.exitCode===null){chrome.kill('SIGKILL');await sleep(100);}
  fs.rmSync(profile,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
