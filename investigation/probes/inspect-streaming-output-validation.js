(async function(){
 var N=window.MoonlightProbeNative,info=malloc(64),page=malloc(8);
 try{
  if(read32(sdk_base+0x168b10n)!==0xd40000c1n)throw Error('Unknown query ABI');
  for(var entry of [[0x2b61f80,512,5],[0x2b62230,144,5],[0x36497b8,16,1]]){
   var address=N.movieBase+BigInt(entry[0]),n=entry[1],permissions=entry[2];
   if(call_rop(sdk_base+0x168b0cn,info,page,address)&0x3fffffn)throw Error('Query failed');
   if((Number(read32(info+24n))&permissions)!==permissions||address<read64(info)||address+BigInt(n+4)>read64(info)+read64(info+8n))throw Error('Read rejected');
   var b=N.copyFrom(address,n);await log('MOONLIGHT_RENDER_SLICE: '+JSON.stringify({offset:entry[0].toString(16),permissions:permissions,hex:Array.from(b,function(x){return ('0'+x.toString(16)).slice(-2);}).join('')}));
  }
 }finally{free(page);free(info);}
})();
