/* Thirty paced 720p H.264 frames, CPU output; no filesystem or renderer use. */
(async function(){
 var N=window.MoonlightProbeNative,owned=[],objects=[],decoder,started=false,held=-1,timer;
 function alloc(n){var p=malloc(n);owned.push(p);return p;}
 function c(name,args){return N.movieCall(name,args);}
 function num(v){return Number(BigInt.asIntN(32,v));}
 function hex(s){var b=new Uint8Array(s.length/2);for(var i=0;i<b.length;i++)b[i]=parseInt(s.slice(2*i,2*i+2),16);return b;}
 function object(type){var p=alloc(128);c("_ZN5movie"+type+"C1Ev",[p]);objects.push({p:p,type:type});return p;}
 function requireOK(name,result){var code=num(result);if(code)throw Error(name+" returned 0x"+code.toString(16));}
 function field(metadata,name){var key=alloc_string(name),p=alloc(8);try{if(!c("_ZNK5movie9MediaData9FindInt32EPKcPi",[metadata,key,p]))throw Error("Missing format field "+name);return num(read32(p));}finally{free(key);}}
 async function out(name,v){await log("MOONLIGHT_STREAM_H264_SEQUENCE_"+name+": "+JSON.stringify(v));}
 try{
  var fixture=window.__moonlightH264Sequence,packets=fixture.packets.map(hex),sps=hex(fixture.sps),pps=hex(fixture.pps),sp=alloc(sps.length),pp=alloc(pps.length);
  write_buffer(sp,sps);write_buffer(pp,pps);
  var config=object("9MediaData"),format=object("9MediaData"),input=object("6Buffer"),output=object("6Buffer");
  if(!c("_ZN5movie34CreateH264DecoderConfigurationDataEPKhmS1_mPNS_9MediaDataE",[sp,sps.length,pp,pps.length,config]))throw Error("Config failed");
  decoder=alloc(1024);await out("CONSTRUCTING",{frames:packets.length,width:1280,height:720,fps:30});
  c("_ZN5movie7DecoderC1ENS_11DecoderTypeENS_19DecoderOutputFormatENS_11DecoderModeEi",[decoder,1,4,1,num(c("_ZN5movie17GetThreadPriorityEv",[]))]);objects.push({p:decoder,type:"7Decoder"});
  if(!read64(decoder+8n))throw Error("No decoder implementation");
  requireOK("Configure",c("_ZN5movie7Decoder9ConfigureEPNS_9MediaDataE",[decoder,config]));
  requireOK("Start",c("_ZN5movie7Decoder5StartEv",[decoder]));started=true;
  var index=alloc(8),count=alloc(8),pts=alloc(8),flags=alloc(8),size=alloc(8),alignment=alloc(8),outputLength=0,yStride=0,uvOffset=0;
  var submitted=0,received=0,correct=0,ptsCorrect=0,maxPixelError=0,maxChannelErrors=[0,0,0],matchingLumaFrames=0,eosSent=false,eosReceived=false,firstFrameMs=null,lastFrameMs=null,maxPumpGap=0,lastPump=Date.now(),pumpTicks=0;
  timer=setInterval(function(){var now=Date.now();maxPumpGap=Math.max(maxPumpGap,now-lastPump);lastPump=now;pumpTicks++;},16);
  var begin=Date.now(),deadline=begin+6000;
  while(Date.now()<deadline&&!eosReceived){
   var now=Date.now();
   if((submitted<packets.length&&now-begin>=submitted*1000/30)||(submitted===packets.length&&!eosSent)){
    var rc=num(c("_ZN5movie7Decoder23AcquireInputBufferIndexEPiS1_",[decoder,index,count]));
    if(!rc&&num(read32(index))>=0){
     var ii=num(read32(index));
     if(submitted<packets.length){
      requireOK("GetInputBuffer",c("_ZN5movie7Decoder14GetInputBufferEiPNS_6BufferE",[decoder,ii,input]));
      var capacity=Number(c("_ZNK5movie6Buffer8CapacityEv",[input])),data=c("_ZNK5movie6Buffer4DataEv",[input]),packet=packets[submitted];
      if(!data||capacity<packet.length||capacity>4194304)throw Error("Input bounds invalid");
      write_buffer(data,packet);requireOK("Submit",c("_ZN5movie7Decoder24SendInputBufferForDecodeEiiilj",[decoder,ii,0,packet.length,Math.round(submitted*1000000/30),0]));submitted++;
     }else{requireOK("Drain",c("_ZN5movie7Decoder24SendInputBufferForDecodeEiiilj",[decoder,ii,0,0,1000000,4]));eosSent=true;}
    }else if(rc!==0x1011)throw Error("AcquireInput returned 0x"+rc.toString(16));
   }
   var rc=num(c("_ZN5movie7Decoder24AcquireOutputBufferIndexEPiPlPjS1_",[decoder,index,pts,flags,count]));
   if(!rc&&num(read32(index))>=0){
    held=num(read32(index));var isEnd=!!(Number(read32(flags))&4);
    if(!outputLength){
     requireOK("GetFormat",c("_ZN5movie7Decoder15GetOutputFormatEPNS_9MediaDataE",[decoder,format]));
     requireOK("GetSize",c("_ZN5movie7Decoder19GetOutputBufferSizeEPiS1_",[decoder,size,alignment]));outputLength=num(read32(size));
     if(outputLength<1||outputLength>4194304)throw Error("Output exceeds bound");
     var storage=alloc(outputLength+4096),aligned=(storage+4095n)&~4095n;c("_ZN5movie6Buffer18SetDataAndCapacityEPvm",[output,aligned,outputLength]);
     yStride=field(format,"nv12-y-stride");uvOffset=field(format,"nv12-uv-offset");
     await out("FORMAT",{width:field(format,"width"),height:field(format,"height"),yStride:yStride,uvOffset:uvOffset,bufferBytes:outputLength,alignment:num(read32(alignment))});
    }
    requireOK("GetOutputBuffer",c("_ZN5movie7Decoder15GetOutputBufferEiPNS_6BufferE",[decoder,held,output]));
    if(isEnd)eosReceived=true;
    else{
     var pointer=c("_ZNK5movie6Buffer4DataEv",[output]),used=Number(c("_ZNK5movie6Buffer4SizeEv",[output]));if(!pointer||used>outputLength||uvOffset+1>=used)throw Error("Output bounds invalid");
     if(fixture.expected){
      var frameError=0,lumaError=0,diagnostics=[];for(var point of fixture.expected[received]||[]){var yAt=point[1]*yStride+point[0],uvAt=uvOffset+(point[1]>>1)*yStride+(point[0]&~1);if(yAt>=used||uvAt+1>=used)throw Error("Reference sample out of bounds");var actual=[Number(read8(pointer+BigInt(yAt))),Number(read8(pointer+BigInt(uvAt))),Number(read8(pointer+BigInt(uvAt+1)))];for(var channel=0;channel<3;channel++){var error=Math.abs(actual[channel]-point[channel+2]);frameError=Math.max(frameError,error);maxChannelErrors[channel]=Math.max(maxChannelErrors[channel],error);if(channel===0)lumaError=Math.max(lumaError,error);}if(received===0)diagnostics.push({x:point[0],y:point[1],expected:point.slice(2),actual:actual});}if(received===0)await out("REFERENCE_SAMPLES",diagnostics);maxPixelError=Math.max(maxPixelError,frameError);if(frameError<=2&&received<fixture.expected.length)correct++;if(lumaError===0&&received<fixture.expected.length)matchingLumaFrames++;
     }else if(Number(read8(pointer))===41&&Number(read8(pointer+BigInt(yStride*719+1279)))===41&&Number(read8(pointer+BigInt(uvOffset)))===240&&Number(read8(pointer+BigInt(uvOffset+1)))===110)correct++;
     if(read64(pts)===BigInt(Math.round(received*1000000/30)))ptsCorrect++;
     received++;lastFrameMs=Date.now()-begin;if(firstFrameMs===null)firstFrameMs=lastFrameMs;
    }
    requireOK("ReleaseOutput",c("_ZN5movie7Decoder24ReleaseOutputBufferIndexEi",[decoder,held]));held=-1;
   }else if(rc!==0x100e)throw Error("AcquireOutput returned 0x"+rc.toString(16));
   await new Promise(function(resolve){setTimeout(resolve,2);});
  }
  await out("RESULT",{submitted:submitted,received:received,matchingFrames:correct,matchingLumaFrames:matchingLumaFrames,correctTimestamps:ptsCorrect,maxPixelError:maxPixelError,maxChannelErrors:maxChannelErrors,reference:fixture.expected?"FFmpeg NV12, 24 positions per picture":"blue NV12",eosReceived:eosReceived,firstFrameMs:firstFrameMs,lastFrameMs:lastFrameMs,elapsedMs:Date.now()-begin,uiTimerTicks:pumpTicks,maxUiTimerGapMs:maxPumpGap,lastError:num(c("_ZN5movie7Decoder12GetLastErrorEv",[decoder]))});
 }catch(e){await out("ERROR",String(e.message||e));}
 finally{
  clearInterval(timer);
  if(held>=0)c("_ZN5movie7Decoder24ReleaseOutputBufferIndexEi",[decoder,held]);
  if(started)await out("STOPPED",num(c("_ZN5movie7Decoder4StopEv",[decoder])));
  for(var o of objects.reverse())c("_ZN5movie"+o.type+"D1Ev",[o.p]);for(var p of owned.reverse())free(p);
  delete window.__moonlightH264Sequence;delete window.MoonlightProbeNative;await out("END",true);
 }
})();
