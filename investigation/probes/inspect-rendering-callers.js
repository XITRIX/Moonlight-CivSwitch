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
  var buffer=new Uint8Array(262144),view=new DataView(buffer.buffer),words=new Uint32Array(buffer.buffer),targets=new Set([0x4bbb90,0x4bbd68,0x4bcbe0,0x4c4518]);
  var state=window.__moonlightRenderCodeScan||{offset:0,matches:[]},matches=state.matches,begin=Date.now();
  window.__moonlightRenderCodeScan=state;
  await log("MOONLIGHT_RENDER_SCAN_BEGIN: "+state.offset.toString(16));
  while(state.offset<0x3800000&&Date.now()-begin<35000){var offset=state.offset,address=main_base+BigInt(offset),q=query(address);if(!q||q.end<=address)break;var length=Number(q.end-address);if((q.permissions&5)!==5){state.offset+=Math.min(length,0x3800000-offset);continue;}length=Math.min(length,buffer.length,0x3800000-offset)&~7;if(!length)break;
   for(var i=0;i<length;i+=8)view.setBigUint64(i,read64(address+BigInt(i)),true);
   for(var i=0;i<length/4;i++){var word=words[i],kind=word>>>26;if(kind!==37&&kind!==5)continue;var dest=offset+i*4+((word<<6)>>4);if(targets.has(dest)){var pc=offset+i*4,start=-1;for(var j=i-1;j>=Math.max(0,i-512);j--){var op=words[j];if(((op&0xffc07fff)>>>0)===0xa9807bfd){start=offset+j*4;if(j>0&&((words[j-1]&0xffc003ff)>>>0)===0xd10003ff)start-=4;break;}}matches.push({pc:pc.toString(16),target:dest.toString(16),start:start>=0?start.toString(16):null});}}
   state.offset+=length;
   if((state.offset&0x3fffff)===0)await log("MOONLIGHT_RENDER_SCAN_PROGRESS: "+state.offset.toString(16));
   await new Promise(function(r){setTimeout(r,0);});
  }
  await log("MOONLIGHT_RENDER_SCAN_STATE: "+JSON.stringify({offset:state.offset.toString(16),complete:state.offset>=0x3800000,elapsedMs:Date.now()-begin}));
  await log("MOONLIGHT_RENDER_CALLERS: "+JSON.stringify(matches));
  var framework=main_base+0x5e7bba0n,provider=read64(framework+0x180n);if(readable(provider,256))await dump("live-provider",provider,256);

 }finally{for(var p of allocations.reverse())free(p);await log("MOONLIGHT_RENDER_DISPATCH_END: true");}
})();
