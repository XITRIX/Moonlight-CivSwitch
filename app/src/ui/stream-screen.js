/* Fullscreen native live image with controller 0 and a local −/+ exit chord. */
(function(global){
 "use strict";
 function create(options){
  function element(tag,parent,style,text){var node=document.createElement(tag);Object.assign(node.style,style);if(text!==undefined)node.textContent=text;parent.appendChild(node);return node;}
  var panel=element("div",options.parent,{display:"none",position:"fixed",left:"0",top:"0",right:"0",bottom:"0",backgroundColor:"#000000",flexDirection:"column",alignItems:"center",justifyContent:"center",overflow:"hidden"});panel.id="moonlight-stream-screen";
  var image=element("img",panel,{display:"none",position:"absolute",left:"0",top:"0",width:"100%",height:"100%",objectFit:"contain"});image.alt="Remote stream";
  var liveImage=element("div",panel,{display:"none",position:"absolute",left:"0",top:"0",width:"100%",height:"100%",backgroundSize:"contain",backgroundPosition:"center",backgroundRepeat:"no-repeat"});liveImage.setAttribute("aria-label","Remote stream");liveImage.id="moonlight-stream-native-image";
  var message=element("div",panel,{position:"relative",zIndex:"1",fontSize:"22px",color:"#b7c6dd",padding:"20px",textAlign:"center",backgroundColor:"#0c1220"});message.setAttribute("role","status");
  var client=null,lifetime=null,loading=false,lastImage="",imageStarted=0,visible=false,stopping=false,hasImage=false,nativeInput=null,fullInput=false,lastPad="",nativeButtons=0,nativeAxes=[0,0],pressedKeys=new Set(),suspended=false;
  function send(state){
   if(!client||stopping)return;var signature=state.join(",");if(signature===lastPad)return;
   var result=client.gamepad.apply(client,state);if(typeof result!=="number"||result>=0)lastPad=signature;
  }
  function release(){
   if(client){client.gamepad(0,0,0,0,0,0,0);for(var code of pressedKeys)client.key(code,false,0);}
   pressedKeys.clear();lastPad="";nativeButtons=0;nativeAxes=[0,0];
  }
  function stop(){if(stopping||!visible)return lifetime;release();stopping=true;message.textContent="Stopping stream…";message.style.display="block";if(client)return client.stop();return lifetime;}
  function status(text){message.textContent=text;if(!hasImage||stopping)message.style.display="block";}
  function showImage(){hasImage=true;message.style.display="none";}
  image.onload=function(){loading=false;image.style.display="block";showImage();};image.onerror=function(){loading=false;options.log("Image presentation failed");};
  function nativeAction(name,phase,x,y){
   if(!visible||!client||stopping||suspended||nativeInput||fullInput)return;
   var down=phase===0||phase===3;
   if(name==="nav-move"&&global.MoonlightControllerInput){var axes=global.MoonlightControllerInput.fromNpad(0,Number(x)*32767,Number(y)*32767,0,0).state;nativeAxes=[axes[3],axes[4]];}
   var flag={"nav-up":1,"nav-down":2,"nav-left":4,"nav-right":8,accept:0x2000,cancel:0x1000}[name]||0;
   nativeButtons=down?nativeButtons|flag:nativeButtons&~flag;send([nativeButtons,0,0,nativeAxes[0],nativeAxes[1],0,0]);
  }
  function poll(){
   if(!visible||!client||stopping||suspended)return;
   var input=null;
   if(nativeInput){
    try{input=nativeInput.poll();}catch(error){options.log("Controller input failed: "+error.message);nativeInput.close();nativeInput=null;release();}
   }
   if(!nativeInput&&global.MoonlightControllerInput&&navigator.getGamepads){
    try{var pads=Array.from(navigator.getGamepads());for(var pad of pads){input=global.MoonlightControllerInput.fromBrowser(pad);if(input)break;}}catch(_){}
   }
   if(input){
    fullInput=true;if(input.exit){stop();return;}send(input.state);
   }else if(fullInput){release();fullInput=false;}
  }
  function key(event,down){
   if(!visible)return false;if(event.key==="Escape"){if(down)stop();return true;}
   if(client&&!stopping&&!suspended){
    var code=event.keyCode||{Enter:13,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40," ":32}[event.key];
    if(code&&(!down||!pressedKeys.has(code))){client.key(code,down,(event.shiftKey?1:0)|(event.ctrlKey?2:0)|(event.altKey?4:0)|(event.metaKey?8:0));if(down)pressedKeys.add(code);else pressedKeys.delete(code);}
   }
   return true;
  }
  function show(host,app,mode){
   if(lifetime)return lifetime;
   visible=true;stopping=false;loading=false;hasImage=false;lastImage="";lastPad="";nativeButtons=0;nativeAxes=[0,0];fullInput=false;suspended=false;pressedKeys.clear();image.style.display="none";liveImage.style.display="none";panel.style.display="flex";status("Starting "+app.title+"… · Press − and + together to exit");
   if(global.MoonlightControllerInput)try{nativeInput=global.MoonlightControllerInput.createNative();}catch(error){options.log("Native controller unavailable: "+error.message);}
   client=global.MoonlightStreamClient.create({host:host,app:app,mode:global.MoonlightSettings.validate(mode),onStatus:status,onImage:function(url){
    if(url===lastImage)return;lastImage=url;
    if(url.indexOf("live:/")===0){loading=false;image.style.display="none";liveImage.style.backgroundImage='url("'+url+'")';liveImage.style.display="block";showImage();}
    else{liveImage.style.display="none";loading=true;imageStarted=Date.now();image.src=url;}
   },canPresent:function(){return !loading||Date.now()-imageStarted>1000;},log:options.log,onStats:options.onStats,onError:function(error){options.log("Error: "+error.message);}});
   lifetime=client.start().then(function(result){return result;}).finally(function(){
    visible=false;if(nativeInput){nativeInput.close();nativeInput=null;}pressedKeys.clear();client=null;lifetime=null;panel.style.display="none";image.removeAttribute("src");liveImage.style.backgroundImage="none";options.onBack();
   });
   return lifetime;
  }
  function suspend(value){suspended=!!value;if(suspended)release();}
  function destroy(){var done=stop();image.onload=image.onerror=null;return Promise.resolve(done).finally(function(){if(panel.parentNode)panel.parentNode.removeChild(panel);});}
  return {show:show,stop:stop,poll:poll,action:nativeAction,key:key,suspend:suspend,destroy:destroy};
 }
 global.MoonlightStreamScreen={create:create};
})(window);
