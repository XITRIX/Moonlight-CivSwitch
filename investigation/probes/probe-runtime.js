(async function(){
 var native,io,core;
 async function out(name,value){await log("MOONLIGHT_STREAM_"+name+": "+JSON.stringify(value));}
 async function drain(){var deadline=Date.now()+10000;while(core._ml_runtime_tasks()&&Date.now()<deadline){core._ml_runtime_pump(5);await new Promise(function(done){setTimeout(done,2);});}if(core._ml_runtime_tasks())throw Error("Cooperative task deadline exceeded");}
 try{
  var upload=window.__moonlightStreamModuleUpload;if(!upload||upload.parts.length!==upload.count)throw Error("Incomplete stream module");
  var source=upload.parts.join("");if(source.length!==upload.length)throw Error("Stream module length mismatch");
  var factory=new Function(source+"\nreturn MoonlightStreamCore;")();delete window.__moonlightStreamModuleUpload;
  native=window.MoonlightNative.create();io=window.MoonlightStreamIO.create(native);
  core=await factory({moonlightPlatform:{io:io.io,randomFill:io.randomFill,log:function(text){log("MOONLIGHT_STREAM_CORE: "+text);}}});
  await out("RUNTIME_READY",{wasm:typeof WebAssembly,worker:typeof Worker});
  if(core._ml_scheduler_test_start())throw Error("Scheduler test did not start");
  await drain();await out("SCHEDULER",{result:core._ml_scheduler_test_result(),tasks:core._ml_runtime_tasks()});
  if(core._ml_scheduler_test_result()!==42)throw Error("Scheduler test failed");
  var pointer=core._malloc(32);core.stringToUTF8("192.168.1.4",pointer,32);
  try{if(core._ml_network_test_start(pointer,47989))throw Error("Network test did not start");await drain();}
  finally{core._free(pointer);}
  await out("NATIVE_NETWORK",{result:core._ml_network_test_result(),stats:io.stats});
  if(core._ml_network_test_result()!==42)throw Error("Native socket adapter test failed");
  await out("RUNTIME_PASSED",true);
 }catch(error){await out("ERROR",String(error&&error.stack||error));}
 finally{if(io)io.close();delete window.__moonlightStreamModuleUpload;await out("RUNTIME_END",true);}
})();
