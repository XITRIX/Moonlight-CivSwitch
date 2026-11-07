/* Read-only: trace the texture-output ABI without constructing a decoder. */
(async function(){
 var N=window.MoonlightProbeNative,info=malloc(64),page=malloc(8);
 function range(p,n,perm){
  if(call_rop(sdk_base+0x168b0cn,info,page,p)&0x3fffffn)throw Error('Query failed');
  if((Number(read32(info+24n))&perm)!==perm||p<read64(info)||p+BigInt(n+4)>read64(info)+read64(info+8n))throw Error('Range rejected');
 }
 async function capture(address,n){range(address,n,5);var b=N.copyFrom(address,n);await log('MOONLIGHT_RENDER_SLICE: '+JSON.stringify({offset:(address-N.movieBase).toString(16),permissions:5,hex:Array.from(b,function(x){return ('0'+x.toString(16)).slice(-2);}).join('')}));}
 try{
  if(read32(sdk_base+0x168b10n)!==0xd40000c1n)throw Error('Unknown query ABI');
  range(N.movieBase+0x40385a8n,8,1);var table=read64(N.movieBase+0x40385a8n)+16n;
  for(var slot of [0x90,0x98]){range(table+BigInt(slot),8,1);var p=read64(table+BigInt(slot));await log('MOONLIGHT_OUTPUT_SLOT: '+JSON.stringify({slot:slot,offset:(p-N.movieBase).toString(16)}));await capture(p,1536);}
  for(var name of Object.keys(N.movieExports))if(/Buffer.*SetNvn|Buffer.*NvnSync/.test(name)){var e=N.movieExports[name];await log('MOONLIGHT_OUTPUT_EXPORT: '+JSON.stringify({name:name,offset:e.offset,size:e.size}));await capture(e.address,128);}
 }finally{free(page);free(info);}
})();
