/* Resolve literal strings referenced by the captured codec/MIME mapper. */
(async function(){
 var N=window.MoonlightProbeNative,info=malloc(64),page=malloc(8);
 try{
  for(var offset of [0x31961be,0x31ae212,0x31b4410,0x3235bd5,0x31e5a1e,0x322937e,0x31c0edb,0x31961e9,0x31a1f45,0x31fe5be,0x31fe5b7,0x31e5a5a,0x3235be3,0x3241a3a,0x31b4414]){
   var p=N.movieBase+BigInt(offset),n=96;
   if(call_rop(sdk_base+0x168b0cn,info,page,p)&0x3fffffn)throw Error('Query failed');
   if(!(Number(read32(info+24n))&1)||p<read64(info)||p+BigInt(n)>read64(info)+read64(info+8n))throw Error('String range rejected');
   var b=N.copyFrom(p,n),s='';for(var i=0;i<b.length&&b[i];i++)s+=String.fromCharCode(b[i]);
   await log('MOONLIGHT_CODEC_LITERAL: '+JSON.stringify({offset:offset.toString(16),value:s}));
  }
 }finally{free(page);free(info);}
})();
