(async function(){
 var N=window.MoonlightProbeNative,p=window.MoonlightGpuSyncProbe.functions['4038720']+512n,info=malloc(64),page=malloc(8);
 try{
  if(call_rop(sdk_base+0x168b0cn,info,page,p)&0x3fffffn)throw Error('Query failed');
  if((Number(read32(info+24n))&5)!==5||p<read64(info)||p+1536n>read64(info)+read64(info+8n))throw Error('Wait code range rejected');
  var bytes=N.copyFrom(p,1536);await log('MOONLIGHT_SYNC_WAIT_TAIL: '+JSON.stringify({address:p.toString(16),hex:Array.from(bytes,function(x){return ('0'+x.toString(16)).slice(-2);}).join('')}));
 }finally{free(page);free(info);}
})();
