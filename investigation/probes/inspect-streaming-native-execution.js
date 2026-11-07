/* Own-buffer copies, native Opus, a short-lived native thread, and RX permission. */
(async function(){
 var N=window.MoonlightProbeNative;
 async function out(name,value){await log("MOONLIGHT_STREAM_EXEC_"+name+": "+JSON.stringify(value));}
 function pause(ms){return new Promise(function(done){setTimeout(done,ms);});}
 function signed(v){return Number(BigInt.asIntN(32,v));}
 function result(v){return "0x"+Number(v&0x3fffffn).toString(16);}
 function backing(array){
  var object=addrof_compressed(array),external=read64_compressed(object+0x28n),base=read32_compressed(object+0x30n);
  if(base!==0n)throw Error("Only external typed-array backing stores are admitted");
  if(external<0x100000000n||external>0x7fffffffffn)throw Error("Unexpected external backing address");
  // Verify the candidate through existing reads before using it as a native destination.
  var probe=N.copyFrom(external,32);for(var i=0;i<32;i++)if(probe[i]!==array[i])throw Error("Backing bytes do not match the JavaScript array");
  return external;
 }
 var p=malloc(1048576),first=new Uint8Array(1048576),second=new Uint8Array(1048576);
 try{
  for(var i=0;i<first.length;i++)first[i]=(i*17+91)&255;second.fill(0x55);
  var firstPointer=backing(first),secondPointer=backing(second);
  await out("COPY_POINTERS_VERIFIED",true);
  // Start with 32 bytes and verify both directions before copying the full buffer.
  call_rop(memcpy_addr,p,firstPointer,32n);
  var small=N.copyFrom(p,32);for(var i=0;i<32;i++)if(small[i]!==first[i])throw Error("Small native write failed");
  call_rop(memcpy_addr,secondPointer,p,32n);for(var i=0;i<32;i++)if(second[i]!==first[i])throw Error("Small native read failed");
  var start=Date.now();call_rop(memcpy_addr,p,firstPointer,1048576n);var writeMs=Date.now()-start;
  start=Date.now();call_rop(memcpy_addr,secondPointer,p,1048576n);var readMs=Date.now()-start;
  var mismatch=-1;for(var i=0;i<first.length;i++)if(first[i]!==second[i]){mismatch=i;break;}
  await out("BULK_COPY",{bytes:first.length,writeMs:writeMs,readMs:readMs,mismatch:mismatch});
 }catch(error){await out("BULK_ERROR",String(error.message||error));}
 finally{free(p);}
 var decoder,pcm,packetBuffer;
 try{
  var size=signed(N.call("nncodecLibopus_opus_decoder_get_size",[2]));if(size<1||size>1048576)throw Error("Unexpected Opus state size "+size);
  decoder=malloc(size);pcm=malloc(960*2*2);packetBuffer=malloc(4096);
  var initialized=signed(N.call("nncodecLibopus_opus_decoder_init",[decoder,48000,2]));if(initialized)throw Error("Opus init failed "+initialized);
  var decoded=[];
  for(var hex of window.__moonlightOpusPackets){
   var packet=new Uint8Array(hex.length/2);for(var i=0;i<packet.length;i++)packet[i]=parseInt(hex.slice(i*2,i*2+2),16);write_buffer(packetBuffer,packet);
   var start=Date.now(),samples=signed(N.call("nncodecLibopus_opus_decode",[decoder,packetBuffer,packet.length,pcm,960,0])),elapsed=Date.now()-start;
   if(samples<0)throw Error("Opus decode failed "+samples);
   var bytes=N.copyFrom(pcm,samples*2*2),view=new DataView(bytes.buffer),peak=0;
   for(var i=0;i<bytes.length;i+=2)peak=Math.max(peak,Math.abs(view.getInt16(i,true)));
   decoded.push({packetBytes:packet.length,samplesPerChannel:samples,peak:peak,decodeMs:elapsed});
  }
  await out("OPUS_DECODE",{stateBytes:size,initialized:initialized,packets:decoded});
 }catch(error){await out("OPUS_ERROR",String(error.message||error));}
 finally{for(var pointer of [decoder,pcm,packetBuffer])if(pointer)free(pointer);delete window.__moonlightOpusPackets;}
 var allocation=malloc(0x6000),rx=false,page=(allocation+4095n)&~4095n;
 try{
  // Exact raw syscall wrapper was inspected in the shipped SDK. The public
  // SetMemoryPermission wrapper aborts on unsupported permissions, so do not use it.
  var setter=sdk_base+0x168aecn;
  if(read32(setter)!==0xd4000041n||read32(setter+4n)!==0xd65f03c0n)throw Error("SetMemoryPermission wrapper does not match inspected code");
  write32(page,0x52800540n);write32(page+4n,0xd65f03c0n); // mov w0,42; ret
  N.call("_ZN2nn2os14FlushDataCacheEPKvm",[page,4096]);
  var changed=call_rop(setter,page,4096n,5n);rx=(changed&0x3fffffn)===0n;
  await out("OWN_PAGE_RX",{result:result(changed),allowed:rx});
  if(rx)await out("NATIVE_CODE_RESULT",Number(call_rop(page)));
 }catch(error){await out("OWN_PAGE_RX_ERROR",String(error.message||error));}
 finally{
  if(rx){var restored=call_rop(sdk_base+0x168aecn,page,4096n,3n);await out("OWN_PAGE_RW_RESTORED",result(restored));if((restored&0x3fffffn)===0n)free(allocation);}
  else free(allocation);
 }
 delete window.MoonlightProbeNative;await out("END",true);
})();
