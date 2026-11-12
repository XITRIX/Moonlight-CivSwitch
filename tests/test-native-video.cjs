const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load(){
 const scope={Uint8Array,DataView,ArrayBuffer,setTimeout,clearTimeout};scope.window=scope;vm.createContext(scope);
 for(const file of ['app/vendor/native-ui-runtime.js','app/src/streaming/native-buffer.js','app/vendor/moonlight-nx2-runtime.js','app/src/storage/stream-settings.js','app/src/ui/native-stream-menu.js'])vm.runInContext(fs.readFileSync(file,'utf8'),scope,{filename:file});
 return scope;
}
test('the console-only bundle loads without Node, Wasm or Workers and preserves shader/byte ABIs',()=>{
 const s=load(),m=s.MoonlightNativeModules,B=s.MoonlightNativeBuffer;
 assert.equal(s.process,undefined);assert.equal(s.require,undefined);
 const b=B.alloc(32,0xa5);b.writeBigUInt64LE(0x123456789abcdef0n,8);
 assert.equal(b.subarray(8,16).readBigUInt64LE(),0x123456789abcdef0n);
 assert.equal(b[0],0xa5);assert.equal(B.from(b.toString('hex'),'hex').equals(b),true);
 assert.throws(()=>B.from('xz','hex'));assert.throws(()=>B.alloc(0x2000001));
 assert.equal(m.renderer.manifest.contract.buffers.storage,m.layout.STORAGE_BYTES);
 for(const code of Object.values(m.renderer.shaders))assert.equal(code.readUInt32LE(),0x07230203);
 assert.equal(m.compatTable.module.hash,'cf649bbd');
});
test('real encoded AV1 fixtures parse at 1080p, 1440p and 4K with exact display dimensions',()=>{
 const m=load().MoonlightNativeModules;
 for(const [w,h,file] of [[1920,1080,'probe-experimental-av1.js'],[2560,1440,'probe-experimental-av1-1440.js'],[3840,2160,'probe-experimental-av1-2160.js']]){
  const source=fs.readFileSync('investigation/probes/'+file,'utf8'),hex=source.match(/Buffer.from\("([a-f0-9]+)","hex"\)/)[1];
  const scan=m.av1Stream.scanTemporalUnit(Buffer.from(hex,'hex'));
  assert.equal(scan.keyframe,true);assert.equal(m.av1Stream.isMain8(scan.sequence),true);
  const size=m.av1Stream.decodedSize({width:w,height:h},scan.sequence,scan.size);
  assert.deepEqual(JSON.parse(JSON.stringify(size)),{width:w,height:h});
  assert.throws(()=>m.av1Stream.decodedSize({width:640,height:360},scan.sequence,scan.size));
  assert(m.av1Decoder.transferBytes(w,h)>=64*1024*1024);
 }
});
test('native modes support AV1 and 120 FPS, require AV1 above 1080p and cap 4K at 60 FPS',()=>{
 const settings=load().MoonlightSettings,base=settings.defaults();
 for(const codec of ['h264','av1'])assert.equal(settings.validate({...base,renderer:'native',codec,fps:120}).fps,120);
 for(const [width,height] of [[2560,1440],[3840,2160]])assert.equal(settings.validate({...base,width,height,renderer:'native',codec:'av1'}).width,width);
 for(const mode of [{...base,renderer:'native',codec:'hevc'},
  {...base,width:3840,height:2160,renderer:'native',codec:'av1',fps:120},
  {...base,width:2560,height:1440,renderer:'native',codec:'h264'},{...base,codec:null}])assert.throws(()=>settings.validate(mode));
 assert.equal(base.renderer,undefined);assert.equal(base.codec,'h264');assert.equal(settings.validate({...base,renderer:'gameface'}).renderer,undefined);
});
test('native call plans reject an unverified function before executing earlier writes',()=>{
 const run=load().MoonlightNativeModules.callPlan.runCallPlan;let writes=0;
 const native={address:BigInt,integer:(v,min,max)=>{assert(v>=min&&v<=max);return v;},argument:BigInt,
  checkMemory(){},verified:new Set(),call(){throw Error('must not call');},read32(){return 0n;},read64(){return 0n;},
  write32(){writes++;},write64(){writes++;},writeMemory(){writes++;},readMemory(){return Uint8Array.of(0);},
  fromHex:hex=>Buffer.from(hex,'hex'),toHex:bytes=>Buffer.from(bytes).toString('hex')};
 assert.throws(()=>run(native,{steps:[{write:'0x1000',hex:'00'},{call:'0x2000',args:[]}]}),/not verified/);
 assert.equal(writes,0,'plans are validated before any native mutation');
});

test('native stream options resume without stopping and disconnect only on an explicit selection',()=>{
 const api=load().MoonlightNativeStreamMenu,frames=[];let resumes=0,stops=0,clears=0;
 const menu=api.create({display:{showOverlay:value=>{frames.push({...value});return true;},clearOverlay:()=>clears++},onResume:()=>resumes++,onDisconnect:()=>stops++});
 assert.equal(menu.show('Desktop'),true);assert.equal(menu.isOpen(),true);assert.equal(stops,0);
 menu.action('accept',1);menu.action('accept',3);assert.equal(menu.isOpen(),true,'release/repeat cannot activate');
 menu.action('cancel',0);assert.equal(menu.isOpen(),false);assert.equal(stops,0);assert.equal(resumes,1);assert.equal(clears,1);
 menu.show('Desktop');menu.action('accept',0);assert.equal(resumes,2);assert.equal(stops,0);
 menu.show('Desktop');menu.action('nav-down',0);assert.equal(frames.at(-1).selected,1);menu.action('accept',0);assert.equal(stops,1);assert.equal(clears,2,'disconnect retains the native notice');
 menu.show('Desktop');menu.key({key:'Escape',repeat:false},true);assert.equal(resumes,3);
 const unavailable=api.create({display:{showOverlay:()=>false}});assert.equal(unavailable.show('Not ready'),false);assert.equal(unavailable.isOpen(),false);
});

test('native menu and stopped notices are bounded NV12 with initialized neutral chroma',()=>{
 const render=load().MoonlightNativeStreamMenu.render;
 for(const kind of ['menu','stopping','stopped']){
  const frame=render({kind,title:'A'.repeat(10000)+'\u{1f319}',selected:1});
  assert.equal(frame.width,1280);assert.equal(frame.height,720);assert.equal(frame.bytes.length,1280*720*3/2);
  assert(frame.bytes.subarray(0,1280*720).some(v=>v>=230),'visible text must be drawn');
  assert(frame.bytes.subarray(1280*720).every(v=>v===128),'text cannot overwrite NV12 chroma');
 }
});
