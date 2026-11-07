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
  await dump("dispatch",main_base+0x21603f0n,4096);
  var current=main_base+0x242f058n;if(read32(current)!==0x900342c8n)throw Error("Unknown GetCurrent ABI");
  var isolate=call_rop(current);if(!readable(isolate,64))throw Error("Invalid current isolate");
  var environment=read64(isolate+8n);await log("MOONLIGHT_RENDER_ENVIRONMENT: "+JSON.stringify({isolate:isolate.toString(16),environment:environment.toString(16)}));
  if(readable(environment,256))await dump("environment",environment,256);
  for(var pair of [["requestPortrait",WorldUI.requestPortrait],["releasePortrait",WorldUI.releasePortrait],["getIconURL",UI.getIconURL]]){
   var fn=addrof_compressed(pair[1]),sfi=read32_compressed(fn+12n)-1n,fti=read32_compressed(sfi+4n)-1n,chi=read32_compressed(fti+24n)-1n,data=read32_compressed(chi+12n)-1n;
   var tagged=read32_compressed(data+12n);if(tagged&1n){var foreign=tagged-1n,p=read64_compressed(foreign+4n);if(readable(p,128))await dump(pair[0]+"-data",p,128);}
  }
 }finally{for(var p of allocations.reverse())free(p);await log("MOONLIGHT_RENDER_DISPATCH_END: true");}
})();
