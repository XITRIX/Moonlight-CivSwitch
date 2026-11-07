/* Native SDK thread lifecycle, only after ABI and priority validation. */
(async function(){
 var N=window.MoonlightProbeNative;
 async function out(name,value){await log("MOONLIGHT_STREAM_EXEC_"+name+": "+JSON.stringify(value));}
 function pause(ms){return new Promise(function(done){setTimeout(done,ms);});}
 function result(v){return "0x"+Number(v&0x3fffffn).toString(16);}
 var thread=malloc(1024),stackAllocation=malloc(65536+4096),created=false,completed=false;
 try{
  var stack=(stackAllocation+4095n)&~4095n;
  // Existing GetSystemTick is a leaf routine, ignores its argument and returns immediately.
  // No JavaScript/ROP callback is entered from the new thread.
  await out("THREAD_ATTEMPT",{sdkPriority:0,kernelPriority:28,stackBytes:65536,threadObjectBytes:1024});
  var createdResult=N.call("_ZN2nn2os12CreateThreadEPNS0_10ThreadTypeEPFvPvES3_S3_mi",[thread,N.resolve("_ZN2nn2os13GetSystemTickEv"),0,stack,65536,0]);
  created=(createdResult&0x3fffffn)===0n;
  await out("THREAD_CREATE",{result:result(createdResult),created:created});
  if(created){
   N.call("_ZN2nn2os11StartThreadEPNS0_10ThreadTypeE",[thread]);
   var deadline=Date.now()+1000;
   while(Date.now()<deadline){if(N.call("_ZN2nn2os13TryWaitThreadEPNS0_10ThreadTypeE",[thread])){completed=true;break;}await pause(10);}
   await out("THREAD_COMPLETE",completed);
   if(completed){N.call("_ZN2nn2os10WaitThreadEPNS0_10ThreadTypeE",[thread]);N.call("_ZN2nn2os13DestroyThreadEPNS0_10ThreadTypeE",[thread]);}
  }
 }catch(error){await out("THREAD_ERROR",String(error.message||error));}
 finally{if(!created||completed){free(thread);free(stackAllocation);}else await out("THREAD_ALLOCATION_RETAINED","An unfinished thread's stack cannot be freed safely");}
 delete window.MoonlightProbeNative;await out("THREAD_END",true);
})();
