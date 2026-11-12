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

async function streamingMedia(codec='av1',smoothVideo=true){
 let time=0,next=0x100000,ready=true,allowed=true,borrow=true,baseOptions;
 const events=[],targets=[],published=[],released=[],heap=new Uint8Array(1024);
 const context={rawCall:(pointer,args)=>events.push(['guarded-call',pointer,...args]),native:{},rpc:{},allocate:bytes=>{const p=next;next+=bytes;return p;},release:p=>released.push(p)};
 const backend={frameBytes:1920*1080*3/2,submit:unit=>events.push(['decode',Number(unit.pts)]),wait:()=>ready,output:target=>{targets.push(target);events.push(['output',target]);}};
 const display={context,size:{width:1920,height:1080},present:Object.assign(()=>{}, {timings:{acquire:1,submit:2,present:3,wait:4}})};
 const scope={Uint8Array,setTimeout,clearTimeout,MoonlightNativeBuffer:Uint8Array,
  MoonlightTelemetry:{now:()=>time},MoonlightNativeContext:{checkedCalls:context=>context.native},MoonlightNativeModules:{
   av1Stream:{scanTemporalUnit:()=>({sequence:{},keyframe:true}),isMain8:()=>true,decodedSize:size=>size},
   av1Decoder:{createAv1Decoder:async()=>({nativeContext:{av1:{},memory:1},close:async()=>events.push(['decoder-close'])})},
   av1Backend:{createAv1Backend:()=>backend}},
  MoonlightNativeDisplay:{prepare:async()=>display,videoBuffer:()=>borrow?0x40000000n:null,publish:(...args)=>published.push(args),finish:()=>events.push(['finish']),retire:async()=>events.push(['retire'])},
  MoonlightStreamMedia:{create:(io,core,options)=>{baseOptions=options;return {videoSetup:()=>0,videoFrame:()=>0,drainVideo:()=>false,finishVideo:()=>false,drainAudio(){},stats:()=>({}),close:()=>events.push(['base-close'])};}}};
 scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync('app/src/streaming/native-video.js','utf8'),scope);
 const media=await scope.MoonlightNativeVideo.createMedia({toNative(){}},{},{mode:{width:1920,height:1080,fps:60,codec},smoothVideo,canPresent:()=>allowed});
 return {media,context,events,targets,published,released,base:()=>baseOptions,frame:pts=>media.videoFrame(0,8,0,pts,0,0,0,0,heap),time:t=>{time=t;},ready:v=>{ready=v;},allowed:v=>{allowed=v;},borrow:v=>{borrow=v;}};
}
test('AV1 presents once per RAF service turn and reads back directly into the fenced video slot',async()=>{
 const e=await streamingMedia();e.frame(1);e.frame(2);await e.media.prepareVideo();
 e.media.drainVideo();assert.equal(e.published.length,0);e.media.finishVideo();assert.equal(e.published.length,1);
 e.media.finishVideo();assert.equal(e.published.length,1,'tail queries cannot publish again');
 e.time(16.5);e.media.drainVideo();assert.equal(e.published.length,2);assert.deepEqual(e.targets,[0x40000000n,0x40000000n]);
 const s=e.media.stats();assert.equal(s.intervalCount,1);assert.equal(s.intervalMs,16.5);assert.equal(s.presentAgeSamples,2);assert.equal(s.presentationTimings.wait,4);
 await e.media.close();assert.deepEqual(e.events.slice(-3),[['base-close'],['finish'],['retire']]);assert.equal(e.released.length,5);
});
test('AV1 latency mode skips pacing, falls back to staging, and continues decoding behind a menu',async()=>{
 const e=await streamingMedia('av1',false);e.borrow(false);e.frame(1);e.frame(2);e.frame(3);await e.media.prepareVideo();
 e.media.drainVideo();e.media.finishVideo();assert.equal(e.published.length,1);assert.notEqual(e.targets[0],0x40000000n);
 e.allowed(false);e.media.drainVideo();e.media.finishVideo();assert.equal(e.published.length,1);assert.equal(e.targets.length,3);
 assert.equal(e.media.stats().decoded,3);await e.media.close();
});
test('AV1 never reads or releases a pending decode and enforces a deadline across nonblocking queries',async()=>{
 const e=await streamingMedia();e.frame(1);await e.media.prepareVideo();e.ready(false);e.media.drainVideo();
 for(let i=0;i<20;i++)e.media.finishVideo();assert.equal(e.targets.length,0);assert.equal(e.released.length,0);
 e.time(5001);assert.throws(()=>e.media.finishVideo(),/AV1 decode timed out/);await e.media.close();
});
test('H.264 only borrows the mapped output for zero-offset layouts and shares the presentation gate',async()=>{
 const e=await streamingMedia('h264'),base=e.base();
 assert.equal(base.videoOutput(4096,4096,{yOffset:0}),0x40000000n);assert.equal(base.videoOutput(4096,4096,{yOffset:128}),null);
 const fields={width:1920,height:1080,yStride:1920,uvStride:1920,yOffset:0,uvOffset:1920*1080};
 assert.equal(base.canPresent(),true);base.videoSink(0x40000000n,1920*1080*3/2,fields);assert.equal(base.canPresent(),false);
 e.media.drainVideo();assert.equal(base.canPresent(),true);await e.media.close();
});

test('the shipped Vulkan presenter submits with a fence and defers only the completion wait',()=>{
 const create=load().MoonlightNativeModules.presentation.createPresentation,words=new Map(),calls=[];
 const functions={acquire:1,submit:2,present:3,wait:4,waitFences:5,resetFences:6};
 const native={address:BigInt,integer:(v,min,max)=>{assert(v>=min&&v<=max);return v;},checkMemory(){},
  verified:new Set(Object.values(functions).map(v=>'0x'+v.toString(16))),
  write32:(p,v)=>words.set(p,v),write64:(p,v)=>words.set(p,v),read32:p=>words.get(p),
  call:(fn,...args)=>{calls.push({fn,args});if(fn===1n)words.set(args[2],0n);return 0n;}};
 const present=create(native,{memory:0x1000,device:10,queue:11,swapchain:12,acquired:13,commands:[14,15],semaphores:[16,17],functions,
  deferWait:true,slots:{interactive:[[20,21],[22,23]],streaming:[[24,25],[26,27]],acquired:[28,29],fences:[30,31]}});
 present(0,false);assert.deepEqual(calls.map(c=>c.fn),[1n,2n,3n]);assert.equal(calls[1].args[3],30n);
 present.finish();assert.deepEqual(calls.map(c=>c.fn),[1n,2n,3n,5n,6n]);
 const count=calls.length;present.finish();assert.equal(calls.length,count,'completed slots are not waited or reset again');
 present(0,false);present.finish();assert.equal(calls.some(c=>c.fn===4n),false,'steady streaming avoids queue-wide waits');
});

test('native statistics are a small bounded RGBA badge with opaque text and initialized background',()=>{
 const scope={Uint8Array,Uint32Array,ArrayBuffer};scope.window=scope;vm.createContext(scope);
 vm.runInContext(fs.readFileSync('app/src/ui/native-stream-menu.js','utf8'),scope);
 const image=scope.MoonlightNativeStreamMenu.renderStatistics({mode:{width:1920,height:1080,fps:120,bitrate:40000},telemetry:{textureFps:90.8,decodedFps:98,receivedMbps:31,frameIntervalMs:11,frameJitterMs:2}});
 assert.equal(image.bytes.length,image.width*image.height*4);assert(image.bytes.length<256*1024);
 assert.equal(image.bytes[3],220);assert(image.bytes.some((v,i)=>i%4===3&&v===255));
});

test('native H.264 and audio retain the graphics context guarded caller through teardown',async()=>{
 const e=await streamingMedia('h264');assert.equal(e.base().nativeCall,e.context.rawCall);
 e.base().nativeCall(123n,[4n]);assert.deepEqual(e.events.at(-1),['guarded-call',123n,4n]);
 await e.media.close();assert.deepEqual(e.events.slice(-3),[['base-close'],['finish'],['retire']]);
});
