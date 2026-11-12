/* Video presentation on the shared native UI display. The raw-loader fallback
 * owns a retained VI/Vulkan display because return to the game UI is unqualified.
 * Streaming resources are tracked separately from the resident display owner. */
(function(g){
 "use strict";
 var state=g.__moonlightNativeGraphics||null;
 function word(context,p,value){context.native.write32(BigInt(p),BigInt(value>>>0));}
 // The streaming shaders read mapped pixels and controls directly. Complete
 // the previous submit before changing either, but overlap it with protocol work.
 function finishPresentation(){
  if(!state||!state.present)return;
  if(state.failed)throw Error("Native display completion is uncertain; restart Civ VII");
  try{state.present.finish();}catch(error){state.failed=true;throw error;}
 }
 function configurePresentation(){
  state.configuration.deferWait=true;
  var c=state.context,native=g.MoonlightNativeContext.checkedCalls(c,state.configuration.functions);
  var present=g.MoonlightNativeModules.presentation.createPresentation(native,state.configuration);
  state.present=function(slot,interactive){
   finishPresentation();
   try{return present(slot,interactive);}catch(error){state.failed=true;throw error;}
  };
  state.present.finish=present.finish;state.present.timings=present.timings;
  state.presentationVersion=2;
 }
 async function prepare(size,report){
  report=report||function(){};
  var shared=g.CivNanoVGSession&&g.CivNanoVGSession.current;
  if(state){
   if(state.failed||state.retired)throw Error("Restart Civ VII before another native stream");
   if(state.shared&&state.shared!==shared)throw Error("The native UI session changed; restart Civ VII");
   if(!state.shared&&(state.size.width!==size.width||state.size.height!==size.height))throw Error("Restart Civ VII to change the native display size");
   // Ordered app updates can retain the previous synchronous presenter.
   if(!state.configuration.deferWait||state.presentationVersion!==2){finishPresentation();configurePresentation();}
   if(state.shared)bindUi();return state;
  }
  var m=g.MoonlightNativeModules,c=shared?shared.renderer.owner.context:g.MoonlightNativeContext.create();
  if(shared)size=shared.renderer.owner.display.size;
  state={context:c,shared:shared,size:{width:size.width,height:size.height},failed:false,ready:false};g.__moonlightNativeGraphics=state;
  state.ledger=g.MoonlightNativeCleanup.create(c);
  var allocate=c.rpc.allocate;
  // Record even allocations made before createDisplay can return its partial
  // owner list. Decoder allocations begin after this scoped wrapper is removed.
  c.rpc.allocate=async function(bytes,options){var p=await allocate(bytes,options);state.ledger.recordAllocation(p);return p;};
  try{
   var info=await c.rpc.request({command:"module-probe",name:"nnCompat"});
   if(info.hash!==m.compatTable.module.hash)throw Error("Unsupported native display build");
   report({stage:"display",size:size,viewport:{width:g.innerWidth,height:g.innerHeight}});
   state.displayStage=shared?shared.renderer.owner.displayStage:await m.display.createDisplay(c.rpc,{resolve:c.resolve,size:size});
   if(!shared)state.ledger.recordDisplay(state.displayStage);
   state.display=state.displayStage.display;
   report({stage:"display-open",size:state.display.size,images:state.display.imageCount});
   state.renderer=await m.pipelines.createRendererPipelines(c.rpc,{display:state.display,renderer:m.renderer,resolve:c.resolve,cache:false,onCreated:async function(objects){state.ledger.recordRenderer(objects);}});
   state.ledger.recordRenderer(state.renderer.created);
   var gpu=state.renderer.gpu,menu=state.renderer.menu,layout=m.layout;
   state.storage=gpu.privateStorage.mapped;state.input=menu.controls.mapped;
   // Native mapped storage must start at zero. Bounded chunks keep the JS heap small.
   var zero=new Uint8Array(65536);
   for(var at=0;at<gpu.privateStorage.bytes;at+=zero.length)c.write(state.storage+at,zero.subarray(0,Math.min(zero.length,gpu.privateStorage.bytes-at)));
   c.write(state.input,new Uint8Array(menu.controls.bytes));
   for(var field of ["width","backingWidth"])word(c,state.storage+layout.TARGET[field],size.width);
   for(var field of ["height","backingHeight"])word(c,state.storage+layout.TARGET[field],size.height);
   state.presentMemory=await c.rpc.allocate(4096);
   var names={acquire:"vkAcquireNextImage2KHR",submit:"vkQueueSubmit",present:"vkQueuePresentKHR",wait:"vkQueueWaitIdle",waitFences:"vkWaitForFences",resetFences:"vkResetFences"},functions={};
   for(var key of Object.keys(names))functions[key]="0x"+BigInt(c.resolve(names[key])).toString(16);
   state.configuration={memory:state.presentMemory,functions:functions,device:menu.resources.device,queue:menu.resources.queue,swapchain:menu.resources.swapchain,
    acquired:menu.resources.acquired,commands:gpu.commands[0],semaphores:menu.resources.semaphores,slots:gpu.slots,deferWait:true};
   configurePresentation();
   state.sequence=0;state.ready=true;bindUi();
   report({stage:"renderer-ready",size:size,sampling:gpu.video.path,storageBytes:gpu.privateStorage.bytes});
   return state;
  }catch(error){
   if(error.objects)state.ledger.recordDisplay({objects:error.objects});
   if(error.created)state.ledger.recordRenderer(error.created);
   state.failed=true;state.error=String(error.message||error);throw error;
  }finally{c.rpc.allocate=allocate;}
 }
 function bindUi(){
  if(!state.shared||state.surface)return;
  state.overlayActive=false;
  state.surface=state.shared.renderer.bindSurface(function(frame){
   var l=g.MoonlightNativeModules.layout,c=state.context;
   if(state.failed||!state.ready||frame.width!==1920||frame.height!==1080||frame.bytes!==1920*1080*4||frame.bytes>l.FRAME_BYTES)throw Error("Native UI surface bounds rejected");
   c.native.checkMemory(BigInt(frame.pointer),frame.bytes,1);
   if(statisticsVisible()){paintStatistics();state.present(0,false);return;}
   state.statisticsDrawn=false;
   finishPresentation();
   c.rawCall(memcpy_addr,[BigInt(state.storage+l.BADGE_OFFSET),BigInt(frame.pointer),BigInt(frame.bytes)]);
   word(c,state.storage+l.BADGE.x,0);word(c,state.storage+l.BADGE.y,0);
   word(c,state.storage+l.BADGE.width,1920);word(c,state.storage+l.BADGE.height,1080);word(c,state.storage+l.BADGE.visible,1);
   state.uiOverlayActive=true;state.present(0,false);
  });
  // Re-publish the current view even when its scene geometry did not change.
  if(state.shared.active)state.shared.active.ui.resetLayoutCache();
 }
 function publish(frame,width,height,stride,sliceHeight,overlay){
  if(!state||!state.ready||state.failed)throw Error("Native display is not ready");
  if(state.overlayActive&&!overlay)return false;
  var m=g.MoonlightNativeModules,c=state.context,l=m.layout;
  if(width<2||height<2||width>3840||height>2160||stride<width||sliceHeight<height||stride%2||sliceHeight%2||stride*sliceHeight*1.5>l.FRAME_BYTES)throw Error("Native NV12 frame bounds rejected");
  var destination=BigInt(state.storage+l.FRAMES_OFFSET);
  var checked=state.videoMemory,bytes=stride*sliceHeight*1.5;
  // This slot remains mapped and owned by the retained renderer until retire.
  // External sources still require their own mapping check on every copy.
  if(!checked||BigInt(frame)!==checked.pointer||bytes>checked.bytes)c.native.checkMemory(BigInt(frame),bytes,1);
  finishPresentation();
  if(statisticsVisible())paintStatistics();
  else if(state.statisticsDrawn){word(c,state.storage+l.BADGE.visible,0);state.statisticsDrawn=false;state.uiOverlayActive=false;}
  if(BigInt(frame)!==destination)c.rawCall(memcpy_addr,[destination,BigInt(frame),BigInt(stride*sliceHeight*1.5)]);
  var p=state.storage+l.VIDEO.base;
  word(c,p+l.VIDEO.width,width);word(c,p+l.VIDEO.height,height);word(c,p+l.VIDEO.stride,stride);word(c,p+l.VIDEO.sliceHeight,sliceHeight);word(c,p+l.VIDEO.color,1);
  state.sequence=(state.sequence+1)>>>0||1;word(c,p+l.VIDEO.sequence,state.sequence);word(c,state.storage+l.CONTROL.mode,l.MODE.native);
  try{return state.present(0,false);}catch(error){state.failed=true;throw error;}
 }
 function showOverlay(spec){
  if(!state||!state.ready||state.failed||state.retired)return false;
  var frame=g.MoonlightNativeStreamMenu.render(spec),pointer=state.storage+g.MoonlightNativeModules.layout.FRAMES_OFFSET;
  finishPresentation();
  state.context.write(pointer,frame.bytes);state.overlayActive=true;
  publish(pointer,frame.width,frame.height,frame.width,frame.height,true);return true;
 }
 function clearOverlay(){if(state)state.overlayActive=false;}
 function videoBuffer(bytes,alignment){
  if(!state||!state.ready||state.failed||state.retired||state.overlayActive)return null;
  var l=g.MoonlightNativeModules.layout,p=BigInt(state.storage+l.FRAMES_OFFSET);
  if(!Number.isInteger(bytes)||bytes<1||bytes>l.FRAME_BYTES||!Number.isSafeInteger(alignment)||alignment<1)throw Error("Native video buffer bounds rejected");
  if(p%BigInt(alignment))return null;
  if(!state.videoMemory||state.videoMemory.pointer!==p||state.videoMemory.bytes<bytes){
   state.context.native.checkMemory(p,bytes,3);state.videoMemory={pointer:p,bytes:bytes};
  }
  finishPresentation();return p;
 }
 function statisticsVisible(){return !!(state&&state.statistics&&!state.overlayActive&&state.statistics.visible());}
 function paintStatistics(){
  var frame=state.statistics.frame;if(state.statisticsDrawn===frame)return;
  var c=state.context,l=g.MoonlightNativeModules.layout;
  finishPresentation();c.write(state.storage+l.BADGE_OFFSET,frame.bytes);
  word(c,state.storage+l.BADGE.x,14);word(c,state.storage+l.BADGE.y,14);
  word(c,state.storage+l.BADGE.width,frame.width);word(c,state.storage+l.BADGE.height,frame.height);word(c,state.storage+l.BADGE.visible,1);
  state.statisticsDrawn=frame;state.uiOverlayActive=true;
  var count=state.statisticsCounters||(state.statisticsCounters={updates:0,bytes:0});count.updates++;count.bytes+=frame.bytes.length;
 }
 function setStatistics(frame,visible){
  if(!state||!state.ready||state.failed||state.retired||state.shared&&!state.surface)return false;
  if(frame&&(!Number.isInteger(frame.width)||!Number.isInteger(frame.height)||frame.width<1||frame.height<1||frame.width>1024||frame.height>512||!(frame.bytes instanceof Uint8Array)||frame.bytes.length!==frame.width*frame.height*4||frame.bytes.length>g.MoonlightNativeModules.layout.FRAME_BYTES||typeof visible!=="function"))throw Error("Native statistics bounds rejected");
  state.statistics=frame?{frame:frame,visible:visible}:null;
  // Queue only. The video path already drains its preceding fence before
  // touching mapped pixels; do not force that wait from the stats callback.
  return true;
 }
 function setUiOverlay(frame){
  if(!state||!state.ready||state.failed||state.retired)return false;
  var l=g.MoonlightNativeModules.layout,c=state.context;
  // The existing UI shader's rectangle is also its bitmap stride. Its nominal
  // coordinate system is 1920x1080, independent of the swapchain output size.
  if(!frame||frame.width!==1920||frame.height!==1080||!(frame.bytes instanceof Uint8Array)||frame.bytes.length!==1920*1080*4||frame.bytes.length>l.FRAME_BYTES)throw Error("Native UI bitmap bounds rejected");
  finishPresentation();
  state.statisticsDrawn=false;
  c.write(state.storage+l.BADGE_OFFSET,frame.bytes);
  word(c,state.storage+l.BADGE.x,0);word(c,state.storage+l.BADGE.y,0);
  word(c,state.storage+l.BADGE.width,frame.width);word(c,state.storage+l.BADGE.height,frame.height);
  word(c,state.storage+l.BADGE.visible,1);
  state.uiOverlayActive=true;
  // A host may send no new frames while idle. Present UI updates independently.
  state.present(0,false);return true;
 }
 function clearUiOverlay(){
  if(!state||!state.ready||!state.uiOverlayActive||state.failed||state.retired)return;
  finishPresentation();
  word(state.context,state.storage+g.MoonlightNativeModules.layout.BADGE.visible,0);
  state.uiOverlayActive=false;state.present(0,false);
 }
 async function pattern(options){
  var size={width:options.width||1920,height:options.height||1080},s=await prepare(size,options.report),c=s.context,l=g.MoonlightNativeModules.layout;
  var w=size.width,h=size.height,bytes=new Uint8Array(w*h*3/2);bytes.fill(128,w*h);
  // One-pixel alternating columns in the central square distinguish native
  // rendering from a 720p surface merely scaled to the 1080p panel.
  for(var y=0;y<h;y++)for(var x=0;x<w;x++)bytes[y*w+x]=(x>w/4&&x<w*3/4&&y>h/4&&y<h*3/4)?(x%2?235:16):((Math.floor(x/(w/8))%2)?180:60);
  var frame=s.storage+l.FRAMES_OFFSET;finishPresentation();c.write(frame,bytes);
  var begun=Date.now(),frames=options.frames||120,first=begun;
  for(var i=0;i<frames;i++){publish(frame,w,h,w,h);if(i===0)first=Date.now();if(i%4===0)await new Promise(function(r){setTimeout(r,0);});}
  finishPresentation();
  return {size:size,viewport:{width:g.innerWidth,height:g.innerHeight},frames:frames,elapsedMs:Date.now()-begun,steadyFps:(frames-1)*1000/(Date.now()-first),retained:true};
 }
 async function refresh(report){
  if(!state||!state.ready)throw Error("Prepare the independent display before changing refresh rate");
  finishPresentation();
  // A display can survive a development payload replacement. Extend its local
  // command adapter in place; the GPU/native owners and verified set stay put.
  if(!state.context.rpc.refreshRecordAdapter){
   var original=state.context.rpc.request;
   state.context.rpc.request=async function(request){
    if(request.command!=="refresh-rate")return original(request);
    var record=g.__moonlightNativeRefreshState||(g.__moonlightNativeRefreshState={});
    return g.MoonlightNativeModules.refreshRecord.refreshRateCommand({state:record,runPlan:function(plan){return g.MoonlightNativeModules.callPlan.runCallPlan(state.context.native,plan);}},request);
   };
   state.context.rpc.refreshRecordAdapter=true;
   state.refresh=null;
  }
  if(state.refresh)return state.refresh;
  var info=await state.context.rpc.request({command:"module-probe",name:"nnCompat"});
  g.__moonlightNativeFiles=g.__civNanoVGFiles={"compatibility-module.json":info,"vulkan-display.json":{displayResources:state.display}};
  state.refresh=g.MoonlightNativeModules.refresh.createRefreshRate(state.context.rpc,{directory:"local",log:report||function(){},present:async function(){for(var i=0;i<4;i++)state.present(0,false);return 4;}});
  await state.refresh.cleanup();return state.refresh;
 }
 async function retire(){
  if(!state||!state.ready||state.retired)return;
  finishPresentation();
  state.videoMemory=null;
  state.statistics=null;state.statisticsDrawn=false;
  if(state.refresh){await state.refresh.close();state.refresh=null;}
  if(state.shared){
   var context=state.context,result=context.call(BigInt(context.resolve("vkQueueWaitIdle")),BigInt(state.display.queue));
   if(BigInt.asIntN(32,result)!==0n){state.failed=true;throw Error("Native display completion is uncertain; restart Civ VII");}
   if(state.surface){state.surface.close();state.surface=null;}
   state.statistics=null;state.statisticsDrawn=false;
   state.overlayActive=false;state.uiOverlayActive=false;
   word(context,state.storage+g.MoonlightNativeModules.layout.BADGE.visible,0);
   if(state.shared.active)state.shared.active.ui.resetLayoutCache();
   return;
  }
  // The retained layer stays visible. Replace stale PC pixels with a readable
  // stopped screen before the close request, using the existing NV12 pipeline.
  if(!state.failed)showOverlay({kind:"stopped"});
  finishPresentation();
  var c=state.context;
  var idle=c.call(BigInt(c.resolve("vkQueueWaitIdle")),BigInt(state.display.queue));
  if(BigInt.asIntN(32,idle)!==0n){state.failed=true;throw Error("Native display completion is uncertain; restart Civ VII");}
  // Keep this layer open while its swapchain owns the native window. Orderly
  // destruction has now been exercised, but even completed VI closure leaves
  // the layout engine black. Retain this stopped notice until visible return is solved.
  state.retired=true;state.ready=false;
 }
 g.MoonlightNativeDisplay={prepare:prepare,publish:publish,videoBuffer:videoBuffer,finish:finishPresentation,pattern:pattern,refresh:refresh,retire:retire,state:function(){return state;},showOverlay:showOverlay,clearOverlay:clearOverlay,setStatistics:setStatistics,setUiOverlay:setUiOverlay,clearUiOverlay:clearUiOverlay};
})(typeof window!=="undefined"?window:globalThis);
