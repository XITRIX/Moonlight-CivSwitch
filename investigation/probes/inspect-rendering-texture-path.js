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
  for(var entry of [["portrait-register",0x4bbb90,4096],["framework-get",0x4a7050,1024],["portrait-asset",0x1726f70,4096],["release-portrait",0x4820b0,1024],["renoir-create-buffer",0x221e0a4,1024],["renoir-init",0x22141e8,1024]])await dump(entry[0],main_base+BigInt(entry[1]),entry[2]);
 }finally{for(var p of allocations.reverse())free(p);await log("MOONLIGHT_RENDER_DISPATCH_END: true");}
})();
