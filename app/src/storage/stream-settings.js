/* Stream preferences; native storage is confined to the experiment directory. */
(function(global){
 "use strict";
 var resolutions=[{width:640,height:360},{width:960,height:540},{width:1280,height:720},{width:1920,height:1080}];
 var frameRates=[15,30,60],bitrates=[1000,2000,3000,5000,8000,10000,15000,20000,25000,30000,40000,50000,60000,70000,80000];
 function mouseDefaults(){return {speed:34,swapButtons:false,invertScroll:false};}
 function validateMouse(value){
  if(value===undefined)return mouseDefaults();
  if(!value||!Number.isInteger(value.speed)||value.speed<0||value.speed>100||typeof value.swapButtons!=="boolean"||typeof value.invertScroll!=="boolean")throw Error("Invalid gamepad mouse settings");
  return {speed:value.speed,swapButtons:value.swapButtons,invertScroll:value.invertScroll};
 }
 function defaults(){return {width:1280,height:720,fps:60,bitrate:20000,showStats:false,videoPacing:"smooth",rumble:true,touchMode:"trackpad",mouse:mouseDefaults()};}
 function validate(mode){
  if(!mode||!resolutions.some(function(r){return r.width===mode.width&&r.height===mode.height;})||frameRates.indexOf(mode.fps)<0||bitrates.indexOf(mode.bitrate)<0)throw Error("Invalid stream settings");
  if(mode.showStats!==undefined&&typeof mode.showStats!=="boolean")throw Error("Invalid performance overlay setting");
  if(mode.videoPacing!==undefined&&mode.videoPacing!=="smooth"&&mode.videoPacing!=="latency")throw Error("Invalid video pacing setting");
  if(mode.rumble!==undefined&&typeof mode.rumble!=="boolean")throw Error("Invalid gamepad rumble setting");
  if(mode.touchMode!==undefined&&mode.touchMode!=="trackpad"&&mode.touchMode!=="touchpad")throw Error("Invalid touchscreen mode");
  return {width:mode.width,height:mode.height,fps:mode.fps,bitrate:mode.bitrate,showStats:mode.showStats===true,videoPacing:mode.videoPacing||"smooth",rumble:mode.rumble!==false,touchMode:mode.touchMode||"trackpad",mouse:validateMouse(mode.mouse)};
 }
 function create(fs){return {
  load:function(){var text=fs.read();if(text===null)return defaults();var value=JSON.parse(text);if(!value||value.version!==1)throw Error("Unsupported stream settings");return validate(value.mode);},
  save:function(mode){var text=JSON.stringify({version:1,mode:validate(mode)});fs.write(text);fs.commit();if(fs.read()!==text)throw Error("Stream settings could not be verified");}
 };}
 global.MoonlightSettings={resolutions:resolutions,frameRates:frameRates,bitrates:bitrates,defaults:defaults,validate:validate,mouseDefaults:mouseDefaults,validateMouse:validateMouse,create:create};
})(typeof window!=="undefined"?window:globalThis);
