/* Decode one tiny generated H.264 frame using a private native decoder. */
(async function(){
 var N=window.MoonlightProbeNative,allocations=[],objects=[],decoder,started=false,outputIndex=-1;
 function alloc(size){var p=malloc(size);allocations.push(p);return p;}
 function call(name,args){return N.movieCall(name,args);}
 function number(v){return Number(BigInt.asIntN(32,v));}
 function bytes(hex){var b=new Uint8Array(hex.length/2);for(var i=0;i<b.length;i++)b[i]=parseInt(hex.slice(i*2,i*2+2),16);return b;}
 async function out(name,value){await log("MOONLIGHT_STREAM_RGBA_"+name+": "+JSON.stringify(value));}
 async function status(name,value){var code=number(value),p=call("_ZN5movie14StatusToStringENS_6StatusE",[code]),label="";if(p)for(var i=0;i<160;i++){var b=Number(read8(p+BigInt(i)));if(!b)break;label+=String.fromCharCode(b);}await out(name,{code:code,label:label});return code;}
 function object(type){var p=alloc(128);call("_ZN5movie"+type+"C1Ev",[p]);objects.push({type:type,p:p});return p;}
 function field(metadata,name){var key=alloc_string(name),value=alloc(8);try{return {found:!!call("_ZNK5movie9MediaData9FindInt32EPKcPi",[metadata,key,value]),value:number(read32(value))};}finally{free(key);}}
 try{
  var fixture=window.__moonlightH264,sps=bytes(fixture.sps),pps=bytes(fixture.pps),packet=bytes(fixture.annexb),spsPtr=alloc(sps.length),ppsPtr=alloc(pps.length);
  write_buffer(spsPtr,sps);write_buffer(ppsPtr,pps);
  var config=object("9MediaData"),format=object("9MediaData"),input=object("6Buffer"),output=object("6Buffer");
  if(!call("_ZN5movie34CreateH264DecoderConfigurationDataEPKhmS1_mPNS_9MediaDataE",[spsPtr,sps.length,ppsPtr,pps.length,config]))throw Error("H.264 configuration failed");
  decoder=alloc(1024);await out("CONSTRUCTING",true);
  call("_ZN5movie7DecoderC1ENS_11DecoderTypeENS_19DecoderOutputFormatENS_11DecoderModeEi",[decoder,1,3,1,number(call("_ZN5movie17GetThreadPriorityEv",[]))]);
  objects.push({type:"7Decoder",p:decoder});if(!read64(decoder+8n))throw Error("Decoder implementation absent");
  await out("CONFIGURING",true);
  if(await status("CONFIGURED",call("_ZN5movie7Decoder9ConfigureEPNS_9MediaDataE",[decoder,config])))return;
  await out("STARTING",true);
  if(await status("STARTED",call("_ZN5movie7Decoder5StartEv",[decoder])))return;started=true;
  var index=alloc(8),count=alloc(8),pts=alloc(8),flags=alloc(8),deadline=Date.now()+2000,rc;
  do{rc=number(call("_ZN5movie7Decoder23AcquireInputBufferIndexEPiS1_",[decoder,index,count]));if(!rc&&number(read32(index))>=0)break;await new Promise(function(resolve){setTimeout(resolve,10);});}while(Date.now()<deadline);
  if(await status("INPUT_ACQUIRED",BigInt(rc)))return;
  var inputIndex=number(read32(index));if(inputIndex<0)throw Error("No input index");
  if(await status("INPUT_BUFFER",call("_ZN5movie7Decoder14GetInputBufferEiPNS_6BufferE",[decoder,inputIndex,input])))return;
  var capacity=Number(call("_ZNK5movie6Buffer8CapacityEv",[input])),data=call("_ZNK5movie6Buffer4DataEv",[input]);
  if(!data||capacity<packet.length||capacity>1048576)throw Error("Invalid input buffer bounds");
  write_buffer(data,packet);await out("SUBMITTING",{bytes:packet.length,capacity:capacity,framing:"Annex B"});
  if(await status("SUBMITTED",call("_ZN5movie7Decoder24SendInputBufferForDecodeEiiilj",[decoder,inputIndex,0,packet.length,0,0])))return;
  // Drain the one-frame stream. Hardware decoders may retain a final picture.
  deadline=Date.now()+1000;
  do{rc=number(call("_ZN5movie7Decoder23AcquireInputBufferIndexEPiS1_",[decoder,index,count]));if(!rc&&number(read32(index))>=0)break;await new Promise(function(resolve){setTimeout(resolve,10);});}while(Date.now()<deadline);
  if(!rc&&number(read32(index))>=0)await status("DRAIN_SUBMITTED",call("_ZN5movie7Decoder24SendInputBufferForDecodeEiiilj",[decoder,number(read32(index)),0,0,200000,4]));
  deadline=Date.now()+3000;
  do{rc=number(call("_ZN5movie7Decoder24AcquireOutputBufferIndexEPiPlPjS1_",[decoder,index,pts,flags,count]));if(!rc&&number(read32(index))>=0){outputIndex=number(read32(index));break;}await new Promise(function(resolve){setTimeout(resolve,10);});}while(Date.now()<deadline);
  if(await status("OUTPUT_ACQUIRED",BigInt(rc))) {await status("LAST_ERROR",call("_ZN5movie7Decoder12GetLastErrorEv",[decoder]));return;}
  if(outputIndex<0)throw Error("No output frame");
  await status("OUTPUT_FORMAT",call("_ZN5movie7Decoder15GetOutputFormatEPNS_9MediaDataE",[decoder,format]));
  var fields={};for(var name of ["width","height","color-format","nv12-y-stride","nv12-y-offset","nv12-uv-stride","nv12-uv-offset","slice-height"])fields[name]=field(format,name);
  await out("FORMAT",fields);
  var size=alloc(8),mode=alloc(8);
  if(await status("OUTPUT_SIZE",call("_ZN5movie7Decoder19GetOutputBufferSizeEPiS1_",[decoder,size,mode])))return;
  var length=number(read32(size));if(length<1||length>1048576)throw Error("Output size outside probe bound: "+length);
  var storage=alloc(length+4096),aligned=(storage+4095n)&~4095n;
  call("_ZN5movie6Buffer18SetDataAndCapacityEPvm",[output,aligned,length]);
  if(await status("OUTPUT_BUFFER",call("_ZN5movie7Decoder15GetOutputBufferEiPNS_6BufferE",[decoder,outputIndex,output])))return;
  var pointer=call("_ZNK5movie6Buffer4DataEv",[output]),used=Number(call("_ZNK5movie6Buffer4SizeEv",[output]));
  if(!pointer||used<1||used>length)throw Error("Invalid decoded output bounds");
  var raw=N.copyFrom(pointer,used),hist={},samples={};for(var b of raw)hist[b]=(hist[b]||0)+1;
  for(var offset of [0,64,4096,4097,6142,6143])if(offset<raw.length)samples[offset]=raw[offset];
  await out("OUTPUT_PIXELS",{bytes:used,allocation:length,alignmentOrMode:number(read32(mode)),pts:read64(pts).toString(),flags:Number(read32(flags)),histogram:hist,samples:samples,firstPixels:Array.from(raw.subarray(0,32)),expectedRgbaBytes:64*64*4});
  if(window.MoonlightProbePreview&&!(Number(read32(flags))&4))await out("UI_PREVIEW",await window.MoonlightProbePreview(raw,64,64,fields["nv12-y-stride"].value,fields["nv12-uv-stride"].value,fields["nv12-uv-offset"].value));
 }catch(error){await out("ERROR",String(error.message||error));}
 finally{
  if(outputIndex>=0)await status("OUTPUT_RELEASED",call("_ZN5movie7Decoder24ReleaseOutputBufferIndexEi",[decoder,outputIndex]));
  if(started)await status("STOPPED",call("_ZN5movie7Decoder4StopEv",[decoder]));
  for(var entry of objects.reverse())call("_ZN5movie"+entry.type+"D1Ev",[entry.p]);
  for(var p of allocations.reverse())free(p);
  delete window.__moonlightH264;delete window.MoonlightProbePreview;delete window.MoonlightProbeNative;await out("END",true);
 }
})();
