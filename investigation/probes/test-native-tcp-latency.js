/* Read-only TCP handshake timing, using native poll instead of JS timers. */
(async function(){
 var transport=window.MoonlightNative.create(),address=malloc(64),pollfd=malloc(64),value=malloc(64),length=malloc(64),times=[],errors=[];
 function call(name,args){return call_rop.apply(null,[transport.resolveNativeSymbol('_ZN2nn6socket'+name)].concat(args.map(BigInt)));}
 function signed(value){return Number(BigInt.asIntN(32,value));}
 function now(){return window.performance&&window.performance.now?window.performance.now():Date.now();}
 try{
  write_buffer(address,new Uint8Array([16,2,47989>>8,47989&255,192,168,1,4,0,0,0,0,0,0,0,0]));
  for(var i=0;i<20;i++){
   var fd=-1;
   try{
    fd=signed(call('6SocketEiii',[2,1,0]));if(fd<0)throw Error('Socket failed');
    var flags=signed(call('5FcntlEiiz',[fd,3,0]));if(flags<0||signed(call('5FcntlEiiz',[fd,4,flags|0x800]))<0)throw Error('Nonblocking failed');
    write32(pollfd,BigInt(fd));write16(pollfd+4n,4n);write16(pollfd+6n,0n);
    var begin=now(),connected=signed(call('7ConnectEiPK8sockaddrj',[fd,address,16]));
    if(connected<0){
     var error=Number(call('12GetLastErrnoEv',[]));if([115,114,36,37,11,35].indexOf(error)<0)throw Error('Connect errno '+error);
     var ready=signed(call('4PollEP6pollfdmi',[pollfd,1,250]));if(ready<1)throw Error(ready===0?'Connect timeout':'Poll failed');
    }
    write32(length,4n);
    if(signed(call('10GetSockOptEiiiPvPj',[fd,0xffff,0x1007,value,length]))<0)throw Error('SO_ERROR query failed');
    if(read32(value)!==0n)throw Error('SO_ERROR '+read32(value));
    times.push(now()-begin);
   }catch(error){errors.push(error.message);}
   finally{if(fd>=0)call('5CloseEi',[fd]);}
   await new Promise(function(done){setTimeout(done,100);});
  }
  times.sort(function(a,b){return a-b;});
  await log('MOONLIGHT_NATIVE_TCP_RTT: '+JSON.stringify({count:times.length,min:times[0],median:times[Math.floor(times.length/2)],p95:times[Math.floor((times.length-1)*.95)],max:times[times.length-1],mean:times.length?times.reduce(function(a,b){return a+b;},0)/times.length:null,errors:errors}));
 }finally{[length,value,pollfd,address].forEach(free);}
})();
