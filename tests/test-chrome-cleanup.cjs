const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const chromeCleanup=require('./helpers/chrome-cleanup.cjs');

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
