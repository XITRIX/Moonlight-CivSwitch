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
  var framework=main_base+0x5e7bba0n;await dump("framework",framework,512);var vtable=read64(framework);await dump("framework-vtable",vtable,0x180);var entry=read64(vtable+0x140n);await dump("framework-provider-getter",entry,512);
  await dump("portrait-map",main_base+0x4bbd68n,1024);
  await dump("renoir-init2",main_base+0x22142b0n,2048);
  await log("MOONLIGHT_RENDER_GLOBAL_OBJECTS: "+JSON.stringify(Object.getOwnPropertyNames(window).filter(function(n){return /graphics|debug|asset|render|image|texture|camera|view|surface/i.test(n);})));
  if(UI.Debug){var names=[],obj=UI.Debug;for(var i=0;obj&&i<2;i++,obj=Object.getPrototypeOf(obj))names=names.concat(Object.getOwnPropertyNames(obj));await log("MOONLIGHT_RENDER_DEBUG: "+JSON.stringify(names));}
 }finally{for(var p of allocations.reverse())free(p);await log("MOONLIGHT_RENDER_DISPATCH_END: true");}
})();
