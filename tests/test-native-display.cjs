const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(failure){
 const scope={Uint8Array,Uint32Array,ArrayBuffer,DataView,setTimeout,clearTimeout,innerWidth:1280,innerHeight:720};scope.window=scope;vm.createContext(scope);
 for(const file of ['app/vendor/native-ui-runtime.js','app/src/streaming/native-buffer.js','app/vendor/moonlight-nx2-runtime.js','app/src/streaming/native-cleanup.js','app/src/streaming/native-context.js'])vm.runInContext(fs.readFileSync(file,'utf8'),scope,{filename:file});
 const modules=scope.MoonlightNativeModules,layout=modules.layout,words=new Map(),writes=[],allocated=[],presents=[],events=[];let next=0x10000,inFlight=false,failFinish=false;
 function writable(){assert.equal(inFlight,false,'GPU reads must complete before mapped storage changes');}
 const originalAllocate=async(bytes)=>{const p=next;next+=Math.ceil(bytes/4096)*4096;allocated.push(p);return p;};
 const context={rpc:{allocate:originalAllocate,request:async()=>({hash:modules.compatTable.module.hash})},resolve:()=>0x9000,
  native:{write32:(pointer,value)=>{writable();words.set(Number(pointer),Number(value));},checkMemory(){}},write:(pointer,bytes)=>{writable();writes.push({pointer:Number(pointer),length:bytes.length});},
  call:()=>0n,release(){throw Error('prepare must retain owners');},close(){throw Error('prepare must retain the context');}};
 scope.MoonlightNativeContext.create=()=>context;
 modules.display={createDisplay:async rpc=>{
  const layer=await rpc.allocate(0x9000),objects=[{kind:'instance',name:'vulkan',handle:'10',destroy:{name:'vkDestroyInstance',args:['$handle',0]}}];
  if(failure==='display')throw Object.assign(Error('display setup failed'),{objects});
  const display={instance:'10',device:'11',queue:'12',swapchain:'13',layer,size:{width:1920,height:1080},imageCount:2};
  return {display,objects:objects.concat([{kind:'layer',name:'moonlight',handle:String(layer),destroy:{name:'_ZN2nn2vi5Layer5CloseEb',args:['$handle',0]}},{kind:'swapchain',name:'fifo',handle:'13',destroy:{name:'vkDestroySwapchainKHR',args:['11','$handle',0]}}])};
 }};
 modules.pipelines={createRendererPipelines:async(rpc,options)=>{
  const work=await rpc.allocate(0x4000),created=[{kind:'allocation',name:'work',handle:String(work),destroy:'release'},{kind:'buffer',name:'storage',handle:'20',destroy:'vkDestroyBuffer'}];
  await options.onCreated(created);
  if(failure==='renderer')throw Object.assign(Error('renderer setup failed'),{created});
  return {created,gpu:{privateStorage:{mapped:0x10000000,bytes:layout.STORAGE_BYTES},commands:[['21','22']],slots:{},video:{path:'texel-buffer'}},menu:{controls:{mapped:0x20000000,bytes:4096},resources:{device:'11',queue:'12',swapchain:'13',acquired:'23',semaphores:['24','25']}}};
 }};
 modules.presentation={createPresentation:(native,config)=>{assert.equal(config.deferWait,true);const present=(slot,interactive)=>{writable();presents.push({slot,interactive});events.push('submit');inFlight=true;return 0;};present.finish=()=>{if(failFinish)throw Error('fence failed');if(inFlight)events.push('complete');inFlight=false;};return present;}};
 vm.runInContext(fs.readFileSync('app/src/streaming/native-display.js','utf8'),scope);
 return {scope,api:scope.MoonlightNativeDisplay,context,originalAllocate,layout,words,writes,allocated,presents,events,inFlight:()=>inFlight,failFinish:()=>{failFinish=true;}};
}
const size={width:1920,height:1080};
function rgba(){return {width:1920,height:1080,bytes:new Uint8Array(1920*1080*4)};}
test('prepare tracks display, renderer and scratch ownership while restoring the shared allocation API',async()=>{
 const h=setup(),state=await h.api.prepare(size),snapshot=state.ledger.snapshot();
 assert.equal(h.context.rpc.allocate,h.originalAllocate);
 assert.deepEqual(Array.from(snapshot.allocations,a=>Number(a.handle)),h.allocated);
 assert.equal(snapshot.objects.filter(o=>o.kind==='buffer').length,1,'incremental and final renderer metadata cannot double-record ownership');
 const owners=snapshot.allocations.length;await h.context.rpc.allocate(4096);
 assert.equal(state.ledger.snapshot().allocations.length,owners,'later decoder allocations must stay outside the display ledger');
 assert.equal(h.presents.length,0,'setup does not consume a frame');
});
test('failed display and renderer setup retain partial owners and restore rpc.allocate',async()=>{
 for(const stage of ['display','renderer']){
  const h=setup(stage);await assert.rejects(h.api.prepare(size),new RegExp(stage+' setup failed'));
  const state=h.api.state(),snapshot=state.ledger.snapshot();assert.equal(state.failed,true);assert.equal(state.ready,false);
  assert.equal(h.context.rpc.allocate,h.originalAllocate);assert.deepEqual(Array.from(snapshot.allocations,a=>Number(a.handle)),h.allocated);
  assert(snapshot.objects.some(o=>o.kind==='instance'&&o.status==='owned'));
  if(stage==='renderer')assert.equal(snapshot.objects.filter(o=>o.kind==='buffer').length,1);
  await assert.rejects(h.api.prepare(size),/Restart Civ VII/);
 }
});
test('UI writes fit the third frame slot and cannot alter NV12 data or decoder control words',async()=>{
 const h=setup(),state=await h.api.prepare(size),l=h.layout;
 const nativeFields=[l.CONTROL.mode,l.CONTROL.nativeSequence,l.CONTROL.nativeIndex,l.VIDEO.base+l.VIDEO.sequence,l.VIDEO.base+l.VIDEO.width,l.VIDEO.base+l.VIDEO.height];
 nativeFields.forEach((offset,index)=>h.words.set(state.storage+offset,100+index));
 const start=h.writes.length,frame=rgba();assert.equal(h.api.setUiOverlay(frame),true);
 const writes=h.writes.slice(start);assert.deepEqual(writes,[{pointer:state.storage+l.BADGE_OFFSET,length:frame.bytes.length}]);
 assert.equal(l.BADGE_OFFSET,l.FRAMES_OFFSET+2*l.FRAME_BYTES);assert(frame.bytes.length<=l.FRAME_BYTES);
 assert(writes[0].pointer+writes[0].length<=state.storage+l.BADGE_OFFSET+l.FRAME_BYTES);
 nativeFields.forEach((offset,index)=>assert.equal(h.words.get(state.storage+offset),100+index));
 for(const [name,value] of [['x',0],['y',0],['width',1920],['height',1080],['visible',1]])assert.equal(h.words.get(state.storage+l.BADGE[name]),value);
 assert.equal(h.presents.length,1,'an idle host must still present a changed menu immediately');
 assert.deepEqual(h.presents[0],{slot:0,interactive:false});
});
test('UI rejects wrong dimensions, pixel type, byte count or a surface larger than its frame slot before writing',async()=>{
 const h=setup();await h.api.prepare(size);const frame=rgba(),before=h.writes.length;
 for(const invalid of [null,{...frame,width:1280},{...frame,height:720},{...frame,bytes:new Uint8Array(4)},{...frame,bytes:new Array(frame.bytes.length)}])assert.throws(()=>h.api.setUiOverlay(invalid),/bounds rejected/);
 const limit=h.layout.FRAME_BYTES;h.layout.FRAME_BYTES=frame.bytes.length-1;
 assert.throws(()=>h.api.setUiOverlay(frame),/bounds rejected/);h.layout.FRAME_BYTES=limit;
 assert.equal(h.writes.length,before);assert.equal(h.presents.length,0);
});
test('clearing an active UI hides and presents exactly once without changing video control state',async()=>{
 const h=setup(),state=await h.api.prepare(size);h.api.setUiOverlay(rgba());const writes=h.writes.length;
 h.api.clearUiOverlay();assert.equal(h.words.get(state.storage+h.layout.BADGE.visible),0);assert.equal(h.presents.length,2);assert.equal(state.uiOverlayActive,false);
 h.api.clearUiOverlay();assert.equal(h.presents.length,2);assert.equal(h.writes.length,writes);
});
test('failed, retired and absent displays cannot receive UI writes or presentations',async()=>{
 const absent=setup();assert.equal(absent.api.setUiOverlay(null),false);absent.api.clearUiOverlay();assert.equal(absent.presents.length,0);
 for(const flag of ['failed','retired']){
  const h=setup(),state=await h.api.prepare(size);h.api.setUiOverlay(rgba());state[flag]=true;const writes=h.writes.length,presents=h.presents.length;
  assert.equal(h.api.setUiOverlay(null),false);h.api.clearUiOverlay();assert.equal(h.writes.length,writes);assert.equal(h.presents.length,presents);
 }
});

test('stream presentation borrows the resident device/swapchain and reuses it across mode changes',async()=>{
 const h=setup(),events=[];let callback,binds=0,closes=0;
 const display={instance:'10',device:'11',queue:'12',swapchain:'13',size:{width:1920,height:1080},imageCount:2};
 const shared={api:1,renderer:{owner:{context:h.context,display,displayStage:{display,objects:[]}},bindSurface(fn){binds++;callback=fn;return {close(){closes++;callback=null;}};}},active:{ui:{resetLayoutCache:()=>events.push('invalidate')}}};
 h.scope.CivNanoVGSession={current:shared};h.scope.memcpy_addr=0x9000n;h.context.rawCall=(fn,args)=>events.push({fn,args});
 h.scope.MoonlightNativeModules.display.createDisplay=()=>{throw Error('must not create another display');};
 const state=await h.api.prepare({width:3840,height:2160});assert.equal(state.display,display);assert.equal(state.context,h.context);assert.equal(binds,1);assert.equal(state.ledger.snapshot().objects.some(o=>o.kind==='instance'),false);
 const rgba={pointer:0x30000000,bytes:1920*1080*4,width:1920,height:1080};callback(rgba);
 const copy=events.find(e=>e.args);assert.deepEqual(Array.from(copy.args),[BigInt(state.storage+h.layout.BADGE_OFFSET),BigInt(rgba.pointer),BigInt(rgba.bytes)]);
 assert.equal(h.words.get(state.storage+h.layout.BADGE.visible),1);
 const presentations=h.presents.length;assert.throws(()=>callback({...rgba,bytes:4}),/bounds/);assert.equal(h.presents.length,presentations);
 await h.api.retire();assert.equal(closes,1);assert.equal(state.ready,true);assert.equal(state.retired,undefined);assert.equal(h.words.get(state.storage+h.layout.BADGE.visible),0);
 assert.equal(await h.api.prepare({width:1280,height:720}),state);assert.equal(binds,2);await h.api.retire();assert.equal(closes,2);
});

test('deferred video overlaps CPU service and waits before direct decoder writes, UI updates and handoff',async()=>{
 const h=setup(),state=await h.api.prepare(size),bytes=1920*1080*3/2,p=BigInt(state.storage+h.layout.FRAMES_OFFSET),copies=[];
 h.scope.memcpy_addr=0x9000n;h.context.rawCall=(fn,args)=>{assert.equal(h.inFlight(),false);copies.push(args);};
 h.api.publish(0x40000000n,1920,1080,1920,1080);assert.equal(h.inFlight(),true);assert.equal(copies.length,1);
 // Network/Opus can run here; no queue wait happened at the end of publish.
 assert.deepEqual(h.events,['submit']);
 assert.equal(h.api.videoBuffer(bytes,4096),p);assert.equal(h.inFlight(),false);
 h.api.publish(p,1920,1080,1920,1080);assert.equal(copies.length,1,'direct readback avoids a full NV12 copy');
 h.api.setUiOverlay(rgba());h.api.clearUiOverlay();assert.equal(h.inFlight(),true);
 h.scope.MoonlightNativeStreamMenu={render:()=>({width:1280,height:720,bytes:new Uint8Array(1280*720*3/2)})};
 await h.api.retire();assert.equal(h.inFlight(),false,'close drains the final stopped notice');
 // Explicit finish also covers the final notice and repeated close is harmless.
 h.api.finish();assert.equal(h.inFlight(),false);
});
test('direct decode buffers reject invalid sizes and fall back on unsupported alignment',async()=>{
 const h=setup(),state=await h.api.prepare(size),bytes=1920*1080*3/2;
 assert.throws(()=>h.api.videoBuffer(h.layout.FRAME_BYTES+1,4096),/bounds/);
 assert.throws(()=>h.api.videoBuffer(bytes,0),/bounds/);
 assert.equal(h.api.videoBuffer(bytes,3),null);
 state.overlayActive=true;assert.equal(h.api.videoBuffer(bytes,4096),null);
});
test('only the retained owned video mapping is reused, and retirement invalidates it',async()=>{
 const h=setup(),state=await h.api.prepare(size),checks=[];
 h.context.native.checkMemory=(...args)=>checks.push(args);
 h.scope.memcpy_addr=0x9000n;h.context.rawCall=()=>{};
 const p=h.api.videoBuffer(1920*1080*3/2,4096);
 h.api.publish(p,1920,1080,1920,1080);h.api.videoBuffer(1920*1080*3/2,4096);
 h.api.publish(p,1920,1080,1920,1080);assert.equal(checks.length,1);
 h.api.publish(0x40000000n,1920,1080,1920,1080);assert.equal(checks.length,2);
 h.api.publish(0x40000000n,1920,1080,1920,1080);assert.equal(checks.length,3);
 h.api.videoBuffer(1920*1088*3/2,4096);assert.equal(checks.length,4);
 h.scope.MoonlightNativeStreamMenu={render:()=>({width:1280,height:720,bytes:new Uint8Array(1280*720*3/2)})};
 await h.api.retire();assert.equal(state.videoMemory,null);
});
test('failed completion prevents all later writes and quarantines the shared display',async()=>{
 const h=setup(),state=await h.api.prepare(size);h.api.setUiOverlay(rgba());h.failFinish();const count=h.writes.length;
 assert.throws(()=>h.api.videoBuffer(4096,4096),/fence failed/);assert.equal(state.failed,true);assert.equal(h.writes.length,count);
 assert.equal(h.api.setUiOverlay(rgba()),false);await assert.rejects(h.api.retire(),/completion is uncertain/);
});
test('presentation calls retain per-call signatures and owned-stack execution without temporary reads',async()=>{
 const h=setup(),signature=0x1122334455667788n,calls=[];
 h.context.native.verified=new Set(['0x9000']);h.context.native.read64=()=>signature;
 h.context.rpc.verifiedFunctions=new Map([['0x9000','8877665544332211']]);
 h.context.rawCall=(fn,args)=>{calls.push({fn,args});return 0n;};
 let call;
 h.scope.MoonlightNativeModules.presentation.createPresentation=native=>{call=native.call;const present=()=>call(0x9000n);present.finish=()=>{};return present;};
 const state=await h.api.prepare(size);
 assert.equal(call(0x9000n,1n,2n),0n);assert.deepEqual(Array.from(calls[0].args),[1n,2n]);
 assert.equal(calls[0].fn,0x9000n);assert.equal(state.failed,false);
 h.context.native.read64=()=>signature^1n;assert.throws(()=>state.present(),/function changed/);assert.equal(calls.length,1);assert.equal(state.failed,true);
});
test('unverified entry points fail before presentation and a retained older presenter upgrades only after completion',async()=>{
 const missing=setup();missing.context.native.verified=new Set();missing.context.native.read64=()=>0n;
 missing.context.rpc.verifiedFunctions=new Map();missing.context.rawCall=()=>assert.fail('unverified native work');
 await assert.rejects(missing.api.prepare(size),/Unverified streaming/);
 const h=setup(),state=await h.api.prepare(size);h.api.setUiOverlay(rgba());state.presentationVersion=1;
 assert.equal(h.inFlight(),true);assert.equal(await h.api.prepare(size),state);assert.equal(h.inFlight(),false);assert.equal(state.presentationVersion,2);
});

test('compact statistics share the fenced badge slot without an extra video acquire or full UI copy',async()=>{
 const h=setup(),state=await h.api.prepare(size),l=h.layout,frame={width:672,height:88,bytes:new Uint8Array(672*88*4)};let visible=true;
 h.api.publish(BigInt(state.storage+l.FRAMES_OFFSET),1920,1080,1920,1080);
 const before=h.presents.length;
 const queuedWrites=h.writes.length;assert.equal(h.api.setStatistics(frame,()=>visible),true);assert.equal(h.inFlight(),true,'stats never wait for the preceding video fence');assert.equal(h.writes.length,queuedWrites);
 h.api.publish(BigInt(state.storage+l.FRAMES_OFFSET),1920,1080,1920,1080);
 assert.equal(h.presents.length,before+1,'only the explicit next video presentation acquires an image');
 assert.deepEqual(h.writes.at(-1),{pointer:state.storage+l.BADGE_OFFSET,length:frame.bytes.length});
 assert.equal(h.words.get(state.storage+l.BADGE.width),672);assert.equal(h.words.get(state.storage+l.BADGE.height),88);
 const uploads=h.writes.length;h.api.setStatistics(frame,()=>visible);assert.equal(h.writes.length,uploads);
 visible=false;h.api.setStatistics(frame,()=>visible);h.api.publish(BigInt(state.storage+l.FRAMES_OFFSET),1920,1080,1920,1080);assert.equal(h.words.get(state.storage+l.BADGE.visible),0);
 assert.throws(()=>h.api.setStatistics({...frame,width:1920},()=>true),/bounds/);
 h.api.setStatistics(null);assert.equal(state.statistics,null);
});

test('compact statistics yield to a local menu and resume after its full UI scene closes',async()=>{
 const h=setup();let surface,visible=true,copies=0;
 const display={device:'11',queue:'12',swapchain:'13',size};
 h.scope.CivNanoVGSession={current:{renderer:{owner:{context:h.context,display,displayStage:{display,objects:[]}},bindSurface(fn){surface=fn;return {close(){surface=null;}};}},active:{ui:{resetLayoutCache(){}}}}};
 h.scope.memcpy_addr=0x9000n;h.context.rawCall=()=>{assert.equal(h.inFlight(),false);copies++;};
 const state=await h.api.prepare(size),frame={width:672,height:88,bytes:new Uint8Array(672*88*4)},ui={pointer:0x30000000,bytes:1920*1080*4,width:1920,height:1080};
 h.api.setStatistics(frame,()=>visible);surface(ui);assert.equal(copies,0);
 visible=false;surface(ui);assert.equal(copies,1);assert.equal(state.statisticsDrawn,false);
 visible=true;surface(ui);assert.equal(copies,1);assert.equal(state.statisticsDrawn,frame);
 await h.api.retire();assert.equal(state.statistics,null);assert.equal(state.statisticsDrawn,false);
 assert.equal(h.api.setStatistics(frame,()=>true),false,'a closed surface cannot overwrite Launcher pixels');
});
