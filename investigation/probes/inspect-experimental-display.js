(async function(){
 "use strict";
 await log("MOONLIGHT_EXPERIMENTAL_INSPECT_BEGIN");
 var context=null;
 try{
  context=window.MoonlightNativeContext.create();
  var report=await context.inspect();
  await log("MOONLIGHT_EXPERIMENTAL_INSPECT "+JSON.stringify(report));
  context.close();context=null;
  await log("MOONLIGHT_EXPERIMENTAL_INSPECT_COMPLETE");
 }catch(error){await log("MOONLIGHT_EXPERIMENTAL_INSPECT_ERROR "+String(error.stack||error).slice(0,1400));throw error;}
 finally{if(context)try{context.close();}catch(error){await log("MOONLIGHT_EXPERIMENTAL_INSPECT_CLEANUP "+String(error.message||error));}}
})();
