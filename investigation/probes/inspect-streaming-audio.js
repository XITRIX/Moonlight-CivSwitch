/* Native audio service and a short PCM output test, with full cleanup. */
(async function(){
 var N=window.MoonlightProbeNative;
 async function out(name,value){await log("MOONLIGHT_STREAM_AUDIO_"+name+": "+JSON.stringify(value));}
 function pause(ms){return new Promise(function(done){setTimeout(done,ms);});}
 function code(v){return Number(v&0x3fffffn);}
 function result(v){return "0x"+code(v).toString(16);}
 var closeHandle=sdk_base+0x168be4n;
 if(read32(closeHandle)!==0xd40002c1n)throw Error("CloseHandle does not match inspected syscall");
 var permitted={};
 for(var name of ["audout:u","audren:u"]){
  var handle=malloc(8),text=alloc_string(name);
  try{
   var rc=N.call("_ZN2nn2sm16GetServiceHandleEPNS_3svc6HandleEPKcm",[handle,text,name.length]);
   permitted[name]=code(rc)===0;
   await out("SERVICE",{name:name,result:result(rc),opened:permitted[name]});
   if(permitted[name])await out("SERVICE_CLOSED",{name:name,result:result(call_rop(closeHandle,read32(handle)))});
  }finally{free(handle);free(text);}
 }
 var maximum=Number(read32(N.resolve("_ZN2nn5audio18g_AudioOutCountMaxE")));
 await out("OUTPUT_LIMIT",maximum);
 if(!permitted["audout:u"]||maximum<1){await out("OUTPUT_SKIPPED","AudioOut service denied or library output limit is zero");delete window.MoonlightProbeNative;return;}
 var output=malloc(1024),parameter=malloc(64),buffer=malloc(64),allocation=malloc(0x9000),opened=false,started=false;
 try{
  N.call("_ZN2nn5audio27InitializeAudioOutParameterEPNS0_17AudioOutParameterE",[parameter]);write32(parameter,48000n);write16(parameter+4n,2n);
  await out("OPEN_ATTEMPT",{sampleRate:48000,channels:2});
  var rc=N.call("_ZN2nn5audio19OpenDefaultAudioOutEPNS0_8AudioOutERKNS0_17AudioOutParameterE",[output,parameter]);opened=code(rc)===0;
  await out("OPEN",{result:result(rc),opened:opened});if(!opened)return;
  var rate=Number(N.call("_ZN2nn5audio21GetAudioOutSampleRateEPKNS0_8AudioOutE",[output])),channels=Number(N.call("_ZN2nn5audio23GetAudioOutChannelCountEPKNS0_8AudioOutE",[output]));
  var format=Number(N.call("_ZN2nn5audio23GetAudioOutSampleFormatEPKNS0_8AudioOutE",[output]));
  await out("FORMAT",{sampleRate:rate,channels:channels,format:format});
  if(rate!==48000||channels!==2||format!==2)throw Error("Unexpected PCM output format");
  var memory=(allocation+4095n)&~4095n,frames=4800,bytes=frames*channels*2;
  for(var i=0;i<frames;i++){var sample=Math.round(Math.sin(i*2*Math.PI*440/48000)*700);for(var c=0;c<channels;c++)write16(memory+BigInt((i*channels+c)*2),BigInt(sample&65535));}
  N.call("_ZN2nn2os14FlushDataCacheEPKvm",[memory,0x5000]);
  write64(buffer,0n);write64(buffer+0x20n,0n); // next and data offset are not set by the SDK helper.
  N.call("_ZN2nn5audio21SetAudioOutBufferInfoEPNS0_14AudioOutBufferEPvmm",[buffer,memory,0x5000,bytes]);
  var appended=!!N.call("_ZN2nn5audio20AppendAudioOutBufferEPNS0_8AudioOutEPNS0_14AudioOutBufferE",[output,buffer]);await out("BUFFER_APPENDED",appended);if(!appended)throw Error("PCM buffer not accepted");
  N.call("_ZN2nn5audio13StartAudioOutEPNS0_8AudioOutE",[output]);started=true;
  await pause(250);
  var played=Number(N.call("_ZN2nn5audio28GetAudioOutPlayedSampleCountEPKNS0_8AudioOutE",[output])),released=N.call("_ZN2nn5audio25GetReleasedAudioOutBufferEPNS0_8AudioOutE",[output]);
  await out("PCM_OUTPUT",{playedSamples:played,releasedOwnBuffer:released===buffer,state:Number(N.call("_ZN2nn5audio16GetAudioOutStateEPKNS0_8AudioOutE",[output]))});
 }catch(error){await out("ERROR",String(error.message||error));}
 finally{
  if(started)N.call("_ZN2nn5audio12StopAudioOutEPNS0_8AudioOutE",[output]);
  if(opened){N.call("_ZN2nn5audio20FlushAudioOutBuffersEPNS0_8AudioOutE",[output]);N.call("_ZN2nn5audio13CloseAudioOutEPNS0_8AudioOutE",[output]);}
  for(var pointer of [output,parameter,buffer,allocation])free(pointer);
  delete window.MoonlightProbeNative;await out("END",true);
 }
})();
