/* Read-only backend guard and service-discovery exports; no service requests. */
(async function(){
 var N=window.MoonlightProbeNative;
 await log("MOONLIGHT_STREAM_MOVIE_ADMISSION_SM: "+JSON.stringify(Object.keys(N.exports).filter(function(name){return /_ZN2nn2sm/.test(name);}).map(function(name){var e=N.exports[name];return {name:name,offset:e.offset,size:e.size};})));
 for(var region of [[0x14da20,1024],[0x2b61ff0,192],[0x2b69b60,272],[0x36497a4,32]]){
  var bytes=N.copyFrom(N.movieBase+BigInt(region[0]),region[1]),hex="";
  for(var b of bytes)hex+=("0"+b.toString(16)).slice(-2);
  await log("MOONLIGHT_STREAM_MOVIE_ADMISSION_CODE: "+JSON.stringify({offset:region[0].toString(16),length:bytes.length,hex:hex}));
 }
 delete window.MoonlightProbeNative;await log("MOONLIGHT_STREAM_MOVIE_ADMISSION_END: true");
})();
