/* Own, configure, destroy each decoder; no rendering or unrecognized enum values. */
(async function(){
 var N=window.MoonlightProbeNative;
 function bytes(s){return Uint8Array.from(s.match(/../g),function(b){return parseInt(b,16);});}
 function call(name,args){return N.movieCall(name,args);}
 var sps=bytes(window.__moonlightH264.sps),pps=bytes(window.__moonlightH264.pps),sp=malloc(sps.length),pp=malloc(pps.length),config=malloc(128);
 try{
  write_buffer(sp,sps);write_buffer(pp,pps);call('_ZN5movie9MediaDataC1Ev',[config]);
  if(!call('_ZN5movie34CreateH264DecoderConfigurationDataEPKhmS1_mPNS_9MediaDataE',[sp,sps.length,pp,pps.length,config]))throw Error('Config failed');
  await log("MOONLIGHT_CONFIG_FACTORY_COMPLETE");
  await log("MOONLIGHT_CONFIG_DESTROY_BEGIN");
 }finally{call('_ZN5movie9MediaDataD1Ev',[config]);await log("MOONLIGHT_CONFIG_DESTROY_END");free(config);free(pp);free(sp);delete window.MoonlightProbeNative;delete window.__moonlightH264;}
})();
