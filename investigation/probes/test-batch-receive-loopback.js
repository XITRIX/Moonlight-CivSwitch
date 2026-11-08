/* Private nonblocking loopback sockets; layout recovered from this SDK build. */
(async function(){
 var transport=window.MoonlightNative.create(),owned=[],fds=[];
 function alloc(n){var p=malloc(n);if(!p)throw Error('Probe allocation failed');owned.push(p);return p;}
 function call(name,args){return call_rop.apply(null,[transport.resolveNativeSymbol('_ZN2nn6socket'+name)].concat(args.map(BigInt)));}
 function signed(v){return Number(BigInt.asIntN(32,v));}
 var batchName='8RecvMMsgEiPNS0_7MMsgHdrEmNS0_7MsgFlagEPNS_8TimeSpanE';
 try{
  var count=8,stride=512,lengths=[1,12,15,64,511,512,100,33],address=alloc(16),addressLength=alloc(8),sendData=alloc(640);
  var headersBlock=alloc(56*count+32),vectorsBlock=alloc(16*count+32),dataBlock=alloc(stride*count+32),headers=headersBlock+16n,vectors=vectorsBlock+16n,data=dataBlock+16n;
  for(var block of [[headersBlock,56*count],[vectorsBlock,16*count],[dataBlock,stride*count]]){write64(block[0],0x1122334455667788n);write64(block[0]+8n,0x8877665544332211n);write64(block[0]+BigInt(block[1]+16),0x1122334455667788n);write64(block[0]+BigInt(block[1]+24),0x8877665544332211n);}
  write_buffer(address,new Uint8Array([16,2,0,0,127,0,0,1,0,0,0,0,0,0,0,0]));
  var receiver=signed(call('6SocketEiii',[2,2,0])),sender=signed(call('6SocketEiii',[2,2,0]));if(receiver<0||sender<0)throw Error('Socket creation failed');fds.push(receiver,sender);
  for(var fd of fds){var flags=signed(call('5FcntlEiiz',[fd,3,0]));if(flags<0||signed(call('5FcntlEiiz',[fd,4,flags|0x800]))<0)throw Error('Nonblocking setup failed');}
  if(signed(call('4BindEiPK8sockaddrj',[receiver,address,16]))<0)throw Error('Loopback bind failed');
  write32(addressLength,16n);if(signed(call('11GetSockNameEiP8sockaddrPj',[receiver,address,addressLength]))<0)throw Error('Loopback address failed');
  for(var i=0;i<count;i++){var p=headers+BigInt(i*56),v=vectors+BigInt(i*16);write64(p+16n,v);write32(p+24n,1n);write64(v,data+BigInt(i*stride));write64(v+8n,BigInt(stride));
   write_buffer(sendData,new Uint8Array(lengths[i]).fill(i+1));if(signed(call('6SendToEiPKvmiPK8sockaddrj',[sender,sendData,lengths[i],0x80,address,16]))!==lengths[i])throw Error('Loopback send failed');}
  await log('MOONLIGHT_BATCH_LOOPBACK_CALL_BEGIN');
  var begin=Date.now(),received=signed(call(batchName,[receiver,headers,count,0x80,0]));
  if(received!==count)throw Error('Expected eight queued datagrams, got '+received+' errno '+call('12GetLastErrnoEv',[]));
  for(var i=0;i<count;i++){var p=headers+BigInt(i*56);await log('MOONLIGHT_BATCH_MESSAGE_META: '+JSON.stringify({index:i,length:Number(read32(p+48n)),vectorLength:Number(read64(vectors+BigInt(i*16+8))),flags:Number(read32(p+44n))}));if(Number(read32(p+48n))!==lengths[i])throw Error('Message length mismatch');for(var j=0;j<lengths[i];j++)if(Number(read8(data+BigInt(i*stride+j)))!==i+1)throw Error('Datagram bytes/order mismatch');}
  for(var block of [[headersBlock,56*count],[vectorsBlock,16*count],[dataBlock,stride*count]])if(read64(block[0])!==0x1122334455667788n||read64(block[0]+8n)!==0x8877665544332211n||read64(block[0]+BigInt(block[1]+16))!==0x1122334455667788n||read64(block[0]+BigInt(block[1]+24))!==0x8877665544332211n)throw Error('Batch bounds canary changed');
  var emptyAt=Date.now(),empty=signed(call(batchName,[receiver,headers,count,0x80,0])),error=Number(call('12GetLastErrnoEv',[])),elapsed=Date.now()-emptyAt;
  if(empty!==-1||[11,35].indexOf(error)<0||elapsed>100)throw Error('Empty nonblocking receive failed');
  write_buffer(sendData,new Uint8Array(600).fill(85));if(signed(call('6SendToEiPKvmiPK8sockaddrj',[sender,sendData,600,0x80,address,16]))!==600)throw Error('Partial-batch send failed');
  var partialAt=Date.now(),partial=signed(call(batchName,[receiver,headers,count,0x80,0])),partialMs=Date.now()-partialAt,partialLength=Number(read32(headers+48n)),partialFlags=Number(read32(headers+44n));
  if(partial!==1||partialLength!==stride||partialMs>100)throw Error('Partial/truncated batch failed');
  for(var i=0;i<stride;i++)if(Number(read8(data+BigInt(i)))!==85)throw Error('Truncated datagram data failed');
  for(var i=0;i<lengths[1];i++)if(Number(read8(data+BigInt(stride+i)))!==2)throw Error('Truncated datagram crossed its slot');
  await log('MOONLIGHT_BATCH_LOOPBACK_RESULT: '+JSON.stringify({messages:received,lengths:lengths,orderedBytes:true,canaries:true,milliseconds:Date.now()-begin,emptyResult:empty,emptyErrno:error,emptyMilliseconds:elapsed,partialMessages:partial,partialLength:partialLength,partialFlags:partialFlags,partialMilliseconds:partialMs}));
 }finally{for(var fd of fds)call('5CloseEi',[fd]);for(var p of owned.reverse())free(p);}
})();
