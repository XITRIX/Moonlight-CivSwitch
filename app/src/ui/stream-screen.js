/* Fullscreen native live image, local stream drawer and controller 0. */
(function(global){
 "use strict";
 function create(options){
  var element = global.MoonlightLayout.element;
  var panel=element("div",options.parent,{display:"none",position:"fixed",left:"0",top:"0",right:"0",bottom:"0",backgroundColor:"transparent",flexDirection:"column",alignItems:"center",justifyContent:"center",overflow:"hidden"});panel.id="moonlight-stream-screen";
  var uiRevision=0,previousSceneKey=options.parent.__civNanoVGSceneKey,sceneObserver=null;
  // Remote input changes no local pixels. Avoid serializing the hidden game
  // library (including artwork URLs) on every SDK input/cache check.
  function sceneKey(){return visible?"moonlight-stream:"+global.innerWidth+"x"+global.innerHeight+":"+uiRevision:previousSceneKey?previousSceneKey.call(options.parent):null;}
  options.parent.__civNanoVGSceneKey=sceneKey;
  if(typeof global.MutationObserver==="function"){
   sceneObserver=new global.MutationObserver(function(){uiRevision++;});
   sceneObserver.observe(panel,{subtree:true,attributes:true,childList:true,characterData:true});
  }
  // the layout engine can report a zero-height absolute child when its fixed flex parent
  // has only top/bottom insets. Give local overlays a concrete containing size.
  function resizePanel(){panel.style.width=global.innerWidth+"px";panel.style.height=global.innerHeight+"px";global.MoonlightLayout.resize(panel);invalidateNativeUi();}
  resizePanel();global.addEventListener("resize",resizePanel);
  var image=element("img",panel,{display:"none",position:"absolute",left:"0",top:"0",width:"100%",height:"100%",objectFit:"contain"});image.alt="Remote stream";
  var liveImage=element("div",panel,{display:"none",position:"absolute",left:"0",top:"0",width:"100%",height:"100%",backgroundSize:"contain",backgroundPosition:"center",backgroundRepeat:"no-repeat"});liveImage.setAttribute("aria-label","Remote stream");liveImage.id="moonlight-stream-native-image";
  var message=element("div",panel,{position:"relative",zIndex:"1",fontSize:"22px",color:"#b7c6dd",padding:"20px",textAlign:"center",backgroundColor:"#0c1220"});message.setAttribute("role","status");
  panel.style.touchAction="none";
  var touchNotice=element("div",panel,{display:"none",position:"absolute",bottom:"20px",left:"20px",right:"20px",zIndex:"2",padding:"12px",fontSize:"18px",color:"#fff",backgroundColor:"#131d2e",pointerEvents:"none"});touchNotice.id="moonlight-touch-status";touchNotice.setAttribute("role","status");
  var overlay=element("div",panel,{display:"none",position:"absolute",left:"14px",top:"14px",zIndex:"2",maxWidth:"90vw",padding:"12px 16px",borderRadius:"8px",backgroundColor:"rgba(12,18,32,0.88)",color:"#e4efff",fontFamily:"Arial, sans-serif",fontSize:"16px",lineHeight:"1.4",whiteSpace:"pre-wrap",pointerEvents:"none"});overlay.id="moonlight-performance-overlay";overlay.setAttribute("aria-label","Streaming performance");
  var nativeUiDirty=true,nativeUiSettleAt=0;
  function invalidateNativeUi(){uiRevision++;nativeUiDirty=true;nativeUiSettleAt=Date.now()+100;}
  panel.addEventListener("click",invalidateNativeUi,false);
  var statisticsFrame=null,statisticsSample=null;
  var overlayEnabled=false,lastStats=null,exitTimer=null,terminateRequested=false,terminateSignal=null,chordHeld=false,inputGate=false,localButtons=0,localIgnoreUntil=0,currentApp=null,currentHost="",currentMode=null,lastTouchCount=0;
  var mouse=null,keyboardReturnMouse=false;
  var menu=global.MoonlightStreamMenu.create({parent:panel,onClose:resumeInput,onMouse:openMouse,onKeyboard:function(){openKeyboard("gamepad");},onTouchMode:setTouchMode,onPerformanceOverlay:setPerformanceOverlay,onLogout:openExit});
  var dialog=global.MoonlightAppDialog.create({parent:panel,id:"moonlight-stream-exit",onCancel:function(){openMenu(true);}});
  var nativeMenuNeutral=false;
  function localOverlay(){return dialog.isOpen()||menu.isOpen()||keyboard&&keyboard.isOpen()||mouse&&mouse.isOpen();}
  function resumeInput(){invalidateNativeUi();inputGate=true;localIgnoreUntil=Date.now()+200;lastPad="";}
  function openMenu(restoreLogout){
   invalidateNativeUi();
   if(!visible||stopping||menu.isOpen()||dialog.isOpen())return;
   release();inputGate=true;nativeMenuNeutral=true;menu.show(currentHost,currentMode.touchMode,lastTouchCount,restoreLogout,currentMode.showStats);
  }
  function setTouchMode(mode){
   invalidateNativeUi();
   if(options.onTouchMode)options.onTouchMode(mode);
   if(touchInput)touchInput.setMode(mode);currentMode.touchMode=mode;touchNotice.style.display="none";
  }
  function updateStatistics(){
   var display=global.MoonlightNativeDisplay,renderer=global.MoonlightNativeStreamMenu;
   if(display&&display.setStatistics&&renderer&&renderer.renderStatistics){
    if(overlayEnabled&&lastStats&&statisticsSample!==lastStats){statisticsFrame=renderer.renderStatistics(lastStats);statisticsSample=lastStats;}
    if(display.setStatistics(overlayEnabled?statisticsFrame:null,function(){return visible&&!stopping&&hasImage&&!localOverlay()&&touchNotice.style.display==="none";})){
     if(overlay.style.display!=="none"){overlay.style.display="none";invalidateNativeUi();}return;
    }
   }
   if(overlayEnabled&&lastStats&&!stopping){overlay.textContent=global.MoonlightTelemetry.format(lastStats);overlay.style.display="block";invalidateNativeUi();}
  }
  function setPerformanceOverlay(enabled){
   invalidateNativeUi();
   if(options.onPerformanceOverlay)options.onPerformanceOverlay(enabled);
   overlayEnabled=enabled;currentMode.showStats=enabled;
   if(!enabled)overlay.style.display="none";
   updateStatistics();
  }
  function openExit(){
   invalidateNativeUi();
   if(!visible||stopping||dialog.isOpen())return;
   release();inputGate=true;
   dialog.show({title:"Leave "+currentApp.title+"?",description:"Disconnect keeps the app running on your PC.\nTerminate closes it. Unsaved progress could be lost.",labels:["Disconnect","Terminate"],actions:[function(){stop();},function(){terminateRequested=true;stop();}]});
  }
  function localInput(input){
   var buttons=input.state[0],before=localButtons;localButtons=buttons;if(localOverlay()&&(buttons!==before||buttons))invalidateNativeUi();
   if(input.exit){if(!chordHeld){chordHeld=true;openMenu();}return true;}
   chordHeld=false;
   if(dialog.isOpen()||menu.isOpen()){
    if(nativeMenuNeutral){if(!buttons)nativeMenuNeutral=false;return true;}
    var target=dialog.isOpen()?dialog:menu;
    var mapping=[[4,"nav-left"],[8,"nav-right"],[1,"nav-up"],[2,"nav-down"],[0x2000,"accept"],[0x1000,"cancel"]];
    for(var item of mapping){var mask=item[0];if(buttons&mask)target.action(item[1],before&mask?3:0);else if(before&mask)target.action(item[1],1);}
    return true;
   }
   if(keyboard&&keyboard.mode()==="gamepad"){keyboard.controller(buttons);return true;}
   if(mouse&&mouse.isOpen()){mouse.controller(input.state,!suspended);return true;}
   if(inputGate){if(!buttons&&Date.now()>=localIgnoreUntil)inputGate=false;return true;}
   return false;
  }
  function cancelExitCheck(){if(exitTimer!==null)clearTimeout(exitTimer);exitTimer=null;}
  function checkExit(){exitTimer=null;if(!visible||stopping)return;poll(true);if(nativeUiDirty||nativeUiSettleAt&&Date.now()>=nativeUiSettleAt){nativeUiDirty=false;if(nativeUiSettleAt&&Date.now()>=nativeUiSettleAt){nativeUiSettleAt=0;uiRevision++;}if(global.CivNanoVGPrototype)global.CivNanoVGPrototype.invalidate();}if(visible&&!stopping)exitTimer=setTimeout(checkExit,50);}
  var client=null,lifetime=null,loading=false,lastImage="",imageStarted=0,visible=false,stopping=false,hasImage=false,nativeInput=null,fullInput=false,lastPad="",nativeButtons=0,nativeAxes=[0,0],pressedKeys=new Set(),suspended=false,touchInput=null,nativeTouch=null;
  var remoteKeys=null,keyboard=null;
  if(global.MoonlightStreamKeyboard){
   remoteKeys=global.MoonlightStreamKeyboard.createKeys({key:function(code,down,modifiers){return client?client.key(code,down,modifiers):-1;},reset:function(){if(client&&client.resetKeys)client.resetKeys();},onError:touchError});
   keyboard=global.MoonlightStreamKeyboard.create({parent:panel,keys:remoteKeys,onClose:function(openMode){if(touchInput)touchInput.cancel();if(keyboardReturnMouse){keyboardReturnMouse=false;if(mouse&&mouse.isOpen())mouse.resume();}if(openMode==="gamepad")resumeInput();}});
  }
  mouse=global.MoonlightStreamMouse.create({parent:panel,
   move:function(dx,dy){return client?client.mouseMove(dx,dy):-1;},button:function(button,down){return client?client.mouseButton(button,down):-1;},scroll:function(x,y){return client?client.mouseScroll(x,y):-1;},reset:function(){if(client)client.resetPointer();},
   onClose:resumeInput,onMenu:openMenu,onKeyboard:function(){keyboardReturnMouse=openKeyboard("gamepad");return keyboardReturnMouse;},
   onSettings:function(value){if(options.onMouseSettings)options.onMouseSettings(value);currentMode.mouse=global.MoonlightSettings.validateMouse(value);}});
  function openMouse(){
   invalidateNativeUi();
   if(!visible||!client||stopping||suspended||dialog.isOpen()||menu.isOpen())return false;
   release();touchNotice.style.display="none";mouse.open(currentMode.mouse,lastTouchCount);return true;
  }
  function openKeyboard(openMode){
   invalidateNativeUi();
   if(!keyboard||!visible||!client||stopping||suspended||dialog.isOpen()||menu.isOpen())return false;
   if(touchInput)touchInput.cancel();
   if(openMode==="gamepad"){client.gamepad(0,0,0,0,0,0,0);lastPad="";}
   return keyboard.open(openMode);
  }
  function touchError(text){invalidateNativeUi();touchNotice.textContent=text;touchNotice.style.display="block";}
  function touchAllowed(local){return visible&&!!client&&!stopping&&!suspended&&!dialog.isOpen()&&!menu.isOpen()&&(local||Date.now()>=localIgnoreUntil);}
  function routeTouch(points){
   if(localOverlay()&&(points.length||lastTouchCount))invalidateNativeUi();
   lastTouchCount=points.length;
   if(menu.isOpen()){touchInput.update(points,false);menu.updateTouches(points);return;}
   if(keyboard&&keyboard.isOpen()){touchInput.update(points,false);keyboard.updateTouches(points,touchAllowed(true));}
   else if(mouse&&mouse.isOpen()){touchInput.update(points,false);mouse.updateTouches(points);}
   else touchInput.update(points,touchAllowed());
  }
  function pollTouch(){
   if(!touchInput||!nativeTouch)return;
   try{
    var rect=panel.getBoundingClientRect(),points=nativeTouch.poll().map(function(p){return {id:p.id,x:rect.left+p.x*rect.width,y:rect.top+p.y*rect.height};});
    routeTouch(points);
   }catch(error){touchInput.cancel();menu.cancelTouches();mouse.cancelTouches();if(keyboard&&keyboard.mode()==="touch")keyboard.close();nativeTouch.close();nativeTouch=null;touchError("Touchscreen unavailable: "+error.message);}
  }
  function domTouch(event){
   if(!visible||!touchInput)return;
   var points=[];for(var i=0;i<event.touches.length;i++){var p=event.touches[i];points.push({id:p.identifier,x:p.clientX,y:p.clientY});}
   lastTouchCount=points.length;
   if(dialog.isOpen()){if(!nativeTouch)touchInput.update(points,false);return;}
   event.preventDefault();event.stopPropagation();if(nativeTouch)return;
   if(event.type==="touchcancel"){touchInput.cancel();menu.cancelTouches();mouse.cancelTouches();if(keyboard)keyboard.close();return;}
   routeTouch(points);
  }
  for(var touchEvent of ["touchstart","touchmove","touchend","touchcancel"])panel.addEventListener(touchEvent,domTouch,false);
  function send(state){
   if(!client||stopping)return;var signature=state.join(",");if(signature===lastPad)return;
   var result=client.gamepad.apply(client,state);if(typeof result!=="number"||result>=0)lastPad=signature;
  }
  function release(){
   keyboardReturnMouse=false;if(mouse)mouse.close();
   if(touchInput)touchInput.cancel();
   if(keyboard)keyboard.close();
   if(nativeInput&&nativeInput.stopRumble)nativeInput.stopRumble();
   if(client){client.gamepad(0,0,0,0,0,0,0);if(remoteKeys)remoteKeys.reset();else for(var code of pressedKeys)client.key(code,false,0);}
   pressedKeys.clear();lastPad="";nativeButtons=0;nativeAxes=[0,0];
  }
  function stop(){if(stopping||!visible)return lifetime;cancelExitCheck();dialog.hide();menu.hide();release();stopping=true;status("Stopping stream…");invalidateNativeUi();if(global.CivNanoVGPrototype)global.CivNanoVGPrototype.invalidate();if(client)return client.stop();return lifetime;}
  function status(text){message.textContent=text;if(!hasImage||stopping)message.style.display="block";}
  function showImage(){if(!hasImage){invalidateNativeUi();hasImage=true;message.style.display="none";updateStatistics();}}
  image.onload=function(){loading=false;image.style.display="block";showImage();};image.onerror=function(){loading=false;options.log("Image presentation failed");};
  function nativeAction(name,phase,x,y){
   if(localOverlay())invalidateNativeUi();
   if(dialog.isOpen()){dialog.action(name,phase,x,y);return;}
   if(menu.isOpen()){if(!fullInput)menu.action(name,phase,x,y);return;}
   if(keyboard&&keyboard.mode()==="gamepad"){if(!fullInput)keyboard.action(name,phase);return;}
   if(mouse&&mouse.isOpen()){if(!fullInput)mouse.action(name,phase);return;}
   if(inputGate&&!nativeInput&&!fullInput){if(phase!==0&&phase!==3)inputGate=false;return;}
   if(Date.now()<localIgnoreUntil)return;
   if(!visible||!client||stopping||suspended||nativeInput||fullInput)return;
   var down=phase===0||phase===3;
   if(name==="nav-move"&&global.MoonlightControllerInput){var axes=global.MoonlightControllerInput.fromNpad(0,Number(x)*32767,Number(y)*32767,0,0).state;nativeAxes=[axes[3],axes[4]];}
   var flag={"nav-up":1,"nav-down":2,"nav-left":4,"nav-right":8,accept:0x2000,cancel:0x1000}[name]||0;
   nativeButtons=down?nativeButtons|flag:nativeButtons&~flag;send([nativeButtons,0,0,nativeAxes[0],nativeAxes[1],0,0]);
  }
  function poll(exitOnly){
   if(!visible||!client||stopping)return;
   try{
   var input=null;
   if(nativeInput){
    try{input=nativeInput.poll();}catch(error){options.log("Controller input failed: "+error.message);nativeInput.close();nativeInput=null;release();}
   }
   if(!nativeInput&&global.MoonlightControllerInput&&navigator.getGamepads){
    try{var pads=Array.from(navigator.getGamepads());for(var pad of pads){input=global.MoonlightControllerInput.fromBrowser(pad);if(input)break;}}catch(_){}
   }
   if(input){
    fullInput=true;
    if(localInput(input))return;
    if(exitOnly||suspended)return;send(input.state);
   }else if(!exitOnly&&!suspended&&fullInput){release();fullInput=false;}
   }finally{if(!exitOnly)pollTouch();}
  }
  function key(event,down){
   if(localOverlay())invalidateNativeUi();
   if(!visible)return false;
   if(dialog.key(event,down))return true;
   if(menu.key(event,down))return true;
   if(Date.now()<localIgnoreUntil)return true;
   if(keyboard&&keyboard.isOpen()){
    if(event.key==="Escape"){if(down&&!event.repeat)keyboard.close();return true;}
    if(keyboard.mode()==="gamepad"){
     var name={Enter:"accept",ArrowLeft:"nav-left",ArrowRight:"nav-right",ArrowUp:"nav-up",ArrowDown:"nav-down",Backspace:"backspace"," ":"space"}[event.key];
     if(name)keyboard.action(name,down?(event.repeat?3:0):1);return true;
    }
   }
   if(mouse&&mouse.isOpen())return mouse.key(event,down);
   if(event.key==="Escape"){if(down&&!event.repeat)openMenu();return true;}
   if(client&&!stopping&&!suspended){
    var code=event.keyCode||{Enter:13,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40," ":32}[event.key];
    var descriptor=global.MoonlightStreamKeyboard&&(global.MoonlightStreamKeyboard.byId.get(event.code)||global.MoonlightStreamKeyboard.describe(code));
    if(descriptor)code=descriptor.code;
    if(code&&(!down||!pressedKeys.has(code))){
     var modifiers=(event.shiftKey?1:0)|(event.ctrlKey?2:0)|(event.altKey?4:0)|(event.metaKey?8:0);
     if(remoteKeys){if(down)remoteKeys.set("physical:"+code,[Object.assign({},descriptor,{extra:modifiers})]);else remoteKeys.clear("physical:"+code,modifiers);}
     else client.key(code,down,modifiers);
     if(down)pressedKeys.add(code);else pressedKeys.delete(code);
    }
   }
   return true;
  }
  function show(host,app,mode,hostName){
   if(lifetime)return lifetime;
   mode=global.MoonlightSettings.validate(mode);overlayEnabled=mode.showStats;lastStats=null;statisticsFrame=null;statisticsSample=null;overlay.style.display="none";overlay.textContent="Waiting for stream statistics…";
   currentApp=app;currentHost=hostName||host;currentMode=mode;
   lastTouchCount=0;terminateRequested=false;terminateSignal={aborted:false};chordHeld=false;nativeMenuNeutral=false;menu.hide();inputGate=false;localButtons=0;localIgnoreUntil=0;dialog.hide();
   touchNotice.style.display="none";touchNotice.textContent="";
   visible=true;stopping=false;loading=false;hasImage=false;lastImage="";lastPad="";nativeButtons=0;nativeAxes=[0,0];fullInput=false;suspended=false;pressedKeys.clear();image.style.display="none";liveImage.style.display="none";panel.style.display="flex";status("Starting "+app.title+"… · Press − and + together for stream options");
   if(global.MoonlightControllerInput)try{nativeInput=global.MoonlightControllerInput.createNative({onRumbleError:function(error){options.log("Controller rumble unavailable: "+error.message);}});}catch(error){options.log("Native controller unavailable: "+error.message);}
   client=global.MoonlightStreamClient.create({host:host,app:app,mode:global.MoonlightSettings.validate(mode),onRumble:mode.rumble&&nativeInput&&nativeInput.rumbleSupported?function(controller,low,high){
    if(visible&&!stopping&&!suspended&&!dialog.isOpen()&&!menu.isOpen()&&!inputGate&&nativeInput)nativeInput.rumble(controller,low,high);
   }:undefined,canAdapt:function(){return visible&&!stopping&&!suspended&&!inputGate&&!localOverlay();},onReconnect:function(){release();resumeInput();},onStatus:status,onPresented:showImage,onImage:function(url){
    if(url===lastImage)return;lastImage=url;
    if(url.indexOf("live:/")===0){loading=false;image.style.display="none";liveImage.style.backgroundImage='url("'+url+'")';liveImage.style.display="block";showImage();}
    else{liveImage.style.display="none";loading=true;imageStarted=Date.now();image.src=url;}
   },canPresent:function(){return !stopping&&(!loading||Date.now()-imageStarted>1000);},log:options.log,onStats:function(stats){lastStats=stats;if(!stopping)updateStatistics();if(options.onStats)options.onStats(stats);},onError:function(error){options.log("Error: "+error.message);}});
   if(global.MoonlightTouchInput){
    try{nativeTouch=global.MoonlightTouchInput.createNative();}catch(error){nativeTouch=null;touchError("Native touchscreen unavailable: "+error.message);}
    touchInput=global.MoonlightTouchInput.create({mode:mode.touchMode,width:mode.width,height:mode.height,bounds:function(){return panel.getBoundingClientRect();},startBlocked:!!nativeTouch,
     mouseMove:function(dx,dy){return client&&client.mouseMove?client.mouseMove(dx,dy):-1;},mouseButton:function(button,down){return client&&client.mouseButton?client.mouseButton(button,down):-1;},
     mouseScroll:function(horizontal,vertical){return client&&client.mouseScroll?client.mouseScroll(horizontal,vertical):-1;},
     onKeyboard:function(){openKeyboard("touch");},
     touch:function(action,id,x,y){return client&&client.touch?client.touch(action,id,x,y):-1;},reset:function(){if(client&&client.resetPointer)client.resetPointer();},onError:touchError});
   }
   cancelExitCheck();exitTimer=setTimeout(checkExit,50);
   lifetime=client.start().then(async function(result){
    if(terminateRequested&&!terminateSignal.aborted){status("Terminating "+app.title+"…");await options.onTerminate(host,app,terminateSignal);}
    return result;
   }).finally(function(){
    cancelExitCheck();
    if(global.MoonlightNativeDisplay&&global.MoonlightNativeDisplay.setStatistics)global.MoonlightNativeDisplay.setStatistics(null);statisticsFrame=null;statisticsSample=null;
    if(touchInput){touchInput.close();touchInput=null;}if(nativeTouch){nativeTouch.close();nativeTouch=null;}
    keyboardReturnMouse=false;mouse.close();
     if(keyboard)keyboard.close();if(remoteKeys)remoteKeys.reset();
    dialog.hide();menu.hide();visible=false;if(nativeInput){nativeInput.close();nativeInput=null;}pressedKeys.clear();client=null;lifetime=null;lastStats=null;overlay.style.display="none";overlay.textContent="";panel.style.display="none";image.removeAttribute("src");liveImage.style.backgroundImage="none";options.onBack();
   });
   return lifetime;
  }
  function suspend(value){suspended=!!value;if(suspended)release();}
  function destroy(){if(terminateSignal)terminateSignal.aborted=true;dialog.hide();menu.hide();var done=stop();image.onload=image.onerror=null;return Promise.resolve(done).finally(function(){global.removeEventListener("resize",resizePanel);panel.removeEventListener("click",invalidateNativeUi,false);if(sceneObserver)sceneObserver.disconnect();if(options.parent.__civNanoVGSceneKey===sceneKey){if(previousSceneKey)options.parent.__civNanoVGSceneKey=previousSceneKey;else delete options.parent.__civNanoVGSceneKey;}if(keyboard)keyboard.destroy();mouse.destroy();menu.destroy();dialog.destroy();if(panel.parentNode)panel.parentNode.removeChild(panel);});}
  return {show:show,stop:stop,poll:poll,action:nativeAction,key:key,suspend:suspend,destroy:destroy,openKeyboard:openKeyboard};
 }
 global.MoonlightStreamScreen={create:create};
})(window);
