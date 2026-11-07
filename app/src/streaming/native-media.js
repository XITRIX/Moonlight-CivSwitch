/* Existing movie/Opus/AudioOut functions; all pointers refer to owned buffers. */
(function(global){
 "use strict";
 function create(io,core,options){
  options=options||{};var owned=[],objects=[],decoder=0n,started=false,configured=false,outputStorage=0n,outputLength=0,outputHeap=0,width=0,height=0,fields=null;
  var movie=null,audio=null,texture=null,gpu=false,frameInterval=0,lastPreview=0,videoSubmitted=0,videoDecoded=0,presented=0,conversionMs=0,maxConversionMs=0;
  function alloc(n){var p=malloc(n);if(!p)throw Error("Native media allocation failed");owned.push(p);return p;}
  function number(v){return Number(BigInt.asIntN(32,v));}
  function sdk(name,args){return io.invoke(name,args);}
  function findMovie(){
   if(movie)return;
   var info=alloc(64),page=alloc(8);
   if(read32(sdk_base+0x168b10n)!==0xd40000c1n)throw Error("Unsupported memory query ABI");
   function query(address){if(call_rop(sdk_base+0x168b0cn,info,page,address)&0x3fffffn)return null;return {base:read64(info),size:read64(info+8n),permissions:Number(read32(info+24n))};}
   function readable(address,length){var cursor=address,end=address+BigInt(length);for(var i=0;i<32&&cursor<end;i++){var q=query(cursor);if(!q||!(q.permissions&1)||q.base+q.size<=cursor)return false;cursor=q.base+q.size;}return cursor>=end;}
   var cursor=0n;
   for(var region=0;region<512&&cursor<0x8000000000n;region++){
    var q=query(cursor);if(!q||!q.size||q.base+q.size<=cursor)break;cursor=q.base+q.size;var base=q.base;
    if((q.permissions&5)!==5||base===main_base||base===sdk_base||!readable(base,8))continue;
    var offset=read32(base+4n);if(offset<1n||offset>0x10000000n)continue;
    var mod=base+offset;if(!readable(mod,8)||read32(mod)!==0x30444f4dn)continue;
    var dynamic=mod+BigInt.asIntN(32,read32(mod+4n)),tags={};
    for(var i=0;i<128;i++){var entry=dynamic+BigInt(i*16);if(!readable(entry,16))break;var tag=Number(read64(entry));if(!tag)break;tags[tag]=read64(entry+8n);}
    if(!tags[4]||!tags[5]||!tags[6])continue;for(var tag of [4,5,6])if(tags[tag]<base)tags[tag]+=base;
    var count=Number(read32(tags[4]+4n)),size=Number(tags[10]);
    if(count<1||count>10000||size<1||size>1048576||!readable(tags[6],count*24)||!readable(tags[5],size))continue;
    var symbols=io.copy(tags[6],count*24),strings=io.copy(tags[5],size),view=new DataView(symbols.buffer),exports={};
    for(var i=0;i<count;i++){var start=view.getUint32(i*24,true),name="";for(var j=start;j<strings.length&&j<start+4096&&strings[j];j++)name+=String.fromCharCode(strings[j]);var address=view.getBigUint64(i*24+8,true);if(address)exports[name]=base+address;}
    if(exports._ZN5movie7DecoderC1ENS_11DecoderTypeENS_19DecoderOutputFormatE){movie=exports;break;}
   }
   if(!movie)throw Error("Native movie module unavailable");
  }
  function call(name,args){if(!movie[name])throw Error("Missing native movie function "+name);return call_rop.apply(null,[movie[name]].concat((args||[]).map(BigInt)));}
  function ok(name,args){var result=number(call(name,args));if(result)throw Error("Native video error 0x"+result.toString(16));}
  function object(type){var p=alloc(128);call("_ZN5movie"+type+"C1Ev",[p]);objects.push({type:type,p:p});return p;}
  function integer(metadata,key){var k=alloc_string(key),v=alloc(8);try{if(!call("_ZNK5movie9MediaData9FindInt32EPKcPi",[metadata,k,v]))throw Error("Missing video format "+key);return number(read32(v));}finally{owned.pop();free(v);free(k);}}
  var config,input,output,format,index,available,pts,flags,size,alignment,spsNative,ppsNative;
  function videoSetup(videoFormat,w,h,fps){
   gpu=!!global.MoonlightNativeTexture&&options.renderer!=="png"&&options.renderer!=="native-texture";
   if(videoFormat!==1||w<64||h<64||w>(gpu?1280:640)||h>(gpu?720:360))throw Error("Unsupported H.264 renderer dimensions");
   findMovie();width=w;height=h;frameInterval=gpu?0:Math.max(1,Math.floor(1000/fps));
   // The decoder installs allocator callbacks. Construct it before MediaData or
   // owned Buffer allocations so creation and destruction use the same allocator.
   decoder=alloc(1024);call("_ZN5movie7DecoderC1ENS_11DecoderTypeENS_19DecoderOutputFormatENS_11DecoderModeEi",[decoder,1,gpu?3:4,gpu?2:1,number(call("_ZN5movie17GetThreadPriorityEv",[]))]);
   objects.push({type:"7Decoder",p:decoder});if(!read64(decoder+8n))throw Error("Native decoder initialization failed");
   config=object("9MediaData");format=object("9MediaData");input=object("6Buffer");output=object("6Buffer");
   index=alloc(8);available=alloc(8);pts=alloc(8);flags=alloc(8);size=alloc(8);alignment=alloc(8);spsNative=alloc(65536);ppsNative=alloc(65536);
   if(global.MoonlightNativeTexture&&options.renderer!=="png")texture=global.MoonlightNativeTexture.create(io,core,w,h,{gpu:gpu});
   if(gpu){var target=texture.target();call("_ZN5movie6Buffer18SetDataAndCapacityEPvm",[output,target.texture,8]);call("_ZN5movie6Buffer9SetNvnDevEPv",[output,target.device]);}
   if(options.onStatus)options.onStatus("Video decoder ready: "+w+"×"+h+" at "+fps+" fps");return 0;
  }
  function rawNal(heap,pointer,length){if(length>=4&&heap[pointer]===0&&heap[pointer+1]===0){if(heap[pointer+2]===1)return [pointer+3,length-3];if(heap[pointer+2]===0&&heap[pointer+3]===1)return [pointer+4,length-4];}return [pointer,length];}
  function videoFrame(pointer,length,kind,presentation,sps,spsLength,pps,ppsLength,heap){
   if(!decoder)return -1;
   if(!configured){
    if(!sps||!pps)return -1;var a=rawNal(heap,sps,spsLength),b=rawNal(heap,pps,ppsLength);if(a[1]<4||b[1]<1||a[1]>65536||b[1]>65536)return -1;
    io.toNative(heap,a[0],a[1],spsNative);io.toNative(heap,b[0],b[1],ppsNative);
    if(!call("_ZN5movie34CreateH264DecoderConfigurationDataEPKhmS1_mPNS_9MediaDataE",[spsNative,a[1],ppsNative,b[1],config]))throw Error("Native H.264 configuration failed");
    var key=alloc_string("max-input-size");try{call("_ZN5movie9MediaData8SetInt32EPKci",[config,key,262144]);}finally{free(key);}
    ok("_ZN5movie7Decoder9ConfigureEPNS_9MediaDataE",[decoder,config]);ok("_ZN5movie7Decoder5StartEv",[decoder]);configured=started=true;
   }
   var result=number(call("_ZN5movie7Decoder23AcquireInputBufferIndexEPiS1_",[decoder,index,available]));if(result===0x1011)return -1;if(result)throw Error("Video input acquisition failed: "+result);
   var slot=number(read32(index));if(slot<0)return -1;
   ok("_ZN5movie7Decoder14GetInputBufferEiPNS_6BufferE",[decoder,slot,input]);
   var capacity=Number(call("_ZNK5movie6Buffer8CapacityEv",[input])),data=call("_ZNK5movie6Buffer4DataEv",[input]);if(!data||length<1||length>capacity)throw Error("Compressed video exceeds native input buffer");
   io.toNative(heap,pointer,length,data);ok("_ZN5movie7Decoder24SendInputBufferForDecodeEiiilj",[decoder,slot,0,length,Math.round(presentation),0]);videoSubmitted++;return 0;
  }
  function drainVideo(){
   if(!started)return;
   for(var attempt=0;attempt<8;attempt++){
    var result=number(call("_ZN5movie7Decoder24AcquireOutputBufferIndexEPiPlPjS1_",[decoder,index,pts,flags,available]));if(result===0x100e)break;if(result)throw Error("Video output acquisition failed: "+result);
    var slot=number(read32(index));if(slot<0)break;
    try{
     if(!fields){
      ok("_ZN5movie7Decoder15GetOutputFormatEPNS_9MediaDataE",[decoder,format]);
      fields={width:integer(format,"width"),height:integer(format,"height")};
      if(fields.width!==width||fields.height!==height)throw Error("Unexpected stream output dimensions");
     }
     if(!gpu&&!outputStorage){
      Object.assign(fields,{yStride:integer(format,"nv12-y-stride"),uvStride:integer(format,"nv12-uv-stride"),yOffset:integer(format,"nv12-y-offset"),uvOffset:integer(format,"nv12-uv-offset")});
      ok("_ZN5movie7Decoder19GetOutputBufferSizeEPiS1_",[decoder,size,alignment]);outputLength=number(read32(size));if(outputLength<1||outputLength>4194304)throw Error("Invalid video output capacity");
      outputStorage=(alloc(outputLength+4096)+4095n)&~4095n;outputHeap=core._malloc(outputLength);if(!outputHeap)throw Error("Cannot allocate video presentation buffer");
      call("_ZN5movie6Buffer18SetDataAndCapacityEPvm",[output,outputStorage,outputLength]);
     }
     videoDecoded++;
     var ready=!(Number(read32(flags))&4)&&Date.now()-lastPreview>=(texture?frameInterval:200)&&(!options.canPresent||options.canPresent());
     if(gpu){
      if(ready){
       var begin=Date.now();ok("_ZN5movie7Decoder15GetOutputBufferEiPNS_6BufferE",[decoder,slot,output]);
       var url=texture.presentNative(),elapsed=Date.now()-begin;conversionMs+=elapsed;maxConversionMs=Math.max(maxConversionMs,elapsed);
       if(options.onImage)options.onImage(url);lastPreview=begin;presented++;
      }
      continue;
     }
     ok("_ZN5movie7Decoder15GetOutputBufferEiPNS_6BufferE",[decoder,slot,output]);
     if(ready){
      var data=call("_ZNK5movie6Buffer4DataEv",[output]),used=Number(call("_ZNK5movie6Buffer4SizeEv",[output]));if(!data||used>outputLength||used<1)throw Error("Invalid decoded frame bounds");
      io.fromNative(core.HEAPU8,outputHeap,used,data);
      var begin=Date.now(),url;
      if(texture)url=texture.present(core.HEAPU8,outputHeap,used,fields);
      else if(global.MoonlightPreview)url=global.MoonlightPreview.encode(core.HEAPU8,outputHeap,used,width,height,fields.yStride,fields.uvStride,fields.yOffset,fields.uvOffset);
      else {var encoded=core._ml_png_nv12(outputHeap,used,width,height,fields.yStride,fields.uvStride,fields.yOffset,fields.uvOffset);if(!encoded)throw Error("Frame presentation conversion failed");url="data:image/png;base64,"+core.UTF8ToString(encoded);}
      var elapsed=Date.now()-begin;conversionMs+=elapsed;maxConversionMs=Math.max(maxConversionMs,elapsed);
      if(options.onImage)options.onImage(url);lastPreview=begin;presented++;
     }
    }finally{ok("_ZN5movie7Decoder24ReleaseOutputBufferIndexEi",[decoder,slot]);}
   }
  }
  function audioSetup(rate,channels,streams,coupled,samples){
   if(rate!==48000||channels!==2||streams!==1||coupled!==1)throw Error("First audio adapter supports stereo Opus at 48 kHz");
   var stateBytes=number(sdk("nncodecLibopus_opus_decoder_get_size",[2]));if(stateBytes<1||stateBytes>1048576)throw Error("Invalid Opus state size");
   audio={state:alloc(stateBytes),packet:alloc(65536),pcm:alloc(5760*4),staging:alloc(5760*4),stagedSamples:0,out:alloc(1024),parameter:alloc(64),buffers:[],opened:false,started:false,decoded:0,queued:0,dropped:0};
   if(number(sdk("nncodecLibopus_opus_decoder_init",[audio.state,48000,2])))throw Error("Opus decoder initialization failed");
   sdk("_ZN2nn5audio27InitializeAudioOutParameterEPNS0_17AudioOutParameterE",[audio.parameter]);write32(audio.parameter,48000n);write16(audio.parameter+4n,2n);
   var result=sdk("_ZN2nn5audio19OpenDefaultAudioOutEPNS0_8AudioOutERKNS0_17AudioOutParameterE",[audio.out,audio.parameter]);if(result&0x3fffffn)throw Error("AudioOut failed: 0x"+(result&0x3fffffn).toString(16));audio.opened=true;
   for(var i=0;i<20;i++)audio.buffers.push({node:alloc(64),data:(alloc(0x7000)+4095n)&~4095n,inUse:false});
   sdk("_ZN2nn5audio13StartAudioOutEPNS0_8AudioOutE",[audio.out]);audio.started=true;return 0;
  }
  function audioFrame(pointer,length,heap){
   if(!audio||!audio.started)return;
   io.toNative(heap,pointer,length,audio.packet);var samples=number(sdk("nncodecLibopus_opus_decode",[audio.state,audio.packet,length,audio.pcm,5760,0]));if(samples<0)throw Error("Native Opus decode failed: "+samples);audio.decoded++;
   if(audio.stagedSamples+samples>5760){audio.dropped++;audio.stagedSamples=0;}
   call_rop(memcpy_addr,audio.staging+BigInt(audio.stagedSamples*4),audio.pcm,BigInt(samples*4));audio.stagedSamples+=samples;
   // Sunshine normally sends 5 ms packets. Queue 20 ms of PCM per AudioOut
   // buffer to reduce native/IPC calls without accumulating a long audio queue.
   if(audio.stagedSamples<960)return;
   for(var i=0;i<20;i++){var released=sdk("_ZN2nn5audio25GetReleasedAudioOutBufferEPNS0_8AudioOutE",[audio.out]);if(!released)break;for(var item of audio.buffers)if(item.node===released)item.inUse=false;}
   var buffer=audio.buffers.find(function(item){return !item.inUse;});if(!buffer){audio.dropped++;audio.stagedSamples=0;return;}
   var bytes=audio.stagedSamples*4;call_rop(memcpy_addr,buffer.data,audio.staging,BigInt(bytes));audio.stagedSamples=0;sdk("_ZN2nn2os14FlushDataCacheEPKvm",[buffer.data,0x6000]);write64(buffer.node,0n);write64(buffer.node+0x20n,0n);
   sdk("_ZN2nn5audio21SetAudioOutBufferInfoEPNS0_14AudioOutBufferEPvmm",[buffer.node,buffer.data,0x6000,bytes]);
   if(!sdk("_ZN2nn5audio20AppendAudioOutBufferEPNS0_8AudioOutEPNS0_14AudioOutBufferE",[audio.out,buffer.node]))throw Error("Native audio queue rejected PCM");buffer.inUse=true;audio.queued++;
  }

  function close(){
   if(audio&&audio.opened){if(audio.started)sdk("_ZN2nn5audio12StopAudioOutEPNS0_8AudioOutE",[audio.out]);sdk("_ZN2nn5audio20FlushAudioOutBuffersEPNS0_8AudioOutE",[audio.out]);sdk("_ZN2nn5audio13CloseAudioOutEPNS0_8AudioOutE",[audio.out]);}
   if(started)call("_ZN5movie7Decoder4StopEv",[decoder]);
   for(var entry of objects.reverse())call("_ZN5movie"+entry.type+"D1Ev",[entry.p]);objects=[];
   if(texture){texture.close();texture=null;}
   if(outputHeap)core._free(outputHeap);outputHeap=0;core._ml_png_release();
   for(var p of owned.reverse())free(p);owned=[];started=false;configured=false;decoder=0n;audio=null;
  }
  return {videoSetup:videoSetup,videoFrame:videoFrame,audioSetup:audioSetup,audioFrame:audioFrame,drainVideo:drainVideo,close:close,
   stats:function(){return Object.assign({renderer:texture?(gpu?"native-gpu-texture":"native-texture"):"png",submitted:videoSubmitted,decoded:videoDecoded,presented:presented,conversionMs:conversionMs,maxConversionMs:maxConversionMs,audioDecoded:audio?audio.decoded:0,audioQueued:audio?audio.queued:0,audioDropped:audio?audio.dropped:0},texture?texture.stats():{});}};
 }
 global.MoonlightStreamMedia={create:create};
})(window);
