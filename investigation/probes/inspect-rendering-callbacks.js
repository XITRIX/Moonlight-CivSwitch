/* Read API callback metadata using the same validated V8 layout as the loader. */
(async function(){
 var N=window.MoonlightProbeNative,seen={};
 function pointer(object,offset){var p=read32_compressed(object+offset);if(!(p&1n)||p<0x1001n)throw Error("Not a tagged metadata pointer");return p-1n;}
 function template(fn){var f=addrof_compressed(fn),s=pointer(f,12n);return pointer(s,4n);}
 var expectedMap=read32_compressed(template(window.v8Version));
 for(var pair of [["requestPortrait",WorldUI.requestPortrait],["releasePortrait",WorldUI.releasePortrait],["getAssetNames",WorldUI.getAssetNames],["getIconURL",UI.getIconURL]]){
  try{
   var t=template(pair[1]);if(read32_compressed(t)!==expectedMap)throw Error("Different function template layout");
   var h=pointer(t,24n),foreign=pointer(h,4n),entry=read64_compressed(foreign+4n),data=read32_compressed(h+12n),words=[];
   if(data&1n){for(var i=0;i<8;i++)words.push(read32_compressed(data-1n+BigInt(i*4)).toString(16));}
   await log("MOONLIGHT_RENDER_CALLBACK: "+JSON.stringify({name:pair[0],offset:(entry-main_base).toString(16),data:data.toString(16),dataWords:words}));
   if(entry>=main_base&&entry<main_base+0x3800000n&&!seen[entry.toString()]){seen[entry.toString()]=true;var bytes=N.copyFrom(entry,2048),hex="";for(var b of bytes)hex+=("0"+b.toString(16)).slice(-2);await log("MOONLIGHT_RENDER_CALLBACK_CODE: "+JSON.stringify({offset:(entry-main_base).toString(16),hex:hex}));}
  }catch(error){await log("MOONLIGHT_RENDER_CALLBACK_ERROR: "+pair[0]+" "+String(error));}
 }
 delete window.MoonlightProbeNative;await log("MOONLIGHT_RENDER_CALLBACK_END: true");
})();
