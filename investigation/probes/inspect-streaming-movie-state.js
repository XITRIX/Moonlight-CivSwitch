/* Read-only native movie bootstrap state and resolved external calls. */
(async function(){
 var N=window.MoonlightProbeNative;
 async function out(name,value){await log("MOONLIGHT_STREAM_MOVIE_STATE_"+name+": "+JSON.stringify(value));}
 await out("NVIDIA_STATE",{referenceCount:read64(N.movieBase+0x4149068n).toString(),handle:Number(read32(N.movieBase+0x4149058n))});
 var ranges=[{offset:0x2b53aa0,length:256},{offset:0x2bd25d0,length:96},{offset:0x2bd2600,length:64},{offset:0x2bdb600,length:32},{offset:0x2b5d0d0,length:320},{offset:0x2b5f8d0,length:320}];
 for(var range of ranges){var bytes=N.copyFrom(N.movieBase+BigInt(range.offset),range.length),hex="";for(var b of bytes)hex+=("0"+b.toString(16)).slice(-2);await out("CODE",{offset:range.offset,length:range.length,hex:hex});}
 var symbols=Object.keys(N.exports).filter(function(name){return /^(?:nv|Nv)|_ZN2nv|_ZN2nn5codec5video/.test(name);});
 await out("NVIDIA_EXPORTS",symbols.map(function(name){var e=N.exports[name];return {name:name,offset:e.offset,size:e.size};}));
 delete window.MoonlightProbeNative;await out("END",true);
})();
