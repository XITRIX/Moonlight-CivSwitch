/* Owned independent-display teardown. Destruction remains capability gated until
 * the exact driver/display path has been qualified on console. */
(function(g){
 "use strict";
 var rendererDestroy={buffer:"vkDestroyBuffer",bufferView:"vkDestroyBufferView",image:"vkDestroyImage",fence:"vkDestroyFence",memory:"vkFreeMemory",imageView:"vkDestroyImageView",semaphore:"vkDestroySemaphore",commandPool:"vkDestroyCommandPool",descriptorSetLayout:"vkDestroyDescriptorSetLayout",pipelineLayout:"vkDestroyPipelineLayout",descriptorPool:"vkDestroyDescriptorPool",shaderModule:"vkDestroyShaderModule",pipelineCache:"vkDestroyPipelineCache",pipeline:"vkDestroyPipeline"};
 var displayDestroy={instance:"vkDestroyInstance",device:"vkDestroyDevice",commandPool:"vkDestroyCommandPool",display:"_ZN2nn2vi12CloseDisplayEPNS0_7DisplayE",layer:"_ZN2nn2vi5Layer5CloseEb",surface:"vkDestroySurfaceKHR",swapchain:"vkDestroySwapchainKHR",semaphore:"vkDestroySemaphore",imageView:"vkDestroyImageView"};
 function create(context,report){
  report=report||function(){};
  var entries=[],keys=new Set(),allocations=[],allocationKeys=new Set(),display=null,quarantined=false,failure=null,closed=false,contextRetained=false,inflight=null;
  function pointer(value){var n=BigInt(value);if(n<=0n)throw Error("Cleanup owner has a null handle");return n.toString();}
  function mutable(){if(closed||inflight||quarantined)throw Error("Cleanup ledger cannot accept new owners");}
  function recordAllocation(value){mutable();var p=pointer(value);if(!Number.isSafeInteger(Number(p)))throw Error("Cleanup allocation pointer is not exact");if(!allocationKeys.has(p)){allocationKeys.add(p);allocations.push({handle:p,status:"owned"});}}
  function add(stage,object){
   var handle=pointer(object.handle),key=object.kind+"@"+handle;
   if(keys.has(key))return;
   var destroy=object.destroy;
   if(stage==="renderer"&&object.kind==="allocation"){recordAllocation(handle);return;}
   var expected=(stage==="renderer"?rendererDestroy:displayDestroy)[object.kind];
   if(destroy){
    var name=stage==="renderer"?destroy:destroy.name;
    if(!expected||name!==expected)throw Error("Unexpected cleanup destructor for "+object.kind);
    if(stage==="display"&&(!Array.isArray(destroy.args)||destroy.args.length>3))throw Error("Invalid display cleanup arguments");
   }else if(expected)throw Error("Missing cleanup destructor for "+object.kind);
   if(stage==="display"&&object.kind==="layer")recordAllocation(handle);
   keys.add(key);entries.push({stage:stage,kind:object.kind,name:object.name||object.kind,handle:handle,destroy:destroy&&{name:expected,args:stage==="display"?destroy.args.slice():null},status:destroy?"owned":"borrowed"});
  }
  function recordDisplay(stage){
   mutable();if(!stage)return;
   if(stage.display){display=stage.display;if(display.layer)recordAllocation(display.layer);}
   for(var object of stage.objects||[])add("display",object);
  }
  function recordRenderer(created){mutable();for(var object of created||[])add("renderer",object);}
  function snapshot(){return {closed:closed,contextRetained:contextRetained,quarantined:quarantined,failure:failure,objects:entries.map(function(e){return {stage:e.stage,kind:e.kind,name:e.name,handle:e.handle,status:e.status};}),allocations:allocations.map(function(a){return {handle:a.handle,status:a.status};})};}
  async function emit(value){try{await report(value);}catch(ignored){}}
  async function perform(options){
   if(closed)return snapshot();
   if(quarantined)throw Error("Native cleanup is quarantined: "+failure);
   var owned=entries.filter(function(e){return e.status==="owned";});
   if(options.verifyReleased!==undefined&&typeof options.verifyReleased!=="function")throw Error("Cleanup release verification must be a function");
   if(owned.some(function(e){return e.kind==="swapchain";})&&options.allowSwapchainDestroy!==true)throw Error("Native swapchain destruction is not qualified");
   var d=options.display||display||{};
   // A failed createDisplay exposes its completed objects before a result exists.
   // Recover their owner handles without inventing one or borrowing game state.
   if(!d.device||!d.queue){
    var inferred={};for(var entry of entries)if(entry.stage==="display"&&(entry.kind==="device"||entry.kind==="queue"))inferred[entry.kind]=entry.handle;
    d=Object.assign({},inferred,d);
   }
   if(d&&d.retired)throw Error("Cannot destroy an already retired native layer");
   var renderer=owned.filter(function(e){return e.stage==="renderer";}).reverse();
   // Free command buffers before the resources they reference.
   // Buffers are created before their bound memory; a plain reversal would
   // free that backing memory first. Keep memory until views and buffers die.
   var order=renderer.filter(function(e){return e.kind==="commandPool";}).concat(renderer.filter(function(e){return e.kind!=="commandPool"&&e.kind!=="memory";}),renderer.filter(function(e){return e.kind==="memory";}),owned.filter(function(e){return e.stage==="display";}).reverse());
   // Resolve every destructor before taking any native teardown action.
   var calls=order.map(function(e){
    var args=e.destroy.args?e.destroy.args.map(function(v){return v==="$handle"?BigInt(e.handle):BigInt(v);}):[BigInt(d&&d.device||0),BigInt(e.handle),0n];
    if(e.stage==="renderer"&&args[0]===0n)throw Error("Renderer cleanup has no owning device");
    return {entry:e,address:BigInt(context.resolve(e.destroy.name)),args:args};
   });
   var wait=d.queue?BigInt(context.resolve("vkQueueWaitIdle")):null;
   if(!wait&&owned.some(function(e){return e.stage==="renderer"||e.kind==="swapchain";}))throw Error("Native cleanup has no owning queue");
   try{
    if(options.refresh)await options.refresh.close();
    if(options.present&&options.present.finish)await options.present.finish();
    if(wait){var result=context.call(wait,BigInt(d.queue));if(BigInt.asIntN(32,BigInt(result))!==0n)throw Error("Native display queue did not become idle");}
    for(var call of calls){
     await emit({stage:"cleanup-begin",kind:call.entry.kind,name:call.entry.name});
     context.call.apply(context,[call.address].concat(call.args));call.entry.status="destroyed";
     await emit({stage:"cleanup-complete",kind:call.entry.kind,name:call.entry.name});
    }
    // Report callbacks are observational. Verification must finish while the
    // VI backing memory is still alive, and can veto all remaining releases.
    if(options.verifyReleased)await options.verifyReleased({display:d,snapshot:snapshot()});
    for(var allocation of allocations){if(allocation.status!=="owned")continue;context.release(Number(allocation.handle));allocation.status="released";}
    // Decoder/audio may share this context while a menu replaces the display.
    // Retain only their context lifetime; this ledger's owners are all gone.
    if(options.keepContext===true)contextRetained=true;else context.close();
    closed=true;return snapshot();
   }catch(error){quarantined=true;failure=String(error&&error.message||error);await emit({stage:"cleanup-quarantined",error:failure});throw error;}
  }
  function close(options){
   if(inflight)return inflight;
   var promise=perform(options||{});inflight=promise;
   promise.then(function(){if(inflight===promise)inflight=null;},function(){if(inflight===promise)inflight=null;});
   return promise;
  }
  return {recordDisplay:recordDisplay,recordRenderer:recordRenderer,recordAllocation:recordAllocation,snapshot:snapshot,close:close};
 }
 g.MoonlightNativeCleanup={create:create};
})(typeof window!=="undefined"?window:globalThis);
