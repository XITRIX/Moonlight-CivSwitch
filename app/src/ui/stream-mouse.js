/* Gamepad mouse overlay and preferences, matching the stream keyboard footer. */
(function(global){
 "use strict";
 function create(options){
  var editing=false,keyboardPaused=false,hidden=false,draft=null,selected=0,lastButtons=0,ignoreUntil=0,lastAction={name:"",time:0},nextRepeat=0,layouts=[],touch=null,touchBlocked=false,scale=1,rows=[],actions=[];
  var font="BodyFont, Arial, sans-serif";
  function node(tag,parent,style,text){var n=document.createElement(tag),pixels={};for(var p in style){if(typeof style[p]==="number"){pixels[p]=style[p];n.style[p]=style[p]*scale+"px";}else n.style[p]=style[p];}if(Object.keys(pixels).length)layouts.push({node:n,pixels:pixels});if(text!==undefined)n.textContent=text;parent.appendChild(n);return n;}
  var layer=node("div",options.parent,{display:"none",position:"absolute",left:0,right:0,top:0,bottom:0,zIndex:"4",fontFamily:font,fontWeight:"400",color:"#f5f5f5"});layer.id="moonlight-gamepad-mouse";
  var errorBox=node("div",layer,{display:"none",position:"absolute",left:24,top:24,maxWidth:"80vw",padding:12,fontSize:18,backgroundColor:"#1b1e21"});errorBox.id="moonlight-mouse-status";errorBox.setAttribute("role","status");
  var bar=node("div",layer,{position:"absolute",left:0,right:0,bottom:0,paddingLeft:24,paddingRight:24,paddingTop:10,paddingBottom:10,boxSizing:"border-box",backgroundColor:"rgba(27,30,33,0.9)",borderTop:"1px solid #61718a"});bar.id="moonlight-mouse-hints";
  var top=node("div",bar,{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10});
  node("span",top,{fontFamily:font,fontWeight:"400",fontSize:20},"Mouse by Gamepad");
  node("span",top,{fontFamily:font,fontWeight:"400",fontSize:18},"Left stick: Move     Right stick: Scroll     ZR: Left click     ZL: Right click     L/R: Slow/Fast");
  var bottom=node("div",bar,{display:"flex",alignItems:"center",justifyContent:"flex-end"});
  function hint(button,label,fn){
   var b=node("button",bottom,{display:"flex",alignItems:"center",marginLeft:24,padding:0,border:"0",backgroundColor:"transparent",color:"#f5f5f5",fontFamily:font,fontWeight:"400",fontSize:18});b.type="button";b.tabIndex=-1;
   node("span",b,{display:"flex",alignItems:"center",justifyContent:"center",width:button.length>1?44:24,height:24,marginRight:8,border:"1px solid #f5f5f5",borderRadius:button.length>1?"5px":"50%",fontFamily:font,fontWeight:"400",fontSize:17},button);
   var text=node("span",b,{fontFamily:font,fontWeight:"400"},label);if(fn){b.addEventListener("click",fn);actions.push({node:b,fn:fn});}return text;
  }
  hint("-/+","Menu",function(){options.onMenu();});var hideHint=hint("-","Hide hints",toggleHints);
  hint("X","Keyboard",showKeyboard);hint("Y","Options",showOptions);hint("B","Back",close);
  var modal=node("div",layer,{display:"none",position:"absolute",left:0,right:0,top:0,bottom:0,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(0,0,0,0.64)"});modal.id="moonlight-mouse-options";modal.setAttribute("role","dialog");modal.setAttribute("aria-labelledby","moonlight-mouse-options-title");
  var panel=node("div",modal,{width:560,padding:24,boxSizing:"border-box",backgroundColor:"#1b1e21",border:"1px solid #61718a",borderRadius:"8px"});panel.id="moonlight-mouse-options-panel";
  var title=node("div",panel,{fontSize:26,fontWeight:"400",marginBottom:20},"Mouse by Gamepad");title.id="moonlight-mouse-options-title";
  ["Speed","Swap mouse buttons","Invert scroll","Save and back"].forEach(function(label,i){
   var b=node("button",panel,{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",height:52,marginBottom:8,paddingLeft:14,paddingRight:14,boxSizing:"border-box",border:"2px solid transparent",backgroundColor:"transparent",color:"#f5f5f5",fontFamily:font,fontSize:22,fontWeight:"400"});b.type="button";b.tabIndex=-1;b.id="moonlight-mouse-option-"+i;
   node("span",b,{fontFamily:font,fontWeight:"400"},label);var value=node("span",b,{fontFamily:font,fontWeight:"400",color:"#00efcf"});rows.push({node:b,value:value});b.addEventListener("click",function(){selected=i;adjust(1);});
  });
  var message=node("div",panel,{fontSize:18,lineHeight:25,marginTop:16,color:"#b7c6dd"});message.id="moonlight-mouse-options-status";message.setAttribute("role","status");
  var input=global.MoonlightGamepadMouse.create({now:options.now,move:options.move,button:options.button,scroll:options.scroll,reset:options.reset,onReady:function(){errorBox.style.display="none";},onError:function(text){errorBox.textContent=text;errorBox.style.display="block";if(options.onError)options.onError(text);},onHints:toggleHints,onKeyboard:showKeyboard,onOptions:showOptions,onClose:function(){editing=keyboardPaused=false;layer.style.display="none";modal.style.display="none";if(options.onClose)options.onClose();}});
  function resize(){var r=options.parent.getBoundingClientRect();scale=Math.min(r.width/1280,r.height/720)||1;for(var l of layouts)for(var p in l.pixels)l.node.style[p]=l.pixels[p]*scale+"px";}
  function paint(){
   layer.style.display=input.isOpen()&&!keyboardPaused?"block":"none";bar.style.display=!hidden&&!editing?"block":"none";modal.style.display=editing?"flex":"none";
   if(editing){rows.forEach(function(r,i){r.node.style.borderColor=i===selected?"#00efcf":"transparent";r.node.style.backgroundColor=i===selected?"#303a3d":"transparent";r.node.setAttribute("data-selected",String(i===selected));r.value.textContent=i===0?(.5+draft.speed/100*1.5).toFixed(2)+"×":i===1?(draft.swapButtons?"On":"Off"):i===2?(draft.invertScroll?"On":"Off"):"";});}
  }
  function toggleHints(){if(!input.isOpen()||editing||keyboardPaused)return;hidden=!hidden;hideHint.textContent=hidden?"Show hints":"Hide hints";paint();}
  function showKeyboard(){
   if(!input.isOpen()||editing||keyboardPaused)return;input.pause();keyboardPaused=true;paint();
   if(options.onKeyboard()===false)resume();
  }
  function showOptions(){if(!input.isOpen()||keyboardPaused)return;input.pause();editing=true;draft=input.settings();selected=0;lastButtons=0;ignoreUntil=Date.now()+150;lastAction={name:"",time:0};nextRepeat=0;message.textContent="Left/right: Adjust   A: Change   B: Save and back";paint();}
  function saveOptions(){
   try{var next=global.MoonlightSettings.validateMouse(draft);options.onSettings(next);input.configure(next);editing=false;input.resume();paint();}
   catch(error){message.textContent="Could not save mouse settings: "+error.message;}
  }
  function adjust(delta){if(!editing)return;if(selected===3){saveOptions();return;}if(selected===0)draft.speed=Math.max(0,Math.min(100,draft.speed+delta));else {var key=selected===1?"swapButtons":"invertScroll";draft[key]=!draft[key];}paint();}
  function close(){input.close();touch=null;}
  function resume(){if(input.isOpen()){keyboardPaused=false;touch=null;touchBlocked=true;input.resume();paint();}}
  function action(name,phase){
   if(!input.isOpen())return false;
   if(editing){
    if(phase!==0&&phase!==3)return true;var now=Date.now();if(now<ignoreUntil||lastAction.name===name&&now-lastAction.time<90)return true;
    if(name.indexOf("nav-")===0){if(phase===3&&now<nextRepeat)return true;nextRepeat=now+(phase===0?350:150);if(name==="nav-up"||name==="nav-down")selected=Math.max(0,Math.min(3,selected+(name==="nav-up"?-1:1)));else if(selected!==3)adjust(name==="nav-left"?-1:1);paint();}
    else if(phase===0){if(name==="cancel"||name==="keyboard-escape")saveOptions();else if(name==="accept")adjust(1);}lastAction={name:name,time:now};return true;
   }
   if(phase===0){if(name==="cancel"||name==="keyboard-escape")close();else if(name==="keyboard")showKeyboard();else if(name==="options")showOptions();else if(name==="toggle-hints")toggleHints();}return true;
  }
  function controller(state,enabled){
   if(!input.isOpen())return false;
   if(editing){var buttons=state[0],before=lastButtons;lastButtons=buttons;for(var m of [[1,"nav-up"],[2,"nav-down"],[4,"nav-left"],[8,"nav-right"],[0x2000,"accept"],[0x1000,"cancel"]]){if(buttons&m[0])action(m[1],before&m[0]?3:0);else if(before&m[0])action(m[1],1);}return true;}
   return input.controller(state,enabled);
  }
  function target(point){var targets=editing?rows.map(function(r){return r.node;}):hidden?[]:actions.map(function(a){return a.node;});for(var n of targets){var r=n.getBoundingClientRect();if(point.x>=r.left&&point.x<r.right&&point.y>=r.top&&point.y<r.bottom)return n;}return null;}
  function updateTouches(points){
   if(!input.isOpen()||keyboardPaused)return;if(touchBlocked){if(!points.length)touchBlocked=false;return;}
   if(points.length>1){touch=null;touchBlocked=true;return;}
   if(points.length){var p=points[0];if(!touch)touch={id:p.id,x:p.x,y:p.y,target:target(p),valid:true};else if(p.id!==touch.id||Math.hypot(p.x-touch.x,p.y-touch.y)>12*scale||target(p)!==touch.target)touch.valid=false;return;}
   var ended=touch;touch=null;if(!ended||!ended.valid)return;
   if(editing){var index=rows.findIndex(function(r){return r.node===ended.target;});if(index>=0){selected=index;adjust(1);}return;}
   var found=actions.find(function(a){return a.node===ended.target;});if(found&&!hidden)found.fn();else {var r=bar.getBoundingClientRect();if(hidden||ended.y<r.top)close();}
  }
  global.addEventListener("resize",resize);
  return {open:function(prefs,touching){editing=keyboardPaused=hidden=false;hideHint.textContent="Hide hints";touch=null;touchBlocked=!!touching;input.open(prefs);paint();resize();},close:close,resume:resume,isOpen:input.isOpen,controller:controller,action:action,updateTouches:updateTouches,cancelTouches:function(){touch=null;touchBlocked=true;},
   key:function(event,down){if(!input.isOpen())return false;var name={Escape:"cancel",Enter:"accept",ArrowUp:"nav-up",ArrowDown:"nav-down",ArrowLeft:"nav-left",ArrowRight:"nav-right",x:"keyboard",X:"keyboard",y:"options",Y:"options","-":"toggle-hints"}[event.key];if(down&&name)action(name,event.repeat?3:0);return true;},
   destroy:function(){close();global.removeEventListener("resize",resize);if(layer.parentNode)layer.parentNode.removeChild(layer);}};
 }
 global.MoonlightStreamMouse={create:create};
})(window);
