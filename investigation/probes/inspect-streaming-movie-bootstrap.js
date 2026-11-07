/* Read-only allocator/bootstrap/enum code for the loaded movie library. */
(async function(){
 var N=window.MoonlightProbeNative;
 async function out(name,value){await log("MOONLIGHT_STREAM_MOVIE_BOOT_"+name+": "+JSON.stringify(value));}
 var globals=[];
 for(var name of Object.keys(N.movieExports)){var m=/^_ZN5movie(\d+)(.*)/.exec(name);if(m&&m[2].charAt(Number(m[1]))==="E"){var e=N.movieExports[name];globals.push({name:name,offset:e.offset,size:e.size});}}
 await out("GLOBALS",globals);
 var ranges=[{offset:0x2b52b70,length:256},{offset:0x2b537f0,length:256},{offset:0x2b61f80,length:192},{offset:0x1ba530,length:512},{offset:0x2b5d3a0,length:768},{offset:0x2b5fba0,length:768},{offset:0x2b5d0d0,length:256},{offset:0x2b5f8d0,length:256},{offset:0x2b521c0,length:736}];
 for(var range of ranges){var bytes=N.copyFrom(N.movieBase+BigInt(range.offset),range.length),hex="";for(var b of bytes)hex+=("0"+b.toString(16)).slice(-2);await out("CODE",{offset:range.offset,length:range.length,hex:hex});}
 delete window.MoonlightProbeNative;await out("END",true);
})();
