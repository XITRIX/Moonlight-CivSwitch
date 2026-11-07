/* Retain one configured decoder so no uncertain metadata destruction occurs. */
(async function(){
 var N=window.MoonlightProbeNative,owned=[],info=malloc(64),page=malloc(8);
 function alloc(n){var p=malloc(n);owned.push(p);return p;}
 function c(name,args){return N.movieCall(name,args);}
 function range(p,n){if(call_rop(sdk_base+0x168b0cn,info,page,p)&0x3fffffn)throw Error('Query failed');if(!(read32(info+24n)&1n)||p<read64(info)||p+BigInt(n+4)>read64(info)+read64(info+8n))throw Error('Range rejected');}
 function hex(b){return Array.from(b,function(x){return ('0'+x.toString(16)).slice(-2);}).join('');}
 function bytes(s){return Uint8Array.from(s.match(/../g),function(b){return parseInt(b,16);});}
 var config=alloc(128),decoder=alloc(1024),sps=bytes(window.__moonlightH264.sps),pps=bytes(window.__moonlightH264.pps),sp=alloc(sps.length),pp=alloc(pps.length);
 write_buffer(sp,sps);write_buffer(pp,pps);c('_ZN5movie9MediaDataC1Ev',[config]);
 c('_ZN5movie34CreateH264DecoderConfigurationDataEPKhmS1_mPNS_9MediaDataE',[sp,sps.length,pp,pps.length,config]);
 async function snapshot(stage){
  var root=read64(config);range(root,0x608);var data=N.copyFrom(root,0x608);
  await log('MOONLIGHT_CONFIG_SNAPSHOT: '+JSON.stringify({stage:stage,wrapper:config.toString(16),root:root.toString(16),hex:hex(data)}));
 }
 await snapshot('before');
 c('_ZN5movie7DecoderC1ENS_11DecoderTypeENS_19DecoderOutputFormatENS_11DecoderModeEi',[decoder,1,3,2,Number(BigInt.asIntN(32,c('_ZN5movie17GetThreadPriorityEv',[])))]);
 await log('MOONLIGHT_CONFIG_CONFIGURED: '+c('_ZN5movie7Decoder9ConfigureEPNS_9MediaDataE',[decoder,config]));
 await snapshot('after');
 window.__moonlightConfigProbe={N:N,owned:owned,decoder:decoder,config:config};
 free(page);free(info);await log('MOONLIGHT_CONFIG_RETAINED');
})();
