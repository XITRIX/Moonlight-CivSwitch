/* Exercise compiled C ownership and fiber suspension with deterministic batches. */
const assert=require('node:assert/strict');
const make=require('./dist/moonlight-stream.js');
(async()=>{
 for(const scenario of ['packets','error','unsupported','bad-count']){
  let core,calls=0,sequence=0;
  core=await make({moonlightPlatform:{receiveVideoBatch(fd,pointers,lengths,metadata,count,capacity,heap){
   assert.equal(fd,7);assert.equal(count,32);assert.equal(capacity,1408);calls++;
   if(calls===1)return -11; // Suspend and resume before touching borrowed buffers.
   if(scenario==='error')return -104;
   if(scenario==='unsupported')return -38;
   if(scenario==='bad-count')return 33;
   const v=new DataView(heap.buffer);
   for(let i=0;i<count;i++){
    const p=v.getUint32(pointers+i*4,true),n=12+sequence%100;
    for(let j=0;j<n;j++)heap[p+j]=(sequence*7+j)&255;
    v.setInt32(lengths+i*4,n,true);sequence++;
   }
   return count;
  }}});
  assert.equal(core._ml_packet_pool_configure(1),0);
  assert.equal(core._ml_video_batch_test_start(scenario==='packets'?65:-1),0);
  const deadline=Date.now()+3000;
  while(core._ml_runtime_tasks()&&Date.now()<deadline){core._ml_runtime_pump(2);await new Promise(r=>setTimeout(r,2));}
  assert.equal(core._ml_runtime_tasks(),0,scenario+' must finish');
  assert.equal(core._ml_video_batch_test_result(),1,scenario+' must preserve ownership');
  const stats=core._ml_packet_pool_metrics();assert.equal(core.HEAPF64[(stats>>>3)+3],0,'no borrowed packet remains after '+scenario);
  assert.equal(core._ml_video_batch_configure(0),0);assert.equal(core._ml_packet_pool_configure(0),0);
 }
 console.log('Direct video batch ownership, partial consumption, suspension, error and fallback checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
