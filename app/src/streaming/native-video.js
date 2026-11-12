/* AV1 Main8 through the checked compatibility decoder service. Runs locally.
 * Construction and all session ownership remain outside the cooperative C pump. */
(function(g){
 "use strict";
 async function holdMovie(context){
  var create=context.resolve("_ZN5movie7DecoderC2ENS_11DecoderTypeENS_19DecoderOutputFormatE"),destroy=context.resolve("_ZN5movie7DecoderD2Ev");
  var p=context.allocate(1024),constructed=false,closed=false;
  try{context.call(BigInt(create),BigInt(p),1n,4n);constructed=true;if(!context.native.read64(BigInt(p)+8n))throw Error("AV1 service keeper initialization failed");}
  catch(error){if(constructed)context.call(BigInt(destroy),BigInt(p));context.release(p);throw error;}
  return {close:async function(){if(closed)return;context.call(BigInt(destroy),BigInt(p));context.release(p);closed=true;}};
 }
 async function openAv1(context,bytes,size,report){
  var m=g.MoonlightNativeModules,scan=m.av1Stream.scanTemporalUnit(bytes);
  if(!scan.sequence||!scan.keyframe||!m.av1Stream.isMain8(scan.sequence))throw Error("AV1 requires an initial Main8 keyframe");
  var coded=m.av1Stream.decodedSize(size,scan.sequence,scan.size);
  if(report)report({stage:"av1-size",requested:size,coded:coded});
  var decoder=await m.av1Decoder.createAv1Decoder({rpc:context.rpc,directory:"local",width:coded.width,height:coded.height,display:size,log:report});
  var destination;
  try{
   destination=context.allocate(coded.width*coded.height*3/2);
   var native=g.MoonlightNativeContext.checkedCalls(context,decoder.nativeContext.av1.functions);
   var backend=m.av1Backend.createAv1Backend(native,decoder.nativeContext.av1,{memory:BigInt(decoder.nativeContext.memory),destination:BigInt(destination),destinationBytes:coded.width*coded.height*3/2});
   return {decoder:decoder,backend:backend,destination:destination,coded:coded,close:async function(){await decoder.close();context.release(destination);}};
  }catch(error){await decoder.close();if(destination)context.release(destination);throw error;}
 }
 async function createMedia(io,core,options){
  var mode=options.mode,m=g.MoonlightNativeModules;
  if(mode.width>1920&&!(g.CivNanoVGSession&&g.CivNanoVGSession.current)){
   var previous=g.MoonlightNativeDisplay.state(),inspection=previous?previous.context:g.MoonlightNativeContext.create();
   try{var operation=await m.operationMode.readOperationMode(inspection.rpc,{log:options.report});if(!operation.docked)throw Error("Dock the console before starting a 1440p or 4K stream");}
   finally{if(!previous)inspection.close();}
  }
  var display=await g.MoonlightNativeDisplay.prepare({width:Math.max(1920,mode.width),height:Math.max(1080,mode.height)},options.report);
  var c=display.context,refresh=null,av1=null,opening=null,first=null,active=null,queue=[],slots=[],closed=false;
  var submitted=0,decoded=0,presented=0,rejected=0,begin=Date.now(),decodeMs=0,maxDecodeMs=0;
  var turnPresented=false,nextAt=null,lastPresented=null,intervalCount=0,intervalMs=0,intervalSquaredMs=0,maxIntervalMs=0,stallsOver50Ms=0,stallsOver100Ms=0,stallsOver250Ms=0,presentAgeMs=0,conversionMs=0,maxConversionMs=0;
  function now(){return g.MoonlightTelemetry?g.MoonlightTelemetry.now():Date.now();}
  function canPresent(){return !turnPresented&&(!options.canPresent||options.canPresent());}
  var base=g.MoonlightStreamMedia.create(io,core,Object.assign({},options,{renderer:"native-nv12",canPresent:canPresent,nativeCall:c.rawCall,
   videoOutput:function(length,alignment,fields){return fields.yOffset===0?g.MoonlightNativeDisplay.videoBuffer(length,alignment):null;},videoSink:function(pointer,length,fields){
   if(fields.yStride!==fields.uvStride||fields.yStride<fields.width||fields.yOffset<0||fields.uvOffset<fields.yOffset)throw Error("Independent H.264 display requires valid equal NV12 strides");
   var rows=(fields.uvOffset-fields.yOffset)/fields.yStride;
   if(!Number.isInteger(rows)||rows<fields.height||rows%2||fields.yOffset+fields.yStride*rows*1.5>length)throw Error("Independent H.264 plane bounds rejected");
   g.MoonlightNativeDisplay.publish(pointer+BigInt(fields.yOffset),fields.width,fields.height,fields.yStride,rows);
   turnPresented=true;
   if(options.onPresented)options.onPresented();
  }}));
  try{
   if(mode.fps>60){
    refresh=await g.MoonlightNativeDisplay.refresh(options.report);var raised=await refresh.set(mode.fps);
    if(!raised.ok)throw Error("120 Hz is unavailable on this console display");
    var confirmed=false;
    for(var attempt=0;attempt<4;attempt++){
     var started=Date.now();for(var i=0;i<30;i++)display.present(0,false);
     g.MoonlightNativeDisplay.finish();
     var measurement={frames:30,elapsedMs:Date.now()-started},status=await refresh.measured(measurement);
     if(status==="raised"&&measurement.frames*1000/measurement.elapsedMs>=108){confirmed=true;break;}
     if(status==="failed")break;
    }
    if(!confirmed)throw Error("The independent display could not sustain 120 Hz");
   }
   if(mode.codec==="av1")for(var i=0;i<4;i++)slots.push({pointer:c.allocate(1024*1024),used:false});
  }catch(error){g.MoonlightNativeDisplay.finish();if(refresh){await refresh.close();display.refresh=null;}base.close();for(var slot of slots)c.release(slot.pointer);await g.MoonlightNativeDisplay.retire();throw error;}
  function videoFrame(pointer,length,kind,pts,sps,spsLength,pps,ppsLength,heap){
   if(mode.codec!=="av1")return base.videoFrame.apply(base,arguments);
   if(length<1||length>1024*1024)throw Error("AV1 compressed frame exceeds the checked input capacity");
   var slot=slots.find(function(slot){return !slot.used;});if(!slot){rejected++;return -1;}
   if(!first&&!av1)first=g.MoonlightNativeBuffer.from(heap.subarray(pointer,pointer+length));
   io.toNative(heap,pointer,length,BigInt(slot.pointer));slot.used=true;
   queue.push({slot:slot,length:length,pts:BigInt(Math.round(pts)),at:now()});submitted++;return 0;
  }
  async function prepareVideo(){
   if(mode.codec!=="av1"||av1||!first)return;
   if(!opening)opening=openAv1(c,first,{width:mode.width,height:mode.height},options.report).then(function(value){av1=value;first=null;});
   await opening;
  }
  function drain(){
   if(mode.codec!=="av1")return base.drainVideo();
   if(!av1)return false;
   if(active){
    if(now()-active.startedAt>5000)throw Error("AV1 decode timed out");
    if(turnPresented)return true;
    // One nonblocking fence query; yield to protocol/audio/input while decoding.
    if(!av1.backend.wait(function(){return true;}))return true;
    var allowed=canPresent(),time=now(),period=1000/mode.fps;
    if(allowed&&mode.fps>60&&options.smoothVideo!==false&&nextAt!==null&&time+1<nextAt)return true;
    var target=allowed?g.MoonlightNativeDisplay.videoBuffer(av1.backend.frameBytes,4096):null,copyBegin=now();
    av1.backend.output(target||BigInt(av1.destination));var elapsed=now()-active.at;decodeMs+=elapsed;maxDecodeMs=Math.max(maxDecodeMs,elapsed);decoded++;
    if(allowed){
     g.MoonlightNativeDisplay.publish(target||av1.destination,mode.width,mode.height,av1.coded.width,av1.coded.height);presented++;turnPresented=true;
     var cost=now()-copyBegin;conversionMs+=cost;maxConversionMs=Math.max(maxConversionMs,cost);presentAgeMs+=now()-active.at;
     if(lastPresented!==null){var delta=time-lastPresented;intervalCount++;intervalMs+=delta;intervalSquaredMs+=delta*delta;maxIntervalMs=Math.max(maxIntervalMs,delta);if(delta>50)stallsOver50Ms++;if(delta>100)stallsOver100Ms++;if(delta>250)stallsOver250Ms++;}lastPresented=time;
     nextAt=nextAt===null||time-nextAt>=period?time+period:nextAt+period;
     if(options.onPresented)options.onPresented();
    }
    active=null;
   }
   if(queue.length){
    var unit=queue.shift();av1.backend.submit({source:BigInt(unit.slot.pointer),length:unit.length,pts:unit.pts});unit.slot.used=false;unit.startedAt=now();active=unit;
   }
   return true;
  }
  return {videoSetup:function(format,w,h,fps){
    if(mode.codec!=="av1")return base.videoSetup(format,w,h,fps);
    if(format!==0x1000||w!==mode.width||h!==mode.height)throw Error("Unexpected negotiated AV1 stream format");return 0;
   },videoFrame:videoFrame,prepareVideo:prepareVideo,drainVideo:function(){turnPresented=false;return drain();},finishVideo:function(){return mode.codec==="av1"?drain():base.finishVideo.apply(base,arguments);},
   audioSetup:base.audioSetup,audioFrame:base.audioFrame,drainAudio:base.drainAudio,
   stats:function(){var result=base.stats();return Object.assign(result,{renderer:"native-vulkan",codec:mode.codec||"h264",displayWidth:display.size.width,displayHeight:display.size.height,presentationTimings:Object.assign({},display.present.timings)},mode.codec==="av1"?{submitted:submitted,decoded:decoded,presented:presented,decoderPending:submitted-decoded,decoderRejected:rejected,decodeSamples:decoded,decodeMs:decodeMs,maxDecodeMs:maxDecodeMs,queuedFrames:queue.length,conversionMs:conversionMs,maxConversionMs:maxConversionMs,presentAgeMs:presentAgeMs,presentAgeSamples:presented,intervalCount:intervalCount,intervalMs:intervalMs,intervalSquaredMs:intervalSquaredMs,maxIntervalMs:maxIntervalMs,stallsOver50Ms:stallsOver50Ms,stallsOver100Ms:stallsOver100Ms,stallsOver250Ms:stallsOver250Ms,streamMs:Date.now()-begin}:{});},
   close:async function(){
    if(closed)return;
    // Stop the service before releasing any compressed buffers or its keeper.
    if(opening)await opening;
    if(av1){await av1.close();av1=null;}
    base.close();for(var slot of slots)c.release(slot.pointer);slots=[];queue=[];active=null;
    g.MoonlightNativeDisplay.finish();
    if(refresh){await refresh.close();display.refresh=null;refresh=null;}
    await g.MoonlightNativeDisplay.retire();
    closed=true;
   }};
 }
 g.MoonlightNativeVideo={holdMovie:holdMovie,openAv1:openAv1,createMedia:createMedia};
})(typeof window!=="undefined"?window:globalThis);
