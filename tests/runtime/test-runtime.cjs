const assert=require('node:assert/strict');
const {inflateSync}=require('node:zlib');
const {randomFillSync}=require('node:crypto');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const preview={Uint8Array,Uint32Array,Int32Array,Number,DataView,btoa:s=>Buffer.from(s,'binary').toString('base64')};preview.window=preview;vm.createContext(preview);vm.runInContext(fs.readFileSync(path.join(root,'app/src/streaming/png-preview.js'),'utf8'),preview);
const make=require(path.join(root,'dist/runtime/moonlight-stream.js'));
(async()=>{
 const core=await make({moonlightPlatform:{randomFill:randomFillSync}});
 for(const name of ['mouse_move','mouse_button','mouse_scroll','touch','touch_supported','pointer_reset','keys_reset'])assert.equal(typeof core['_ml_session_'+name],'function','input export: '+name);
 assert.equal(core._ml_session_keys_reset(),-1);
 assert.equal(core._ml_session_mouse_scroll(0,120),-1);assert.equal(core._ml_session_mouse_scroll(32768,0),-3);
 assert.equal(core._ml_session_touch_supported(),0);assert.equal(core._ml_session_mouse_move(1,2),-1);assert.equal(core._ml_session_touch(1,42,.5,.5),-1);assert.equal(core._ml_session_pointer_reset(),-1);
 const generated=fs.readFileSync(path.join(root,'dist/runtime/moonlight-stream.js'),'utf8');
 const loadBody=generated.match(/function moonlight_load_i32\(p\)\{[^}]+\}/)[0];
 const heapName=fs.readFileSync(path.join(root,'build/wasm2js/moonlight-stream.js.symbols'),'utf8').split('\n').find(l=>l.endsWith(':HEAPU8')).split(':')[0];
 const loadHeap=Uint8Array.from({length:512},(_,i)=>(i*61+i/16)&255);
 const loadFn=new Function(heapName,'moonlight_load_view',loadBody+';return moonlight_load_i32;')(loadHeap,new DataView(loadHeap.buffer));
 for(const p of [...Array.from({length:520},(_,i)=>i-4),-2147483648,2147483647]){
  let expected=0;for(let i=0;i<4;i++)expected|=(loadHeap[p+i|0]||0)<<(i*8);
  assert.equal(loadFn(p),expected,'specialized load preserves partial/out-of-range byte semantics: '+p);
 }

 assert.equal(core._ml_session_set_reference_recovery(2),-1);
 assert.equal(core._ml_session_set_reference_recovery(1),0);
 assert.equal(core._ml_session_set_reference_recovery(0),0);
 assert.equal(core._ml_session_set_rumble(-1),-1);
 assert.equal(core._ml_session_set_rumble(2),-1);
 assert.equal(core._ml_session_set_rumble(1),0);
 assert.equal(core._ml_session_set_rumble(0),0);
 for(const budget of [NaN,Infinity,0,-1,50.5])assert.equal(core._ml_runtime_pump(budget),-2,'invalid pump budget does not start a scheduler turn');
 assert.equal(core._ml_runtime_pump(.5),0,'fractional budgets are accepted');
 let timestampSeed=127;
 const timestamps=[0,1,89,90,0x3fffff,0x400000,0x7fffffff,0xfffffffe,0xffffffff];
 for(let i=0;i<20000;i++){timestampSeed^=timestampSeed<<13;timestampSeed^=timestampSeed>>>17;timestampSeed^=timestampSeed<<5;timestamps.push(timestampSeed>>>0);}
 for(const timestamp of timestamps)assert.equal(core._ml_test_rtp_timestamp(timestamp),Number(BigInt(timestamp)*1000n/90n),'exact uint32 RTP timestamp: '+timestamp);
 assert.equal(core._ml_test_packet_pool(),0,'packet pool preserves ownership, exhaustion fallback, realloc, and refuses live teardown');
 assert.equal(core._ml_packet_pool_benchmark(1),0,'packet-sized allocation churn reuses buffers and releases all ownership');
 for(const algorithm of ['rtsp','fec','crypto','unaligned'])assert.equal(core['_ml_test_'+algorithm](),0,'optimized stream core: '+algorithm);
 assert.equal(core._ml_test_fec_vectors(),0,'all GF coefficients, unaligned rows, tails and in-place scaling match upstream');
 assert.equal(core._ml_test_fec_large(),0,'64+16 shard encode/recovery agrees with upstream parity');
 assert.equal(core._ml_test_video_queue(),0,'receive queue matches upstream for gaps, duplicates, reordering, wrap and FEC');
 assert.equal(core._ml_video_queue_benchmark(0,3),core._ml_video_queue_benchmark(1,3),'queue benchmark processes identical packets');
 assert.equal(core._ml_fec_prepare_pair(256),-1);
 for(let u=0;u<256;u++)assert.equal(core._ml_fec_prepare_pair(u),0);
 assert.equal(core._ml_test_fec_vectors(),0,'paired lookup: all coefficients/alignment/tails match upstream');
 assert.equal(core._ml_test_fec_large(),0,'paired lookup: actual large erasure recovery');
 const fecYields=core._ml_runtime_budget_yields();assert.equal(core._ml_fec_budget_test_start(128),0);core._ml_runtime_pump(1);
 assert.equal(core._ml_fec_prepare_pair(-1),-1,'cannot release tables during suspended recovery');
 assert.equal(core._ml_session_set_reference_recovery(1),-1,'cannot change decoder capabilities with suspended tasks');
 assert.equal(core._ml_session_set_rumble(1),-1,'cannot change controller capabilities with suspended tasks');
 assert.equal(core._ml_video_batch_configure(1),-1,'cannot replace receive ownership with suspended tasks');
 assert.equal(core._ml_fec_budget_test_result(),0,'large recovery yields before completing the workload');assert(core._ml_runtime_budget_yields()>fecYields);
 const fecDeadline=Date.now()+5000;
 while(core._ml_runtime_tasks()&&Date.now()<fecDeadline){core._ml_runtime_pump(2);await new Promise(r=>setTimeout(r,0));}
 assert.equal(core._ml_fec_budget_test_result(),1,'recovery resumes with identical bytes after fiber suspension');assert.equal(core._ml_runtime_tasks(),0);
 assert.equal(core._ml_fec_prepare_pair(-1),0);assert.equal(core.moonlightFecPairs,undefined);
 const oldHeap=core.HEAPU8.buffer,growth=core._malloc(40*1024*1024);assert(growth);assert.notEqual(core.HEAPU8.buffer,oldHeap,'force memory growth');core._free(growth);
 for(const name of ['unaligned','crypto'])assert.equal(core['_ml_test_'+name](),0,'fresh native load view after heap growth: '+name);
 assert.equal(core._ml_session_metrics(),0,'metrics are unavailable outside an active connection');
 const yieldsBefore=core._ml_runtime_budget_yields();
 assert.equal(core._ml_budget_test_start(),0);core._ml_runtime_pump(1);
 assert.equal(core._ml_budget_test_result(),0,'checkpoint returns to JS before long-running work finishes');
 assert(core._ml_runtime_budget_yields()>yieldsBefore);
 const budgetDeadline=Date.now()+2000;
 while(core._ml_runtime_tasks()&&Date.now()<budgetDeadline){core._ml_runtime_pump(1);await new Promise(r=>setTimeout(r,2));}
 assert.equal(core._ml_budget_test_result(),1);assert.equal(core._ml_runtime_tasks(),0);
 assert.equal(core._ml_input_priority_test_start(),0);core._ml_runtime_pump(2);
 assert.equal(core._ml_input_priority_test_result(),123,'dispatch, InputSend and audio run before a busy video task exhausts the budget');
 const priorityDeadline=Date.now()+2000;
 while(core._ml_runtime_tasks()&&Date.now()<priorityDeadline){core._ml_runtime_pump(2);await new Promise(r=>setTimeout(r,2));}
 assert.equal(core._ml_input_priority_test_result(),1234);assert.equal(core._ml_runtime_tasks(),0,'priority tasks join and release normally');
 assert.equal(core._ml_input_wake_test_start(),0);
 const inputWakeDeadline=Date.now()+1000;
 while(core._ml_runtime_tasks()&&Date.now()<inputWakeDeadline){core._ml_runtime_pump(2);await new Promise(r=>setTimeout(r,2));}
 assert.equal(core._ml_input_wake_test_result(),42,'fresh input wakes a sleeping priority dispatcher');assert.equal(core._ml_runtime_tasks(),0);
 assert.equal(core._ml_scheduler_test_start(),0);
 const end=Date.now()+2000;
 while(core._ml_runtime_tasks()&&Date.now()<end){core._ml_runtime_pump(5);await new Promise(r=>setTimeout(r,2));}
 assert.equal(core._ml_scheduler_test_result(),42);assert.equal(core._ml_runtime_tasks(),0);
 assert.equal(core._ml_interrupt_test_start(),0);
 const interruptDeadline=Date.now()+1000;
 while(core._ml_runtime_tasks()&&Date.now()<interruptDeadline){core._ml_runtime_pump(5);await new Promise(r=>setTimeout(r,2));}
 assert.equal(core._ml_interrupt_test_result(),42,'interrupt wakes a 60-second sleeper immediately');assert.equal(core._ml_runtime_tasks(),0);
 // Padded NV12 layout and BT.601 limited-range blue, matching the console fixture.
 const width=64,height=64,stride=80,offset=stride*height,length=offset+stride*height/2;
 const p=core._malloc(length);core.HEAPU8.fill(0,p,p+length);
 for(let y=0;y<height;y++)core.HEAPU8.fill(41,p+y*stride,p+y*stride+width);
 for(let y=0;y<height/2;y++)for(let x=0;x<width;x+=2){core.HEAPU8[p+offset+y*stride+x]=240;core.HEAPU8[p+offset+y*stride+x+1]=110;}
 const encoded=core._ml_png_nv12(p,length,width,height,stride,stride,0,offset);assert(encoded);
 const png=Buffer.from(core.UTF8ToString(encoded),'base64');
 assert.equal(preview.MoonlightPreview.encode(core.HEAPU8,p,length,width,height,stride,stride,0,offset,true),'data:image/png;base64,'+core.UTF8ToString(encoded));
 const indexed=Buffer.from(preview.MoonlightPreview.encode(core.HEAPU8,p,length,width,height,stride,stride,0,offset).split(',')[1],'base64');
 let pal,data;for(let i=8;i<indexed.length;){const n=indexed.readUInt32BE(i),type=indexed.toString('ascii',i+4,i+8);if(type==='PLTE')pal=indexed.subarray(i+8,i+8+n);if(type==='IDAT')data=inflateSync(indexed.subarray(i+8,i+8+n));i+=n+12;}
 assert.equal(pal.length,768);assert.equal(data.length,(width+1)*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const index=data[y*(width+1)+x+1];assert(pal[index*3]<=40&&pal[index*3+1]<=40&&pal[index*3+2]>=210);}
 assert(indexed.length<png.length/2);
 assert.throws(()=>preview.MoonlightPreview.encode(core.HEAPU8,p,length-100,width,height,stride,stride,0,offset),/bounds/);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 let compressed=[];
 for(let i=8;i<png.length;){const n=png.readUInt32BE(i),name=png.toString('ascii',i+4,i+8),data=png.subarray(i+8,i+8+n);assert.equal(crc(png.subarray(i+4,i+8+n)),png.readUInt32BE(i+8+n));if(name==='IDAT')compressed.push(data);if(name==='IHDR'){assert.equal(data.readUInt32BE(0),width);assert.equal(data.readUInt32BE(4),height);}i+=n+12;}
 const raw=inflateSync(Buffer.concat(compressed));assert.equal(raw.length,(width*3+1)*height);
 for(let y=0;y<height;y++){assert.equal(raw[y*(width*3+1)],0);for(let x=0;x<width;x++){const pixel=raw.subarray(y*(width*3+1)+1+x*3,y*(width*3+1)+4+x*3);assert(pixel[0]<=2&&pixel[1]<=2&&pixel[2]>=250);}}
 assert.equal(core._ml_png_nv12(p,length-100,width,height,stride,stride,0,offset),0);
 assert.equal(core._ml_png_nv12(p,length,641,height,stride,stride,0,offset),0);
 randomFillSync(core.HEAPU8.subarray(p,p+length));
 const varied=core._ml_png_nv12(p,length,width,height,stride,stride,0,offset);
 assert.equal(preview.MoonlightPreview.encode(core.HEAPU8,p,length,width,height,stride,stride,0,offset,true),'data:image/png;base64,'+core.UTF8ToString(varied));
 core._ml_png_release();core._free(p);
 console.log('Cooperative scheduler and NV12 → PNG pixel/CRC/bounds checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
