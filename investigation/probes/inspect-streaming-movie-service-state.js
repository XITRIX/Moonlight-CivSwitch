/* Read-only decoder service name/state and dispatch path. */
(async function(){
 var N=window.MoonlightProbeNative,text="";
 for(var i=0;i<64;i++){var b=Number(read8(N.movieBase+0x3252908n+BigInt(i)));if(!b)break;text+=String.fromCharCode(b);}
 await log("MOONLIGHT_STREAM_MOVIE_SERVICE_STATE: "+JSON.stringify({name:text,initialized:Number(read8(N.movieBase+0x4140208n)),references:read64(N.movieBase+0x41402d0n).toString(),light:Number(read8(N.movieBase+0x41402d8n))}));
 var bytes=N.copyFrom(N.movieBase+0x14c760n,1536),hex="";for(var b of bytes)hex+=("0"+b.toString(16)).slice(-2);
 await log("MOONLIGHT_STREAM_MOVIE_SERVICE_CODE: "+JSON.stringify({offset:"14c760",length:bytes.length,hex:hex}));
 delete window.MoonlightProbeNative;await log("MOONLIGHT_STREAM_MOVIE_SERVICE_END: true");
})();
