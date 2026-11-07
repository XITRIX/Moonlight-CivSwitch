(async function(){
 var N=window.MoonlightProbeNative;
 for(var pair of [['sdk',N.exports],['movie',N.movieExports]]){
  var matches=[];for(var name of Object.keys(pair[1]))if(/RGBA|BGRA|NV12|YUV|ColorConvert|ConvertColor|PixelConvert|Swizzle|ScaleImage|ResizeImage|yuv|I420|ARGB/.test(name))matches.push({name:name,offset:pair[1][name].offset,size:pair[1][name].size});
  await log('MOONLIGHT_COLOR_FUNCTIONS: '+JSON.stringify({module:pair[0],matches:matches}));
 }
 // Read the decoder output-enum conversion table; no decoder calls.
 var values=[];for(var i=0;i<5;i++)values.push(Number(read32(N.movieBase+0x36497a4n+BigInt(i*4))));
 await log('MOONLIGHT_COLOR_FORMAT_TABLE: '+JSON.stringify(values));
})();
