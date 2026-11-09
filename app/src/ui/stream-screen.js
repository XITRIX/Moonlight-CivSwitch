/* Fullscreen native live image with controller 0 and a local −/+ exit chord. */
(function(global){
 "use strict";
 function create(options){
  function element(tag,parent,style,text){var node=document.createElement(tag);Object.assign(node.style,style);if(text!==undefined)node.textContent=text;parent.appendChild(node);return node;}
  var panel=element("div",options.parent,{display:"none",position:"fixed",left:"0",top:"0",right:"0",bottom:"0",backgroundColor:"#000000",flexDirection:"column",alignItems:"center",justifyContent:"center",overflow:"hidden"});panel.id="moonlight-stream-screen";
  var image=element("img",panel,{display:"none",position:"absolute",left:"0",top:"0",width:"100%",height:"100%",objectFit:"contain"});image.alt="Remote stream";
  var liveImage=element("div",panel,{display:"none",position:"absolute",left:"0",top:"0",width:"100%",height:"100%",backgroundSize:"contain",backgroundPosition:"center",backgroundRepeat:"no-repeat"});liveImage.setAttribute("aria-label","Remote stream");liveImage.id="moonlight-stream-native-image";
  var message=element("div",panel,{position:"relative",zIndex:"1",fontSize:"22px",color:"#b7c6dd",padding:"20px",textAlign:"center",backgroundColor:"#0c1220"});message.setAttribute("role","status");
  var overlay=element("div",panel,{display:"none",position:"absolute",left:"14px",top:"14px",zIndex:"2",maxWidth:"90vw",padding:"12px 16px",borderRadius:"8px",backgroundColor:"rgba(12,18,32,0.88)",color:"#e4efff",fontFamily:"Arial, sans-serif",fontSize:"16px",lineHeight:"1.4",whiteSpace:"pre-wrap",pointerEvents:"none"});overlay.id="moonlight-performance-overlay";overlay.setAttribute("aria-label","Streaming performance");
  var overlayEnabled=false,exitTimer=null,terminateRequested=false,terminateSignal=null,chordHeld=false,inputGate=false,localButtons=0,localIgnoreUntil=0,currentApp=null;
  var dialog=global.MoonlightAppDialog.create({parent:panel,id:"moonlight-stream-exit",onCancel:resumeInput});
  function resumeInput(){inputGate=true;localIgnoreUntil=Date.now()+200;lastPad="";}
  function openExit(){
   if(!visible||stopping||dialog.isOpen())return;
   release();inputGate=true;
   dialog.show({title:"Leave "+currentApp.title+"?",description:"Disconnect keeps the app running on your PC.\nTerminate closes it. Unsaved progress could be lost.",labels:["Disconnect","Terminate"],actions:[function(){stop();},function(){terminateRequested=true;stop();}]});
  }
  function localInput(input){
   var buttons=input.state[0],before=localButtons;localButtons=buttons;
   if(input.exit){if(!chordHeld){chordHeld=true;openExit();}return true;}
   chordHeld=false;
   if(dialog.isOpen()){
    var mapping=[[4,"nav-left"],[8,"nav-right"],[1,"nav-up"],[2,"nav-down"],[0x2000,"accept"],[0x1000,"cancel"]];
    for(var item of mapping){var mask=item[0];if(buttons&mask)dialog.action(item[1],before&mask?3:0);else if(before&mask)dialog.action(item[1],1);}
    return true;
   }
   if(inputGate){if(!buttons&&Date.now()>=localIgnoreUntil)inputGate=false;return true;}
   return false;
  }
  function cancelExitCheck(){if(exitTimer!==null)clearTimeout(exitTimer);exitTimer=null;}
  function checkExit(){exitTimer=null;if(!visible||stopping)return;poll(true);if(visible&&!stopping)exitTimer=setTimeout(checkExit,50);}
  var client=null,lifetime=null,loading=false,lastImage="",imageStarted=0,visible=false,stopping=false,hasImage=false,nativeInput=null,fullInput=false,lastPad="",nativeButtons=0,nativeAxes=[0,0],pressedKeys=new Set(),suspended=false;
  function send(state){
   if(!client||stopping)return;var signature=state.join(",");if(signature===lastPad)return;
   var result=client.gamepad.apply(client,state);if(typeof result!=="number"||result>=0)lastPad=signature;
  }
  function release(){
   if(client){client.gamepad(0,0,0,0,0,0,0);for(var code of pressedKeys)client.key(code,false,0);}
   pressedKeys.clear();lastPad="";nativeButtons=0;nativeAxes=[0,0];
  }
  function stop(){if(stopping||!visible)return lifetime;cancelExitCheck();dialog.hide();release();stopping=true;message.textContent="Stopping stream…";message.style.display="block";if(client)return client.stop();return lifetime;}
  function status(text){message.textContent=text;if(!hasImage||stopping)message.style.display="block";}
  function showImage(){hasImage=true;message.style.display="none";}
  image.onload=function(){loading=false;image.style.display="block";showImage();};image.onerror=function(){loading=false;options.log("Image presentation failed");};
  function nativeAction(name,phase,x,y){
   if(dialog.isOpen()){dialog.action(name,phase,x,y);return;}
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
   var input=null;
   if(nativeInput){
    try{input=nativeInput.poll();}catch(error){options.log("Controller input failed: "+error.message);nativeInput.close();nativeInput=null;release();}
   }
   if(!nativeInput&&global.MoonlightControllerInput&&navigator.getGamepads){
    try{var pads=Array.from(navigator.getGamepads());for(var pad of pads){input=global.MoonlightControllerInput.fromBrowser(pad);if(input)break;}}catch(_){}
   }
   if(input){
    if(localInput(input))return;
    if(exitOnly||suspended)return;fullInput=true;send(input.state);
   }else if(!exitOnly&&!suspended&&fullInput){release();fullInput=false;}
  }
  function key(event,down){
   if(!visible)return false;
   if(dialog.key(event,down))return true;
   if(Date.now()<localIgnoreUntil)return true;
   if(event.key==="Escape"){if(down&&!event.repeat)openExit();return true;}
   if(client&&!stopping&&!suspended){
    var code=event.keyCode||{Enter:13,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40," ":32}[event.key];
    if(code&&(!down||!pressedKeys.has(code))){client.key(code,down,(event.shiftKey?1:0)|(event.ctrlKey?2:0)|(event.altKey?4:0)|(event.metaKey?8:0));if(down)pressedKeys.add(code);else pressedKeys.delete(code);}
   }
   return true;
  }
  function show(host,app,mode){
   if(lifetime)return lifetime;
   mode=global.MoonlightSettings.validate(mode);overlayEnabled=mode.showStats;overlay.style.display="none";overlay.textContent="Waiting for stream statistics…";
   currentApp=app;terminateRequested=false;terminateSignal={aborted:false};chordHeld=false;inputGate=false;localButtons=0;localIgnoreUntil=0;dialog.hide();
   visible=true;stopping=false;loading=false;hasImage=false;lastImage="";lastPad="";nativeButtons=0;nativeAxes=[0,0];fullInput=false;suspended=false;pressedKeys.clear();image.style.display="none";liveImage.style.display="none";panel.style.display="flex";status("Starting "+app.title+"… · Press − and + together for stream options");
   if(global.MoonlightControllerInput)try{nativeInput=global.MoonlightControllerInput.createNative();}catch(error){options.log("Native controller unavailable: "+error.message);}
   client=global.MoonlightStreamClient.create({host:host,app:app,mode:global.MoonlightSettings.validate(mode),onStatus:status,onImage:function(url){
    if(url===lastImage)return;lastImage=url;
    if(url.indexOf("live:/")===0){loading=false;image.style.display="none";liveImage.style.backgroundImage='url("'+url+'")';liveImage.style.display="block";showImage();}
    else{liveImage.style.display="none";loading=true;imageStarted=Date.now();image.src=url;}
   },canPresent:function(){return !loading||Date.now()-imageStarted>1000;},log:options.log,onStats:function(stats){if(overlayEnabled){overlay.textContent=global.MoonlightTelemetry.format(stats);overlay.style.display="block";}if(options.onStats)options.onStats(stats);},onError:function(error){options.log("Error: "+error.message);}});
   cancelExitCheck();exitTimer=setTimeout(checkExit,50);
   lifetime=client.start().then(async function(result){
    if(terminateRequested&&!terminateSignal.aborted){status("Terminating "+app.title+"…");await options.onTerminate(host,app,terminateSignal);}
    return result;
   }).finally(function(){
    cancelExitCheck();
    dialog.hide();visible=false;if(nativeInput){nativeInput.close();nativeInput=null;}pressedKeys.clear();client=null;lifetime=null;overlay.style.display="none";overlay.textContent="";panel.style.display="none";image.removeAttribute("src");liveImage.style.backgroundImage="none";options.onBack();
   });
   return lifetime;
  }
  function suspend(value){suspended=!!value;if(suspended)release();}
  function destroy(){if(terminateSignal)terminateSignal.aborted=true;dialog.hide();var done=stop();image.onload=image.onerror=null;return Promise.resolve(done).finally(function(){if(panel.parentNode)panel.parentNode.removeChild(panel);});}
  return {show:show,stop:stop,poll:poll,action:nativeAction,key:key,suspend:suspend,destroy:destroy};
 }
 global.MoonlightStreamScreen={create:create};
})(window);
