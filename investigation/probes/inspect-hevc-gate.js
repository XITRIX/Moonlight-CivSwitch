/* Read validation predicates for codec enum values established by the mapping. */
(async function(){
 var N=window.MoonlightProbeNative,info=malloc(64),page=malloc(8);
 function range(p,n,permissions){if(call_rop(sdk_base+0x168b0cn,info,page,p)&0x3fffffn)throw Error('Query failed');if((Number(read32(info+24n))&permissions)!==permissions||p<read64(info)||p+BigInt(n)>read64(info)+read64(info+8n))throw Error('Codec gate range rejected');}
 try{
  for(var entry of [[0x2b52f30,384,5],[0x2b62230,48,5],[0x36497a4,20,1]]){
   var p=N.movieBase+BigInt(entry[0]);range(p,entry[1],entry[2]);var b=N.copyFrom(p,entry[1]);await log('MOONLIGHT_RENDER_SLICE: '+JSON.stringify({offset:entry[0].toString(16),permissions:entry[2],hex:Array.from(b,function(x){return ('0'+x.toString(16)).slice(-2);}).join('')}));
  }
  for(var type=1;type<=5;type++)await log('MOONLIGHT_CODEC_VALIDATION: '+JSON.stringify({type:type,mapped:Number(call_rop(N.movieBase+0x2b62230n,BigInt(type))),supported:!!call_rop(N.movieBase+0x2b61f90n,BigInt(type)),gpu:!!call_rop(N.movieBase+0x2b61ff0n,BigInt(type),2n,3n),nv12:!!call_rop(N.movieBase+0x2b61ff0n,BigInt(type),1n,4n)}));
 }finally{free(page);free(info);}
})();
