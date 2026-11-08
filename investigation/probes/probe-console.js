/* Runs uploaded wasm2js C code; no Switch filesystem calls or network session. */
(async function(){
 var N=window.MoonlightProbeNative,upload=window.__moonlightWasm2jsUpload,addedPerformance=false,core;
 async function out(name,value){await log("MOONLIGHT_WASM2JS_"+name+": "+JSON.stringify(value));}
 try{
  if(!upload||upload.parts.length!==upload.count)throw Error("Incomplete core upload");
  var source=upload.parts.join("");if(source.length!==upload.length)throw Error("Core upload length mismatch");
  await out("ENVIRONMENT",{webAssembly:typeof WebAssembly,worker:typeof Worker,sourceBytes:source.length,sha256:upload.sha256});
  if(typeof window.performance==="undefined"){window.performance={now:function(){return Date.now();}};addedPerformance=true;}
  var start=Date.now(),factory=new Function(source+"\nreturn MoonlightCore;")();
  core=await factory({
   print:function(){},printErr:function(){},
   moonlightPlatform:{randomFill:function(target){
    if(target.length>4096)throw Error("Entropy request exceeds probe bound");
    var pointer=malloc(target.length);
    try{N.call("_ZN2nn6crypto36GenerateCryptographicallyRandomBytesEPvm",[pointer,target.length]);target.set(N.copyFrom(pointer,target.length));}
    finally{free(pointer);}
   }}
  });
  await out("INITIALIZED",{elapsedMs:Date.now()-start,upstreamExports:Object.keys(core).filter(function(k){return /^_Li/.test(k)&&typeof core[k]==="function";}).length});
  for(var name of ["rtsp","fec","crypto"]){
   await new Promise(function(resolve){setTimeout(resolve,0);});start=Date.now();
   var result=core["_ml_test_"+name]();await out(name.toUpperCase(),{result:result,elapsedMs:Date.now()-start});
   if(result!==0)throw Error(name+" failed with "+result);
  }
  var pointer=core._malloc(64);
  try{var result=core._ml_random_probe(pointer,64),values={};for(var b of core.HEAPU8.subarray(pointer,pointer+64))values[b]=true;await out("ENTROPY",{result:result,distinctBytes:Object.keys(values).length});if(result||Object.keys(values).length<8)throw Error("Entropy probe failed");}
  finally{core._free(pointer);}
  await out("THREAD_BACKEND",{result:core._ml_probe_threads(),expected:"nonzero: scheduler adapter still required"});
  await out("PASSED",true);
 }catch(error){await out("ERROR",String(error&&error.stack||error));}
 finally{
  delete window.__moonlightWasm2jsUpload;delete window.MoonlightProbeNative;
  if(addedPerformance)delete window.performance;
  await out("END",true);
 }
})();
