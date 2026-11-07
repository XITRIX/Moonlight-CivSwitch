/* Exercise the native HTTP receive loop with a memory/socket ABI stub. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function transport(wire,{stall=false,signal}={}){
 const memory=Buffer.alloc(131072),allocated=new Set(),names=new Map();
 let cursor=4096,nextExport=0x200000n,offset=0,closed=0,request='';
 const exports=new Proxy({},{get:(_,name)=>{for(const [address,value]of names)if(value===name)return address;const address=nextExport++;names.set(address,name);return address;}});
 const context={window:{__moonlightSdkExports:exports,MoonlightStore:{create:()=>({})}},sdk_base:0x100000n,setTimeout,
  malloc:size=>{const p=BigInt(cursor);cursor+=Number(size)+8;allocated.add(p);return p;},free:p=>assert(allocated.delete(p)),
  write_buffer:(p,bytes)=>Buffer.from(bytes).copy(memory,Number(p)),read_buffer:(p,size)=>new Uint8Array(memory.subarray(Number(p),Number(p)+size)),
  text_encode:text=>new Uint8Array(Buffer.from(text)),
  read32:p=>p===0x100004n?0x100n:p===0x100100n?0x30444f4dn:p===0x100104n?0x100n:1n,
  read64:p=>{const n=Number(p-0x100200n);if(n>=0&&n<48)return n%16===0?BigInt([4,5,6][n/16]):0x101000n;return 0n;},
  call_rop:(address,...args)=>{
   const name=names.get(address);
   if(name.includes('socket6Socket'))return 5n;
   if(name.includes('socket5Fcntl')||name.includes('socket7Connect'))return 0n;
   if(name.includes('socket5Close')){closed++;return 0n;}
   if(name.includes('socket4Send')){request+=memory.subarray(Number(args[1]),Number(args[1]+args[2])).toString();return args[2];}
   if(name.includes('socket4Recv')){
    if(stall)return -1n;
    const count=Math.min(Number(args[2]),997,wire.length-offset);
    wire.copy(memory,Number(args[1]),offset,offset+count);offset+=count;return BigInt(count);
   }
   if(name.includes('GetLastErrno'))return 11n;
   throw Error('Unexpected native call '+name);
  }
 };
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/src/platform/native-network.js'),'utf8'),context);
 return {run:options=>context.window.MoonlightNative.create().requestHttp({host:'192.168.1.4',port:47989,path:'/test',signal,...options}),
  check:()=>{assert.equal(allocated.size,0);assert.equal(closed,1);},request:()=>request};
}
const response=(body,headers='Content-Length: '+body.length)=>Buffer.concat([Buffer.from('HTTP/1.1 200 OK\r\n'+headers+'\r\n\r\n'),body]);
(async()=>{
 let t=transport(response(Buffer.from('Grüße 🎮')));assert.equal(await t.run(),'Grüße 🎮');t.check();assert.match(t.request(),/Accept: application\/xml/);
 const bytes=Buffer.alloc(170000);for(let i=0;i<bytes.length;i++)bytes[i]=i%256;
 t=transport(response(bytes));const result=await t.run({responseType:'binary',maxResponseBytes:2097152});
 assert.equal(Buffer.compare(Buffer.from(result,'binary'),bytes),0);t.check();assert.match(t.request(),/Accept: image\/png/);
 for(const wire of [response(bytes),response(Buffer.from('short'),'Content-Length: 999'),response(Buffer.from('x'),'Transfer-Encoding: chunked'),response(Buffer.from('x'),'Content-Length: 1\r\nContent-Length: 1'),response(Buffer.from('x'),'X-Large: '+'x'.repeat(17000)),response(bytes,'X-No-Length: true')]){
  t=transport(wire);await assert.rejects(t.run(),/length|size|large|Incomplete|Chunked/);t.check();
 }
 t=transport(response(Buffer.from([0,128,255]),'X-No-Length: true'));assert.equal(await t.run({responseType:'binary'}),'\0\x80\xff');t.check();
 const signal={aborted:false};t=transport(Buffer.alloc(0),{stall:true,signal});const pending=t.run();signal.aborted=true;await assert.rejects(pending,/canceled/);t.check();
 console.log('Native transport tests passed: UTF-8/XML, binary bytes above 128 KiB, bounded headers/body, incomplete/chunked/duplicate lengths, cancellation, socket/allocation cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
