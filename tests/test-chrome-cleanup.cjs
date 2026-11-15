const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const chromeCleanup=require('./helpers/chrome-cleanup.cjs');
const {chromeArgs,waitForChromePort}=require('./helpers/chrome-startup.cjs');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');

function startupFixture(t){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'chrome-startup-test-'));
 t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));
 const chrome=Object.assign(new EventEmitter(),{exitCode:null,signalCode:null,stderr:new PassThrough()});
 return {chrome,profile};
}

test('Chrome startup detects signal termination and retains the browser diagnostic',async t=>{
 const {chrome,profile}=startupFixture(t);
 const ready=waitForChromePort(chrome,profile,{timeoutMs:1000,pollMs:1});
 chrome.stderr.write('No usable sandbox!');chrome.signalCode='SIGTRAP';
 await assert.rejects(ready,/terminated by SIGTRAP\nNo usable sandbox!/);
 assert.equal(chrome.listenerCount('error'),0);assert.equal(chrome.stderr.listenerCount('data'),0);
});

test('Chrome startup reports executable failures, exit codes and timeout stderr',async t=>{
 for(const reason of ['spawn','exit','timeout']){
  const {chrome,profile}=startupFixture(t);
  const ready=waitForChromePort(chrome,profile,{timeoutMs:20,pollMs:1});
  chrome.stderr.write('browser startup diagnostic');
  if(reason==='spawn')chrome.emit('error',Error('spawn chrome ENOENT'));
  if(reason==='exit')chrome.exitCode=17;
  const message=reason==='spawn'?'spawn chrome ENOENT':reason==='exit'?'exited with code 17':'timed out after 20 ms';
  await assert.rejects(ready,error=>error.message.includes(message)&&error.message.includes('browser startup diagnostic'));
 }
});

test('Chrome startup waits through missing, empty and partial port files',async t=>{
 const {chrome,profile}=startupFixture(t);
 const ready=waitForChromePort(chrome,profile,{timeoutMs:1000,pollMs:1});
 const file=path.join(profile,'DevToolsActivePort');
 for(const content of ['', '431', 'not-a-port\n', '0\n', '65536\n']){
  fs.writeFileSync(file,content);
  assert.equal(await Promise.race([ready.then(()=>true),new Promise(r=>setTimeout(()=>r(false),5))]),false);
 }
 fs.writeFileSync(file,'43123\n/devtools/browser/test\n');
 assert.equal(await ready,43123);
});

test('CI sandbox opt-in is scoped to Linux and isolated profiles remain required',()=>{
 const flags=(platform,env)=>chromeArgs('/tmp/test-profile',{platform,env});
 assert(!flags('linux',{}).includes('--no-sandbox'));
 assert(!flags('darwin',{CHROME_NO_SANDBOX:'1'}).includes('--no-sandbox'));
 const ci=flags('linux',{CHROME_NO_SANDBOX:'1'});
 assert(ci.includes('--no-sandbox'));assert(ci.includes('--disable-dev-shm-usage'));
 assert(ci.includes('--user-data-dir=/tmp/test-profile'));
});

test('browser cleanup waits for a child profile writer after the main process exits',async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'chrome-cleanup-test-'));
 const source=`
  const {spawn}=require('node:child_process');
  process.on('SIGTERM',()=>{
   spawn(process.execPath,['-e','setTimeout(()=>{require("node:fs").writeFileSync(process.argv[1],"late write");},150);',process.argv[1]],{stdio:['ignore','ignore','inherit']});
   process.exit(0);
  });
  setInterval(()=>{},1000);process.stdout.write('ready');
 `;
 const child=spawn(process.execPath,['-e',source,path.join(profile,'late-profile-file')],{stdio:['ignore','pipe','pipe']});
 const cleanup=chromeCleanup(child);let exited=false,closed=false,requested=false,socketClosed=false;
 child.on('exit',()=>{exited=true;});child.on('close',()=>{closed=true;});
 try{
  await once(child.stdout,'data');
  await cleanup({readyState:1,send(message){assert.equal(JSON.parse(message).method,'Browser.close');requested=true;child.kill('SIGTERM');},close(){socketClosed=true;}},profile);
  assert(requested);assert(exited);assert(closed);assert(socketClosed);assert.equal(fs.existsSync(profile),false);
 }finally{if(!closed)child.kill('SIGKILL');fs.rmSync(profile,{recursive:true,force:true});}
});

test('signal-terminated browser cleanup is safe to call again after close',async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'chrome-cleanup-test-'));
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000);process.stdout.write("ready");'],{stdio:['ignore','pipe','pipe']});
 const cleanup=chromeCleanup(child);
 await once(child.stdout,'data');child.kill('SIGTERM');await once(child,'close');
 assert.equal(child.exitCode,null);assert.equal(child.signalCode,'SIGTERM');
 await cleanup(null,profile);await cleanup(null,profile);assert.equal(fs.existsSync(profile),false);
});
