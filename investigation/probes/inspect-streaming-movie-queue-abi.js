/* Read-only queue/factory inspection before decoding a frame. */
(async function(){
 var N=window.MoonlightProbeNative;
 async function out(name,value){await log("MOONLIGHT_STREAM_MOVIE_QUEUE_"+name+": "+JSON.stringify(value));}
 var table=read64(N.movieBase+0x40385a8n)+16n;
 for(var slot of [0x10,0x58,0x70]){var address=read64(table+BigInt(slot)),offset=address-N.movieBase,bytes=N.copyFrom(address,1536),hex="";for(var b of bytes)hex+=("0"+b.toString(16)).slice(-2);await out("CODE",{slot:slot,offset:offset.toString(16),length:bytes.length,hex:hex});}
 var bytes=N.copyFrom(N.movieBase+0x2b591c0n,2048),hex="";for(var b of bytes)hex+=("0"+b.toString(16)).slice(-2);await out("CODE",{slot:"factory",offset:"2b591c0",length:bytes.length,hex:hex});
 delete window.MoonlightProbeNative;await out("END",true);
})();
