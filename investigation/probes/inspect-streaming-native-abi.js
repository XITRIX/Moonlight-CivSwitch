/* Read-only bounded code slices for ABI verification before calling new APIs. */
(async function(){
 var N=window.MoonlightProbeNative;
 async function out(name,value){await log("MOONLIGHT_STREAM_ABI_"+name+": "+JSON.stringify(value));}
 var ranges=[{offset:0x1dc3f0,length:0x1140},{offset:0x13ec30,length:380},{offset:0x374c50,length:268},{offset:0x13dcc4,length:888},{offset:0x168a00,length:0x800},{offset:0x14cc90,length:368},{offset:0x137ea4,length:528},{offset:0x136d20,length:88}];
 for(var range of ranges){var bytes=N.copyFrom(sdk_base+BigInt(range.offset),range.length),hex="";for(var b of bytes)hex+=("0"+b.toString(16)).slice(-2);await out("CODE",{offset:range.offset,length:range.length,hex:hex});}
 var names=Object.keys(N.exports).filter(function(n){return /sm.*(GetServiceHandle|GetService|ServiceName)|CloseHandle|QueryMemory|SetMemoryPermission|Invalidate.*Cache|Flush.*Cache|codec.*[Oo]pus|Decoder|nvnDeviceGetProcAddress|nvnBootstrapLoader/.test(n);});
 await out("EXPORTS",names.map(function(n){return {name:n,offset:N.exports[n].offset,size:N.exports[n].size};}));
 delete window.MoonlightProbeNative;await out("END",true);
})();
