/* Native session wiring plus the actual Emscripten import's failure boundary. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'moonlight-rumble-'));
try {
 const core=path.join(root,'third_party/moonlight-common-c');
 const executable=path.join(scratch,'rumble-tests');
 const strip=process.platform==='darwin'?'-Wl,-dead_strip':'-Wl,--gc-sections';
 execFileSync(process.env.CC||'cc',['-O1','-ffunction-sections','-fdata-sections',strip,
  '-I'+path.join(core,'src'),'-I'+path.join(core,'enet/include'),
  path.join(__dirname,'native/rumble-tests.c'),'-o',executable],{stdio:'pipe'});
 execFileSync(executable,[],{stdio:'inherit'});
} finally {fs.rmSync(scratch,{recursive:true,force:true});}
let library;
const sandbox={Module:{},LibraryManager:{library:{}},mergeInto(target,source){library=source;}};
vm.runInNewContext(fs.readFileSync(path.join(root,'app/native/platform-library.js'),'utf8'),sandbox);
assert.doesNotThrow(()=>library.ml_rumble(0,0,0));
sandbox.Module.moonlightPlatform={};assert.doesNotThrow(()=>library.ml_rumble(0,0,0));
const events=[];sandbox.Module.moonlightPlatform.rumble=(...args)=>events.push(args);
library.ml_rumble(0,65535,32768);library.ml_rumble(0,0,0);
assert.deepEqual(events,[[0,65535,32768],[0,0,0]]);
sandbox.Module.moonlightPlatform.rumble=()=>{throw Error('controller disconnected');};
assert.doesNotThrow(()=>library.ml_rumble(0,65535,65535));
console.log('Compiled session rumble listener, controller capability announcement and JS import exception boundary passed.');
