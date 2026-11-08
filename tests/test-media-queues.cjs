const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app/src/streaming/native-media.js','utf8');
const scope={};scope.window=scope;vm.createContext(scope);vm.runInContext(source,scope);
const drain=scope.MoonlightStreamMedia.drainLatest;
test('video presents the newest timestamp once, releases every output, and keeps nondisplay frames out of the texture',()=>{
 const frames=[{index:1,timestamp:100,displayable:true},{index:2,timestamp:300,displayable:true},{index:3,timestamp:200,displayable:true},{index:4,timestamp:400,displayable:false}],released=[],decoded=[],presented=[];let skipped=0;
 drain({acquire:()=>frames.shift(),release:f=>released.push(f.index),decoded:f=>decoded.push(f.index),superseded:()=>skipped++,present:f=>presented.push(f.index)});
 assert.deepEqual(presented,[2]);assert.deepEqual(decoded,[1,2,3,4]);assert.deepEqual(released.sort(),[1,2,3,4]);assert.equal(skipped,2);
});
test('video releases held outputs on acquisition, metadata and presentation errors and bounds catch-up work',()=>{
 for(const failure of ['acquire','decoded','present']){
  let acquired=0;const released=[];
  assert.throws(()=>drain({acquire:()=>{if(acquired===2){if(failure==='acquire')throw Error(failure);return null;}return {index:acquired++,timestamp:acquired,displayable:true};},release:f=>released.push(f.index),decoded:()=>{if(failure==='decoded')throw Error(failure);},superseded:()=>{},present:()=>{if(failure==='present')throw Error(failure);}}),new RegExp(failure));
  assert.equal(released.length,acquired);assert.equal(new Set(released).size,acquired);
 }
 let acquired=0,presented=-1,skipped=0;const released=[];
 drain({acquire:()=>({index:acquired++,timestamp:acquired,displayable:true}),release:f=>released.push(f.index),decoded:()=>{},superseded:()=>skipped++,present:f=>presented=f.index});
 assert.equal(acquired,32);assert.equal(presented,31);assert.equal(skipped,31);assert.equal(new Set(released).size,32);
});

function audioEnvironment(){
 const memory=Buffer.alloc(1048576),owned=new Set(),active=[],released=[],infos=new Map(),appended=[],calls=[];
 let cursor=4096,decodeCount=0,samples=240,playing=false;
 function alloc(n){const p=BigInt(cursor);cursor+=n+16;assert(cursor<memory.length);owned.add(p);return p;}
 function write(p,v,n){for(let i=0;i<n;i++)memory[Number(p)+i]=Number((v>>BigInt(i*8))&255n);}
 function sdk(name,args){
  calls.push(name);
  if(name==='nncodecLibopus_opus_decoder_get_size')return 64n;
  if(name==='nncodecLibopus_opus_decode'){decodeCount++;memory.fill(decodeCount,Number(args[3]),Number(args[3])+samples*4);return BigInt(samples);}
  if(name.includes('GetReleasedAudioOutBuffer'))return released.shift()||0n;
  if(name.includes('StopAudioOut')){playing=false;return 0n;}
  if(name.includes('FlushAudioOutBuffers')){assert(!playing,'flush only after stop');released.push(...active.splice(0));return 1n;}
  if(name.includes('StartAudioOut')){playing=true;return 0n;}
  if(name.includes('CloseAudioOut')){active.length=released.length=0;return 0n;}
  if(name.includes('SetAudioOutBufferInfo')){assert(!active.includes(args[0])&&!released.includes(args[0]),'driver must release a node before reuse');infos.set(args[0],{data:args[1],bytes:args[3]});return 0n;}
  if(name.includes('AppendAudioOutBuffer')){assert(playing);assert(!active.includes(args[1]));active.push(args[1]);const info=infos.get(args[1]);appended.push({bytes:info.bytes,first:memory[Number(info.data)]});return 1n;}
  return 0n;
 }
 const scope={malloc:alloc,free:p=>assert(owned.delete(p)),write32:(p,v)=>write(p,v,4),write16:(p,v)=>write(p,v,2),write64:(p,v)=>write(p,v,8),memcpy_addr:'memcpy',call_rop:(fn,to,from,n)=>{assert.equal(fn,'memcpy');memory.copy(memory,Number(to),Number(from),Number(from+n));return to;}};
 scope.window=scope;vm.createContext(scope);vm.runInContext(source,scope);
 const media=scope.MoonlightStreamMedia.create({invoke:sdk,toNative(){}},{_ml_png_release(){}});
 media.audioSetup(48000,2,1,1,240);
 return {media,owned,active,appended,calls,decodeCount:()=>decodeCount,frame:()=>media.audioFrame(0,5,new Uint8Array(5)),setSamples:n=>samples=n,release:()=>released.push(...active.splice(0))};
}
test('audio batches for frame-paced service and keeps only the newest waiting chunk at the limit',()=>{
 const e=audioEnvironment();e.frame();assert.equal(e.appended.length,0);assert.equal(e.media.stats().audioBufferedMsUpperBound,5);
 for(let i=0;i<11;i++)e.frame();assert.equal(e.active.length,2);assert.equal(e.media.stats().audioBufferedMsUpperBound,60);assert(e.appended.every(v=>v.bytes===3840));
 for(let i=0;i<3;i++)e.frame();assert.equal(e.media.stats().audioBufferedMsUpperBound,75);e.frame();
 const s=e.media.stats();assert.equal(s.audioBufferedMsUpperBound,60);assert.equal(s.audioCatchups,1);assert.equal(s.audioDropped,1);assert.equal(s.audioDiscardedMs,20);assert.equal(e.decodeCount(),16);
 assert.equal(e.calls.some(n=>n.includes('StopAudioOut')||n.includes('FlushAudioOutBuffers')),false);
 e.release();e.media.drainAudio();assert.equal(e.appended.at(-1).first,13);assert.equal(e.active.length,1);
 for(let i=0;i<4;i++)e.frame();assert.equal(e.media.stats().audioCatchups,1);assert.equal(e.active.length,2);
 e.media.close();assert.equal(e.owned.size,0);
});
test('large packets and sustained backpressure stay bounded and never overwrite active native PCM',()=>{
 const e=audioEnvironment();e.frame();e.setSamples(5760);e.frame();assert(e.appended.every(v=>v.bytes===3840));assert(e.media.stats().audioBufferedMsUpperBound<80);assert.equal(e.decodeCount(),2);e.media.close();assert.equal(e.owned.size,0);
 const blocked=audioEnvironment();for(let i=0;i<100;i++)blocked.frame();
 assert.equal(blocked.active.length,2);assert.equal(blocked.appended.length,2);assert.equal(blocked.decodeCount(),100);assert.equal(blocked.media.stats().audioBufferedMsUpperBound,60);
 blocked.release();blocked.media.drainAudio();assert.equal(blocked.appended.at(-1).first,97);assert.equal(blocked.media.stats().audioBufferedMsUpperBound,20);
 blocked.media.close();assert.equal(blocked.owned.size,0);
});
test('reclaimed capacity preserves pending audio before admitting a newer chunk',()=>{
 const e=audioEnvironment();for(let i=0;i<12;i++)e.frame();assert.equal(e.media.stats().audioDropped,0);
 e.release();for(let i=0;i<4;i++)e.frame();
 assert.deepEqual(e.appended.slice(-2).map(item=>item.first),[9,13]);assert.equal(e.media.stats().audioDropped,0);assert.equal(e.media.stats().audioBufferedMsUpperBound,40);
 e.media.close();assert.equal(e.owned.size,0);
});
