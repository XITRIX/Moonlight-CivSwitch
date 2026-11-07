/* Read-only codec enum conversion and backend initialization inspection. */
(async function(){
 var N=window.MoonlightProbeNative;
 for(var region of [[0x2b621f0,256],[0x2b9c250,3072],[0x2b5ec90,768]]){
  var bytes=N.copyFrom(N.movieBase+BigInt(region[0]),region[1]),hex="";
  for(var b of bytes)hex+=("0"+b.toString(16)).slice(-2);
  await log("MOONLIGHT_STREAM_MOVIE_BACKEND_CODE: "+JSON.stringify({offset:region[0].toString(16),length:bytes.length,hex:hex}));
 }
 delete window.MoonlightProbeNative;
 await log("MOONLIGHT_STREAM_MOVIE_BACKEND_END: true");
})();
