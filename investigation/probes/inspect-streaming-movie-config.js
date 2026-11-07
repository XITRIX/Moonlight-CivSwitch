/* Pure H.264 parsing/configuration plus read-only decoder initializer inspection. */
(async function(){
 var N=window.MoonlightProbeNative;
 async function out(name,value){await log("MOONLIGHT_STREAM_MOVIE_CONFIG_"+name+": "+JSON.stringify(value));}
 function bytes(hex){var result=new Uint8Array(hex.length/2);for(var i=0;i<result.length;i++)result[i]=parseInt(hex.slice(i*2,i*2+2),16);return result;}
 function signed(v){return Number(BigInt.asIntN(32,v));}
 var fixture=window.__moonlightH264,sps=bytes(fixture.sps),pps=bytes(fixture.pps),spsBuffer=malloc(sps.length),ppsBuffer=malloc(pps.length),width=malloc(8),height=malloc(8),fps=malloc(8),metadata=malloc(64),made=false;
 try{
  write_buffer(spsBuffer,sps);write_buffer(ppsBuffer,pps);
  var status=signed(N.movieCall("_ZN5movie37GetH264PropertiresFromSeqParamSetDataEPKhmPiS2_Pd",[spsBuffer,sps.length,width,height,fps]));
  await out("SPS_PARSED",{status:status,width:Number(read32(width)),height:Number(read32(height)),frameRate:new DataView(N.copyFrom(fps,8).buffer).getFloat64(0,true)});
  N.movieCall("_ZN5movie9MediaDataC1Ev",[metadata]);made=true;
  await out("METADATA_CREATED",{hasImplementation:read64(metadata)!==0n});
  var config=signed(N.movieCall("_ZN5movie34CreateH264DecoderConfigurationDataEPKhmS1_mPNS_9MediaDataE",[spsBuffer,sps.length,ppsBuffer,pps.length,metadata]));
  var values={status:config,entries:Number(N.movieCall("_ZNK5movie9MediaData12CountEntriesEv",[metadata]))};
  for(var name of ["width","height","max-input-size","color-format"]){var key=alloc_string(name),value=malloc(8);try{var found=!!N.movieCall("_ZNK5movie9MediaData9FindInt32EPKcPi",[metadata,key,value]);values[name]={found:found,value:Number(read32(value))};}finally{free(key);free(value);}}
  await out("H264_CONFIGURATION",values);
  // Decoder impl vtable initializers, from the inspected constructor GOT loads.
  for(var offset of [0x40385a8,0x40385c8]){
   var table=read64(N.movieBase+BigInt(offset))+16n,initialize=read64(table+16n),relative=initialize-N.movieBase;
   if(relative<0n||relative>0x2bdc000n)throw Error("Initializer outside inspected movie code");
   var raw=N.copyFrom(initialize,3072),hex="";for(var b of raw)hex+=("0"+b.toString(16)).slice(-2);
   await out("INITIALIZER",{table:offset,offset:relative.toString(16),length:raw.length,hex:hex});
  }
  var imports={};for(var offset of [0x40482f8,0x4048308,0x404cb10]){var target=read64(N.movieBase+BigInt(offset));imports["0x"+offset.toString(16)]=Object.keys(N.exports).filter(function(name){return N.exports[name].address===target;});}
  await out("RESOLVED_IMPORTS",imports);
 }catch(error){await out("ERROR",String(error.message||error));}
 finally{if(made)N.movieCall("_ZN5movie9MediaDataD1Ev",[metadata]);for(var p of [spsBuffer,ppsBuffer,width,height,fps,metadata])free(p);delete window.__moonlightH264;delete window.MoonlightProbeNative;await out("END",true);}
})();
