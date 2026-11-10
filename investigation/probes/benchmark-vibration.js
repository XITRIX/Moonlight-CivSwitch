/* Finite timing of production rumble output; requires an idle console. */
(async function(){
 var previous=window.MoonlightNative,adapter=null,lastError=null;
 function now(){return window.performance&&typeof window.performance.now==="function"?window.performance.now():Date.now();}
 function summary(values){var sorted=values.slice().sort(function(a,b){return a-b;});return {count:values.length,meanMs:values.reduce(function(a,b){return a+b;},0)/values.length,p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted[sorted.length-1]};}
 try{
  window.MoonlightNative={available:true,create:function(){return {resolveNativeSymbol:window.MoonlightProbeNative.resolve};}};
  adapter=window.MoonlightControllerInput.createNative({onRumbleError:function(error){lastError=error;}});
  if(!adapter||!adapter.rumbleSupported||!adapter.poll())throw Error("No connected native controller");
  var begin=now();if(!adapter.rumble(0,8192,8192))throw lastError||Error("Rumble unavailable");var initializationMs=now()-begin;
  var changed=[],unchanged=[];
  for(var i=0;i<60;i++){
   var strength=i%2?8192:12288;
   begin=now();if(!adapter.rumble(0,strength,strength))throw lastError||Error("Rumble failed");changed.push(now()-begin);
   begin=now();adapter.rumble(0,strength,strength);unchanged.push(now()-begin);
   await new Promise(function(resolve){setTimeout(resolve,25);});
  }
  adapter.stopRumble();
  await log("VIBRATION_TIMING_DONE: "+JSON.stringify({initializationMs:initializationMs,changed:summary(changed),unchanged:summary(unchanged),streamRunning:false}));
 }finally{if(adapter)adapter.close();window.MoonlightNative=previous;delete window.MoonlightProbeNative;}
})();
