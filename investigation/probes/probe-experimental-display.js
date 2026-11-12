(async function(){
 await log("MOONLIGHT_NATIVE_1080_BEGIN");
 try{
  var report=await window.MoonlightNativeDisplay.pattern({width:1920,height:1080,frames:120,report:function(value){log("MOONLIGHT_DISPLAY_STAGE "+JSON.stringify(value));}});
  await log("MOONLIGHT_NATIVE_1080_RESULT "+JSON.stringify(report));
  await log("MOONLIGHT_NATIVE_1080_COMPLETE");
 }catch(error){await log("MOONLIGHT_NATIVE_1080_ERROR "+String(error.stack||error).slice(0,1400));throw error;}
})();
