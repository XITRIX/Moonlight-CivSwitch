/* Own, configure, destroy each decoder; no rendering or unrecognized enum values. */
(async function(){
 var N=window.MoonlightProbeNative;
 function bytes(s){return Uint8Array.from(s.match(/../g),function(b){return parseInt(b,16);});}
 function call(name,args){return N.movieCall(name,args);}
 var sps=bytes(window.__moonlightH264.sps),pps=bytes(window.__moonlightH264.pps),sp=malloc(sps.length),pp=malloc(pps.length),config=malloc(128);
 try{
  write_buffer(sp,sps);write_buffer(pp,pps);call('_ZN5movie9MediaDataC1Ev',[config]);
  if(!call('_ZN5movie34CreateH264DecoderConfigurationDataEPKhmS1_mPNS_9MediaDataE',[sp,sps.length,pp,pps.length,config]))throw Error('Config failed');
  var results=[];
  for(var mode of [1,2])for(var format of [2,3,4,5]){
   var decoder=malloc(1024),constructed=false;
   try{
    call('_ZN5movie7DecoderC1ENS_11DecoderTypeENS_19DecoderOutputFormatENS_11DecoderModeEi',[decoder,1,format,mode,Number(call('_ZN5movie17GetThreadPriorityEv',[]))]);constructed=true;
    var hasImplementation=!!read64(decoder+8n),status=hasImplementation?Number(call('_ZN5movie7Decoder9ConfigureEPNS_9MediaDataE',[decoder,config])):null;
    results.push({mode:mode,format:format,implementation:hasImplementation,status:status});
   }finally{if(constructed)call('_ZN5movie7DecoderD1Ev',[decoder]);free(decoder);}
  }
  await log('MOONLIGHT_DECODER_MODES: '+JSON.stringify(results));
 }finally{call('_ZN5movie9MediaDataD1Ev',[config]);free(config);free(pp);free(sp);delete window.MoonlightProbeNative;delete window.__moonlightH264;}
})();
