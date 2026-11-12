(async function(){
 await log("MOONLIGHT_120HZ_BEGIN");
 var display=window.MoonlightNativeDisplay,refresh=null;
 function report(v){log("MOONLIGHT_120HZ_STAGE "+JSON.stringify(v));}
 try{
  await display.prepare({width:1920,height:1080},report);refresh=await display.refresh(report);
  var selected=await refresh.set(120);if(!selected.ok)throw Error("The checked 120 Hz raise was refused");
  var measurements=[];
  for(var attempt=0;attempt<4;attempt++){
   var result=await display.pattern({width:1920,height:1080,frames:120,report:report});
   var status=await refresh.measured({frames:result.frames,elapsedMs:result.elapsedMs});
   measurements.push({status:status,frames:result.frames,elapsedMs:result.elapsedMs,steadyFps:result.steadyFps});
   if(status==="raised"&&result.steadyFps>=110)break;
   if(status==="failed")throw Error("120 Hz was not confirmed");
  }
  await log("MOONLIGHT_120HZ_RESULT "+JSON.stringify(measurements));
 }finally{if(refresh){await refresh.close();await log("MOONLIGHT_120HZ_RESTORED");}}
 await log("MOONLIGHT_120HZ_COMPLETE");
})();
