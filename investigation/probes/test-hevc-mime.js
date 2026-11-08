/* The captured pure MIME-to-codec parser, with owned, terminated strings. */
(async function(){
 var N=window.MoonlightProbeNative,info=malloc(64),page=malloc(8);
 try{
  var fn=N.movieBase+0x2b62130n;
  if(call_rop(sdk_base+0x168b0cn,info,page,fn)&0x3fffffn)throw Error('Query failed');
  if((Number(read32(info+24n))&5)!==5||fn<read64(info)||fn+256n>read64(info)+read64(info+8n)||read32(fn)!==0xd503237fn)throw Error('MIME parser ABI rejected');
  for(var entry of [['video/avc',0],['video/x-vnd.on2.vp8',4],['video/x-vnd.on2.vp9',1],['audio/mp4a-latm',65],['audio/vorbis',66],['video/hevc',-1],['video/h265',-1],['video/x-h265',-1],['video/hvc1',-1],['video/hev1',-1]]){
   var mime=entry[0],p=alloc_string(mime);try{var codec=Number(BigInt.asIntN(32,call_rop(fn,p)));await log('MOONLIGHT_CODEC_MIME: '+JSON.stringify({mime:mime,codec:codec}));if(codec!==entry[1])throw Error('Unexpected codec result for '+mime);}finally{free(p);}
  }
  await log('MOONLIGHT_HEVC_MIME_ASSERTIONS_PASSED: 10');
  await log('MOONLIGHT_HEVC_CORE_READY: '+(typeof window.__moonlightStreamFactory==='function'));
 }finally{free(page);free(info);}
})();
