/* Port of Moonlight-Switch's StreamingInputOverlay mouse controls (GPL-3.0).
 * Original: Daniil Vinogradov, 2021, XITRIX/Moonlight-Switch a75fee223914f36e,
 * app/src/streaming_input_overlay.cpp. CivSwitch timing/queue ownership adapted. */
(function(global){
 "use strict";
 function create(options){
  var active=false,paused=false,armed=false,sampled=false,lastButtons=0,lastTime=0,scrollTime=0,scrollSign=0,held=0,rx=0,ry=0,prefs=global.MoonlightSettings.mouseDefaults();
  var clock=options.now||function(){return Date.now();};
  function reset(){options.reset();held=0;rx=ry=0;scrollSign=0;lastTime=scrollTime=clock();armed=sampled=false;lastButtons=0;}
  function send(name,args){
   var result=options[name].apply(null,args);if(result===0)return true;
   reset();if(result!==-1&&options.onError)options.onError("Mouse input could not be queued. Release the controller and try again.");return false;
  }
  function close(){if(!active)return;reset();active=paused=false;if(options.onClose)options.onClose();}
  function neutral(state){return !state[0]&&state[1]<32&&state[2]<32&&state.slice(3).every(function(v){return Math.abs(v)<=3932;});}
  function axis(value){return Math.max(-1,Math.min(1,value/32767));}
  function controller(state,enabled){
   if(!active)return false;if(paused)return true;
   if(!Array.isArray(state)||state.length!==7||!state.every(Number.isFinite)){reset();return true;}
   var buttons=state[0],now=clock(),before=lastButtons;lastButtons=buttons;
   if(enabled===false){reset();return true;}
   if(sampled&&(buttons&0x1000)&&!(before&0x1000)){close();return true;}sampled=true;
   if(!armed){lastTime=scrollTime=now;if(neutral(state)){armed=true;if(options.onReady)options.onReady();}return true;}
   if((buttons&0x8000)&&!(before&0x8000)){reset();paused=true;if(options.onKeyboard)options.onKeyboard();return true;}
   if((buttons&0x4000)&&!(before&0x4000)){reset();paused=true;if(options.onOptions)options.onOptions();return true;}
   if((buttons&0x20)&&!(before&0x20)&&options.onHints)options.onHints();
   var wanted=(state[2]>=128?(prefs.swapButtons?2:1):0)|(state[1]>=128?(prefs.swapButtons?1:2):0);
   for(var down of [false,true])for(var bit of [1,2])if(!!(wanted&bit)===down&&!!(held&bit)!==down){
    if(!send("button",[bit===1?1:3,down]))return true;held=down?held|bit:held&~bit;
   }
   var elapsed=Math.max(0,Math.min(50,now-lastTime));lastTime=now;
   var speed=15+(buttons&0x200?10:0)-(buttons&0x100?10:0),x=axis(state[3])*speed,y=-axis(state[4])*speed;
   if(Math.abs(x)<2)x=0;if(Math.abs(y)<2)y=0;
   var multiplier=.5+prefs.speed/100*1.5;rx+=x*multiplier*elapsed*.06;ry+=y*multiplier*elapsed*.06;
   var dx=Math.trunc(rx),dy=Math.trunc(ry);if(dx||dy){if(!send("move",[dx,dy]))return true;rx-=dx;ry-=dy;}
   var scroll=-axis(state[6])*(prefs.invertScroll?-1:1),sign=Math.sign(scroll);
   if(Math.abs(scroll)<.2){scrollSign=0;scrollTime=now;}
   else if(sign!==scrollSign){scrollSign=sign;scrollTime=now;}
   else if(now-scrollTime>=550-Math.abs(scroll)*500){scrollTime=now;send("scroll",[0,sign*120]);}
   return true;
  }
  return {open:function(value){prefs=global.MoonlightSettings.validateMouse(value);active=true;paused=false;reset();},close:close,controller:controller,
   pause:function(){if(active){reset();paused=true;}},resume:function(){if(active){reset();paused=false;}},configure:function(value){prefs=global.MoonlightSettings.validateMouse(value);reset();},
   isOpen:function(){return active;},isPaused:function(){return paused;},settings:function(){return Object.assign({},prefs);}};
 }
 global.MoonlightGamepadMouse={create:create};
})(typeof window!=="undefined"?window:globalThis);
