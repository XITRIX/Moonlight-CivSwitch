/* Construct and destroy one private CPU-output H.264 decoder. No file writes. */
(async function(){
 var N=window.MoonlightProbeNative,decoder=malloc(1024),constructed=false;
 async function out(name,value){await log("MOONLIGHT_STREAM_MOVIE_INSTANCE_"+name+": "+JSON.stringify(value));}
 try{
  // Public type 1 maps to native codec 0; output 4 to native format 3.
  // Mode 1 is the SDK's default CPU-buffer mode. Preserve its own priority.
  var priority=Number(BigInt.asIntN(32,N.movieCall("_ZN5movie17GetThreadPriorityEv",[])));
  await out("CONSTRUCTING",{type:1,format:4,mode:1,priority:priority});
  N.movieCall("_ZN5movie7DecoderC1ENS_11DecoderTypeENS_19DecoderOutputFormatENS_11DecoderModeEi",[decoder,1,4,1,priority]);constructed=true;
  var implementation=read64(decoder+8n);
  await out("CONSTRUCTED",{hasImplementation:implementation!==0n});
  if(implementation)await out("LAST_ERROR",Number(BigInt.asIntN(32,N.movieCall("_ZN5movie7Decoder12GetLastErrorEv",[decoder]))));
 }catch(error){await out("ERROR",String(error.message||error));}
 finally{
  if(constructed){await out("DESTROYING",true);N.movieCall("_ZN5movie7DecoderD1Ev",[decoder]);await out("DESTROYED",true);}
  free(decoder);delete window.MoonlightProbeNative;await out("END",true);
 }
})();
