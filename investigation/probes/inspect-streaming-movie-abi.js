/* Read-only multimedia ABI inventory and bounded code slices. */
(async function(){
 var N=window.MoonlightProbeNative;
 async function out(name,value){await log("MOONLIGHT_STREAM_MOVIE_"+name+": "+JSON.stringify(value));}
 var names=Object.keys(N.movieExports).filter(function(name){return /^(?:_ZNK?5movie.*(?:MediaData|Buffer|Decoder)|_ZN5movie.*(?:Initialize|Finalize))/.test(name);});
 await out("EXPORTS",names.map(function(name){var e=N.movieExports[name];return {name:name,offset:e.offset,size:e.size};}));
 var targets=names.filter(function(name){return /DecoderC1|Decoder9Configure|Decoder5Start|Decoder.*Acquire|Decoder.*Buffer|MediaDataC1|MediaData.*Set|MediaData.*Get|BufferC1|Buffer.*Get|Initialize/.test(name)&&!/_ZTS|_ZTI|_ZTV/.test(name);});
 var total=0;
 for(var name of targets){var e=N.movieExports[name];if(!e.size||e.size>5000||total+e.size>40000)continue;var bytes=N.copyFrom(e.address,e.size),hex="";for(var b of bytes)hex+=("0"+b.toString(16)).slice(-2);await out("CODE",{name:name,offset:e.offset,length:e.size,hex:hex});total+=e.size;}
 delete window.MoonlightProbeNative;await out("END",true);
})();
