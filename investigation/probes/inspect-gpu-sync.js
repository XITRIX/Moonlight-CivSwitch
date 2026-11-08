/* Read-only: resolve the existing decoder's NVN function-pointer cells. */
(async function(){
 var N=window.MoonlightProbeNative,info=malloc(64),page=malloc(8);
 function range(p,n,perm){if(call_rop(sdk_base+0x168b0cn,info,page,p)&0x3fffffn)throw Error('Query failed');var b=read64(info),end=b+read64(info+8n);if((Number(read32(info+24n))&perm)!==perm||p<b||p+BigInt(n)>end)throw Error('Sync pointer range rejected');}
 try{
  if(read32(sdk_base+0x168b10n)!==0xd40000c1n)throw Error('Query ABI mismatch');
  var functions={};
  for(var offset of [0x4038610,0x4038638,0x4038698,0x40386f8,0x4038708,0x4038710,0x4038718,0x4038720,0xd957080]){
   var cell=N.movieBase+BigInt(offset);range(cell,8,1);var pointer=read64(cell);range(pointer,8,1);var target=offset===0xd957080?pointer:read64(pointer);range(target,512,5);functions[offset.toString(16)]=target;
   var names=[];for(var name of Object.keys(N.exports))if(N.exports[name].address===target)names.push(name);
   var bytes=N.copyFrom(target,512);
   await log('MOONLIGHT_SYNC_CODE: '+JSON.stringify({cell:offset.toString(16),address:target.toString(16),sdkOffset:(target-sdk_base).toString(16),names:names,hex:Array.from(bytes,function(x){return ('0'+x.toString(16)).slice(-2);}).join('')}));
  }
  window.MoonlightGpuSyncProbe={functions:functions,movieBase:N.movieBase};
 }finally{free(page);free(info);}
})();
