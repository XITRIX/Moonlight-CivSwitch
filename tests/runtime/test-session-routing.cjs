/* Exercise actual C connection routing without opening host or console sockets. */
const assert=require('node:assert/strict');
const {randomFillSync}=require('node:crypto');
const make=require('../../dist/runtime/moonlight-stream.js');
(async()=>{
 for(const host of ['192.168.1.4','203.0.113.10'])for(const scheme of ['rtsp','rtspenc']){
  const connections=[],logs=[],sends=[];let nextFd=7;
  const core=await make({moonlightPlatform:{randomFill:randomFillSync,log:text=>logs.push(text),
   io(op,args,heap){
    const [a,b,c,d,e]=args,v=new DataView(heap.buffer);
    switch(op){
     case 1:return nextFd++; // socket
     case 3: // connect: read the sockaddr passed by compiled upstream code.
      connections.push({host:Array.from(heap.subarray(b+4,b+8)).join('.'),port:v.getUint16(b+2,false)});return 0;
     case 6: // getsockname: the client is behind its own LAN router.
      heap.fill(0,b,b+16);v.setUint16(b,2,true);v.setUint16(b+2,50000,false);
      heap.set([192,168,2,10],b+4);v.setUint32(c,16,true);return 0;
     case 7:case 9:case 10:return 0; // setsockopt, shutdown, close
     case 8:v.setInt32(d,0,true);v.setUint32(e,4,true);return 0; // SO_ERROR
     case 11: // poll: signal the requested events.
      for(let i=0;i<b;i++)v.setInt16(a+i*8+6,v.getInt16(a+i*8+4,true),true);return b;
     case 4:sends.push(c);return c; // send: plain or encrypted RTSP request.
     case 5:return 0; // EOF stops the handshake after the first RTSP request.
     default:throw Error('Unexpected socket operation '+op);
    }
   }}});
  const pointers=[];
  function text(value){const data=Buffer.from(value+'\0'),p=core._malloc(data.length);core.HEAPU8.set(data,p);pointers.push(p);return p;}
  const key=core._malloc(16);pointers.push(key);core.HEAPU8.fill(0,key,key+16);
  assert.equal(core._ml_session_start(text(host),text('7.1.431.-1'),text(scheme+'://192.168.1.4:49010/session'),key,1,1280,720,30,20000,2032385),0);
  const deadline=Date.now()+3000;
  while(core._ml_runtime_tasks()&&Date.now()<deadline){core._ml_runtime_pump(2);await new Promise(r=>setTimeout(r,1));}
  assert.equal(core._ml_runtime_tasks(),0,'handshake completes within its test deadline');
  assert(sends.length>0,'reached actual RTSP request transmission');
  assert.equal(connections.length,2,'UDP route lookup and TCP RTSP connection');
  for(const destination of connections)assert.deepEqual(destination,{host,port:49010},'all sockets use the entered host and advertised RTSP port');
  assert.equal(logs.some(line=>line.includes('Packet size capped at 1024 bytes for remote IPv4 streaming')),host==='203.0.113.10','automatic Internet packet sizing');
  assert.equal(core._ml_session_state(),3,'mock EOF ends the incomplete RTSP handshake');
  for(const p of pointers)core._free(p);
 }
 console.log('Compiled session routing passed: LAN/WAN addresses, plain/encrypted RTSP with LAN resource URLs, advertised ports and remote packet sizing.');
})().catch(e=>{console.error(e);process.exitCode=1;});
