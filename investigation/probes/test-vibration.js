/* Two finite quarter-strength bands through the production controller adapter. */
(async function(){
 var previousNative=window.MoonlightNative,adapter=null,lastError=null;
 try{
  window.MoonlightNative={available:true,create:function(){return {resolveNativeSymbol:window.MoonlightProbeNative.resolve};}};
  adapter=window.MoonlightControllerInput.createNative({onRumbleError:function(error){lastError=error;}});
  if(!adapter||!adapter.rumbleSupported||!adapter.poll())throw Error("No connected vibration-capable native controller");
  if(!adapter.rumble(0,16384,0))throw lastError||Error("Low-band vibration was not accepted");
  await new Promise(function(resolve){setTimeout(resolve,200);});
  adapter.stopRumble();
  await new Promise(function(resolve){setTimeout(resolve,150);});
  if(!adapter.rumble(0,0,16384))throw Error("High-band vibration was not accepted");
  await new Promise(function(resolve){setTimeout(resolve,200);});
  adapter.stopRumble();
  await log("VIBRATION_PULSE_DONE: two 200ms bands at quarter strength; native calls succeeded and motors stopped");
 }finally{
  if(adapter)adapter.close();
  window.MoonlightNative=previousNative;delete window.MoonlightProbeNative;
 }
})();
