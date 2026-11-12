(async function(){
 await log("MOONLIGHT_NATIVE_RETURN_BEGIN");
 await window.MoonlightNativeDisplay.retire();
 await log("MOONLIGHT_NATIVE_RETURN_COMPLETE "+JSON.stringify({retained:!!window.__moonlightNativeGraphics,retired:window.__moonlightNativeGraphics.retired}));
})();
