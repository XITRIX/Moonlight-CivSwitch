/* Exercise borrowed core backing memory through the real native socket adapter. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function environment(){
 const views=[],native=Buffer.alloc(65536),owned=new Set(),calls=[],sent=[];let cursor=0x1000,blocked=false,memcopies=0;
 const heap=new Uint8Array(1024);views.push(heap);
 function range(p,n){for(let i=0;i<views.length;i++){const base=0x200000000n+BigInt(i)*0x100000000n;if(p>=base&&p+BigInt(n)<=base+BigInt(views[i].length))return views[i].subarray(Number(p-base),Number(p-base)+n);}assert(p>=0n&&p+BigInt(n)<=BigInt(native.length),'native range');return native.subarray(Number(p),Number(p)+n);}
 function write(p,v,n=8){const b=range(p,n);for(let i=0;i<n;i++)b[i]=Number((v>>BigInt(i*8))&255n);}
 function read(p,n=8){const b=range(p,n);let v=0n;for(let i=n-1;i>=0;i--)v=(v<<8n)|BigInt(b[i]);return v;}
 const payload=Uint8Array.from({length:30},(_,i)=>(i*27)&255);
 const scope={window:{},malloc:n=>{assert(n<2097152,'no packet scratch allocation');const p=BigInt(cursor);cursor+=n+8;owned.add(p);return p;},free:p=>assert(owned.delete(p)),memcpy_addr:'memcpy',
  read64:p=>read(p),read8:p=>read(p,1),write32:(p,v)=>write(p,v,4),write_buffer:(p,b)=>range(p,b.length).set(b),
  addrof_compressed:view=>{let i=views.findIndex(v=>v.buffer===view.buffer);assert(i>=0);return BigInt(0x100+i*0x100);},
  read64_compressed:p=>0x200000000n+((p-0x128n)/0x100n)*0x100000000n,read32_compressed:()=>0n,
  call_rop:(name,...args)=>{
   calls.push([name,...args]);
   if(name==='memcpy'){memcopies++;range(args[0],Number(args[2])).set(range(args[1],Number(args[2])));return args[0];}
   if(name.includes('socket6Socket'))return 7n;
   if(name.includes('Fcntl')||name.includes('Close'))return 0n;
   if(name.includes('GetLastErrno'))return 11n;
   if(name.includes('Recv')){
    if(blocked)return -1n;
    const length=Math.min(Number(args[2]),payload.length);range(args[1],length).set(payload.subarray(0,length));
    if(name.includes('RecvFrom')){range(args[4],16).set([16,2,0x12,0x34,192,168,1,4,0,0,0,0,0,0,0,0]);write(args[5],16n,4);}
    return BigInt(length);
   }
   if(name.includes('Send')){sent.push(Array.from(range(args[1],Number(args[2]))));return args[2];}
   throw Error('Unexpected call '+name);
  }};
 vm.createContext(scope);vm.runInContext(fs.readFileSync('app/src/streaming/native-io.js','utf8'),scope);
 const io=scope.window.MoonlightStreamIO.create({resolveNativeSymbol:n=>n});
 return {io,heap,payload,calls,sent,owned,views,memcopies:()=>memcopies,setBlocked:b=>blocked=b,setTime:time=>{scope.window.performance={now:()=>time};}};
}
test('TCP/UDP receive and send borrow core memory without intermediate payload copies',()=>{
 const e=environment();e.io.io(1,[2,2,0,0,0,0],e.heap);
 assert.equal(e.io.io(5,[7,128,50,0,0,0],e.heap),30);assert.deepEqual(e.heap.slice(128,158),e.payload);
 new DataView(e.heap.buffer).setUint32(80,16,true);
 assert.equal(e.io.io(5,[7,256,50,0,64,80],e.heap),30);assert.deepEqual(Array.from(e.heap.slice(64,72)),[2,0,0x12,0x34,192,168,1,4]);
 assert.equal(e.io.io(4,[7,256,30,0,0,0],e.heap),30);
 assert.equal(e.io.io(4,[7,256,30,0,64,16],e.heap),30);assert.deepEqual(e.sent,[Array.from(e.payload),Array.from(e.payload)]);
 assert.equal(e.memcopies(),0);assert.equal(e.io.stats.directReceivedBytes,60);assert.equal(e.io.stats.directSentBytes,60);
 e.setBlocked(true);const before=e.heap.slice();assert.equal(e.io.io(5,[7,256,50,0,0,0],e.heap),-11);assert.deepEqual(e.heap,before);assert.equal(e.io.stats.receiveWouldBlock,1);
 e.io.close();assert.equal(e.owned.size,0);
});
test('heap replacement revalidates the pointer, and invalid ranges are rejected before receiving',()=>{
 const e=environment();e.io.io(5,[7,128,30,0,0,0],e.heap);
 const larger=new Uint8Array(2048);e.views.push(larger);e.io.io(5,[7,1024,30,0,0,0],larger);assert.deepEqual(larger.slice(1024,1054),e.payload);
 const count=()=>e.calls.filter(c=>c[0].includes('Recv')).length,previous=count();
 assert.throws(()=>e.io.io(5,[7,1020,30,0,0,0],e.heap),/range/);
 assert.throws(()=>e.io.io(5,[7,128,30,0,1020,1022],e.heap),/range/);
 assert.throws(()=>e.io.io(5,[7,128,30,0,0,0],e.heap.subarray(1)),/complete/);
 assert.throws(()=>e.io.io(5,[7,128,30,0,0,0],e.heap.subarray(0,512)),/complete/);
 assert.equal(count(),previous);e.io.close();assert.equal(e.owned.size,0);
});
test('local cancellation rejects network work immediately but leaves ownership intact until close',()=>{
 const e=environment();e.io.io(1,[2,2,0,0,0,0],e.heap);const before=e.calls.length;
 e.io.interrupt();assert.equal(e.io.isInterrupted(),true);
 for(const op of [3,4,5,11])assert.equal(e.io.io(op,[7,128,30,0,0,0],e.heap),-104);
 assert.equal(e.calls.length,before,'cancellation never waits in a native socket call');assert(e.owned.size>0,'live C tasks may still own borrowed buffers');
 assert.equal(e.io.io(10,[7,0,0,0,0,0],e.heap),0,'C teardown can still close its descriptors');
 e.io.close();assert.equal(e.owned.size,0);
});
test('shutdown grace is bounded and repeated cancellation cannot extend it',()=>{
 const e=environment();e.setTime(1000);e.io.interrupt(100);assert.equal(e.io.isInterrupted(),false);
 e.setTime(1050);e.io.interrupt(100);e.setTime(1100);
 assert.equal(e.io.isInterrupted(),true);e.io.close();assert.equal(e.owned.size,0);
});
