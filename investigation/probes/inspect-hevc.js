/* Read-only codec inventory and constructor bounds on the installed build. */
(async function(){
 var N=window.MoonlightProbeNative,info=malloc(64),page=malloc(8);
 function range(p,n,permissions){if(call_rop(sdk_base+0x168b0cn,info,page,p)&0x3fffffn)throw Error('Query failed');if((Number(read32(info+24n))&permissions)!==permissions||p<read64(info)||p+BigInt(n)>read64(info)+read64(info+8n))throw Error('Codec read range rejected');}
 async function capture(offset,n,permissions){var p=N.movieBase+BigInt(offset);range(p,n,permissions);var b=N.copyFrom(p,n);await log('MOONLIGHT_RENDER_SLICE: '+JSON.stringify({offset:offset.toString(16),permissions:permissions,hex:Array.from(b,function(x){return ('0'+x.toString(16)).slice(-2);}).join('')}));}
 try{
  if(read32(sdk_base+0x168b10n)!==0xd40000c1n)throw Error('Query ABI mismatch');
  for(var module of [{name:'sdk',exports:N.exports},{name:'movie',exports:N.movieExports}]){
   var names=Object.keys(module.exports),matches=names.filter(function(name){return /hevc|h265|hvc1|hev1|av1|nvdec|nvmedia|omx|VideoDecoder|Create.*DecoderConfiguration/i.test(name);});
   await log('MOONLIGHT_HEVC_EXPORTS: '+JSON.stringify({module:module.name,total:names.length,matches:matches.map(function(name){var x=module.exports[name];return {name:name,offset:x.offset,size:x.size};})}));
  }
  for(var name of ['_ZN5movie7DecoderC1ENS_11DecoderTypeENS_19DecoderOutputFormatENS_11DecoderModeEi','_ZN5movie34CreateH264DecoderConfigurationDataEPKhmS1_mPNS_9MediaDataE']){
   var x=N.movieExports[name];if(x)await capture(parseInt(x.offset,16),Math.min(x.size,1536),5);
  }
  await capture(0x2b61ff0,768,5);
  await log('MOONLIGHT_HEVC_READ_COMPLETE');
 }finally{free(page);free(info);}
})();
