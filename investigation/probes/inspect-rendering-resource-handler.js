/* Bounded reads of known binding code and the current UI binding environment. */
(async function(){
 var allocations=[],info=malloc(64),page=malloc(8);allocations.push(info,page);
 function query(p){if(call_rop(sdk_base+0x168b0cn,info,page,p)&0x3fffffn)return null;return {base:read64(info),end:read64(info)+read64(info+8n),permissions:Number(read32(info+24n))};}
 function readable(p,n){var q=query(p);return q&&(q.permissions&1)&&p>=q.base&&p+BigInt(n)<=q.end;}
 function bytes(p,n){if(!readable(p,n))throw Error("Rejected native read range");var b=new Uint8Array(n),v=new DataView(b.buffer);for(var i=0;i+8<=n;i+=8)v.setBigUint64(i,read64(p+BigInt(i)),true);return b;}
 function hex(b){return Array.from(b,function(v){return ("0"+v.toString(16)).slice(-2);}).join("");}
 async function dump(name,p,n){await log("MOONLIGHT_RENDER_SLICE: "+JSON.stringify({name:name,offset:(p-main_base).toString(16),permissions:query(p).permissions,hex:hex(bytes(p,n))}));}
 try{
  if(read32(sdk_base+0x168b10n)!==0xd40000c1n)throw Error("Unknown memory query ABI");
  var framework=main_base+0x5e7bba0n;
  function pointer(p){if(!readable(p,8))throw Error("Rejected pointer read");return read64(p);}
  for(var field of [0x178,0x188]){
   var p=pointer(framework+BigInt(field));if(!readable(p,64))continue;
   await log("MOONLIGHT_RENDER_OBJECT: "+JSON.stringify({field:field.toString(16)}));await dump("framework-field-"+field.toString(16),p,64);
   if(field===0x178){var vt=pointer(p);if(!readable(vt,64))continue;await dump("resource-handler-vtable",vt,64);
    for(var i=0;i<8;i++){var fn=pointer(vt+BigInt(i*8)),q=query(fn);if(fn>=main_base&&fn<main_base+0x3800000n&&q&&(q.permissions&5)===5)await dump("resource-handler-method-"+i,fn,4096);}
   }
  }
  await dump("live-images-invalidate",main_base+0x4bcb60n,128);

 }finally{for(var p of allocations.reverse())free(p);await log("MOONLIGHT_RENDER_DISPATCH_END: true");}
})();
