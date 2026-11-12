(async function(){
 await log("MOONLIGHT_LAYER_EXPORTS_BEGIN");
 var c=window.MoonlightNativeContext.create();
 try{for(var entry of c.findSymbols(/2vi.*(SetLayer|SetNext|Visibility|Visible|Position|Scale)/))await log("MOONLIGHT_LAYER_EXPORT "+JSON.stringify({name:entry.name,offset:entry.offset,size:entry.size,hex:entry.hex}));}
 finally{c.close();}
 await log("MOONLIGHT_LAYER_EXPORTS_COMPLETE");
})();
