(async function(){
 var N=window.MoonlightProbeNative,info=malloc(64),page=malloc(8);
 try{
  if(read32(sdk_base+0x168b10n)!==0xd40000c1n)throw Error('Unknown query ABI');
  for(var entry of [[0x781a10,160],[0x77d000,64]]){
   var address=main_base+BigInt(entry[0]),n=entry[1];
   if(call_rop(sdk_base+0x168b0cn,info,page,address)&0x3fffffn)throw Error('Query failed');
   if((read32(info+24n)&5n)!==5n||address<read64(info)||address+BigInt(n)>read64(info)+read64(info+8n))throw Error('Code read rejected');
   var b=N.copyFrom(address,n);await log('MOONLIGHT_RENDER_SLICE: '+JSON.stringify({offset:entry[0].toString(16),permissions:5,hex:Array.from(b,function(x){return ('0'+x.toString(16)).slice(-2);}).join('')}));
  }
 }finally{free(page);free(info);}
})();
