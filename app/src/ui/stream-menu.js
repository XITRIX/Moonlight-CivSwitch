/* Stream controls in the CivHomebrew left-drawer style. No native ownership. */
(function(global){
 "use strict";
 function create(options){
  var page="",selected=0,rows=[],items=[],host="",mode="trackpad",closed=false,ignoreUntil=0,last={name:"",time:0},nextRepeat=0,layouts=[],scale=1,touch=null,touchBlocked=false;
  var font="BodyFont, BodyFont-JP, BodyFont-KR, BodyFont-SC, BodyFont-TC, Arial, sans-serif";
  function node(tag,parent,style,text){
   var n=document.createElement(tag),pixels={};
   for(var property in style){if(typeof style[property]==="number"){pixels[property]=style[property];n.style[property]=style[property]*scale+"px";}else n.style[property]=style[property];}
   if(Object.keys(pixels).length)layouts.push({node:n,pixels:pixels});if(text!==undefined)n.textContent=text;parent.appendChild(n);return n;
  }
  var overlay=node("div",options.parent,{position:"absolute",left:0,right:0,top:0,bottom:0,display:"none",backgroundColor:"rgba(0,0,0,0.64)",zIndex:"5",color:"#f5f5f5",fontFamily:font,fontWeight:"400"});overlay.id="moonlight-stream-menu";
  overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-labelledby","moonlight-stream-menu-title");
  node("div",overlay,{position:"absolute",left:15,right:30,top:0,height:87,backgroundColor:"rgba(0,0,0,0.85)",borderBottom:"1px solid #aaa"});
  node("div",overlay,{position:"absolute",left:15,top:87,width:420,bottom:74,backgroundColor:"rgba(10,10,10,0.96)"});
  var title=node("div",overlay,{position:"absolute",left:30,right:30,top:35,fontSize:32,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"});title.id="moonlight-stream-menu-title";
  var list=node("div",overlay,{position:"absolute",left:28,top:166,width:396,bottom:75,overflowY:"auto",paddingRight:10,boxSizing:"border-box"});list.id="moonlight-stream-menu-list";
  var description=node("div",overlay,{position:"absolute",left:460,top:100,width:400,paddingTop:16,paddingBottom:16,paddingLeft:28,paddingRight:28,fontSize:22,lineHeight:31,whiteSpace:"pre-wrap",overflowWrap:"break-word",backgroundColor:"rgba(0,0,0,0.8)"});description.id="moonlight-stream-menu-description";description.setAttribute("role","status");
  var foot=node("div",overlay,{position:"absolute",left:15,width:420,height:74,bottom:0,borderTop:"1px solid #aaa",backgroundColor:"#000",display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:30,boxSizing:"border-box"});
  function footer(letter,text,fn){
   var b=node("button",foot,{display:"flex",alignItems:"center",backgroundColor:"transparent",color:"#fff",border:"0",fontFamily:font,fontWeight:"400",fontSize:23,marginLeft:28,padding:0});b.type="button";b.tabIndex=-1;
   node("span",b,{display:"flex",alignItems:"center",justifyContent:"center",width:25,height:25,marginRight:10,border:"1px solid #fff",borderRadius:"50%",fontFamily:font,fontSize:18},letter);
   node("span",b,{fontFamily:font,fontWeight:"400"},text);b.addEventListener("click",fn);return b;
  }
  var backButton=footer("B","Back",back),acceptButton=footer("A","OK",activate),fixedLayouts=layouts.length;
  function resize(){
   var bounds=options.parent.getBoundingClientRect();scale=Math.min(bounds.width/1280,bounds.height/720)||1;
   for(var layout of layouts)for(var property in layout.pixels)layout.node.style[property]=layout.pixels[property]*scale+"px";
  }
  function definitions(){
   if(page==="more")return [
    {id:"mouse",label:"Mouse by Gamepad",description:"Move, click, drag and scroll with the controller."},
    {id:"keyboard",label:"Show keyboard",description:"Use the controller to type and hold keyboard shortcuts."},
    {id:"touchscreen",label:"Touchscreen mode",value:mode==="trackpad"?"Trackpad":"Touchpad",description:"Choose how the touchscreen controls this stream."}
   ];
   if(page==="touchscreen")return [
    {id:"trackpad",label:"Trackpad",description:"Move the cursor with one finger. Tap to click. Swipe with two fingers to scroll."},
    {id:"touchpad",label:"Touchpad",description:"Send each finger directly to Sunshine. Requires host touch support."}
   ];
   return [
    {id:"more",label:"More",value:">",description:"Mouse, keyboard and touchscreen controls."},
    {id:"logout",label:"Logout",description:"Disconnect from the host or terminate the running app."}
   ];
  }
  function paint(){
   rows.forEach(function(row,i){var active=i===selected;row.style.borderColor=active?"#80e0e6":"transparent";row.style.backgroundColor=active?"#333":"transparent";row.setAttribute("data-selected",String(active));});
   var item=items[selected];description.textContent=item?item.label+"\n\n"+item.description:"";
  }
  function draw(){
   while(list.firstChild)list.removeChild(list.firstChild);layouts.length=fixedLayouts;rows=[];items=definitions();overlay.setAttribute("data-page",page);
   items.forEach(function(item,i){
    var row=node("button",list,{width:"100%",height:70,display:"flex",alignItems:"center",justifyContent:"space-between",paddingLeft:16,paddingRight:16,border:"3px solid transparent",boxSizing:"border-box",fontFamily:font,fontWeight:"400",fontSize:23,textAlign:"left",color:"#f5f5f5",backgroundColor:"transparent",outline:"none"});row.type="button";row.tabIndex=-1;row.id="moonlight-stream-menu-"+item.id;
    node("span",row,{fontFamily:font,fontWeight:"400"},item.label);
    node("span",row,{fontFamily:font,fontWeight:"400",color:"#00efcf",marginLeft:16},page==="touchscreen"?(item.id===mode?"On":""):item.value||"");
    if(page==="touchscreen"){row.setAttribute("role","menuitemradio");row.setAttribute("aria-checked",String(item.id===mode));}
    row.addEventListener("click",function(){if(!page)return;selected=i;paint();activate();});rows.push(row);
   });resize();paint();
  }
  function resetActions(){ignoreUntil=Date.now()+150;last={name:"",time:0};nextRepeat=0;}
  function show(name,touchMode,touching,restoreLogout){
   if(closed)return;host=name;title.textContent=host;mode=touchMode;page="main";selected=restoreLogout?1:0;touch=null;touchBlocked=!!touching;list.scrollTop=0;resetActions();overlay.style.display="block";draw();
  }
  function hide(){if(!page)return;page="";touch=null;overlay.style.display="none";overlay.removeAttribute("data-page");if(options.onClose)options.onClose();}
  function back(){
   if(!page)return;
   if(page==="main"){hide();return;}
   selected=page==="touchscreen"?2:0;page=page==="touchscreen"?"more":"main";resetActions();draw();
  }
  function activate(){
   if(!page)return;var id=items[selected].id;
   if(id==="more"||id==="touchscreen"){page=id;selected=id==="touchscreen"&&mode==="touchpad"?1:0;resetActions();draw();return;}
   if(id==="keyboard"){hide();options.onKeyboard();return;}
   if(id==="mouse"){hide();options.onMouse();return;}
   if(id==="logout"){hide();options.onLogout();return;}
   try{options.onTouchMode(id);mode=id;draw();}catch(error){description.textContent="Could not save touchscreen mode.\n\n"+error.message;}
  }
  function action(name,phase,x,y){
   if(!page)return false;if(name==="keyboard-escape")name="cancel";
   if(name==="nav-move"){if(Math.abs(Number(y))>.5)name=Number(y)>0?"nav-up":"nav-down";else return true;}
   if(phase!==0&&phase!==3)return true;
   var now=Date.now();if(now<ignoreUntil||last.name===name&&now-last.time<90)return true;
   if(name==="nav-up"||name==="nav-down"){
    if(phase===3&&now<nextRepeat)return true;nextRepeat=now+(phase===0?350:150);selected=Math.max(0,Math.min(items.length-1,selected+(name==="nav-up"?-1:1)));paint();
   }else if(phase===0){if(name==="cancel")back();else if(name==="accept")activate();}
   last={name:name,time:now};return true;
  }
  function key(event,down){
   if(!page)return false;if(down){var name={ArrowUp:"nav-up",ArrowDown:"nav-down",Enter:"accept",Escape:"cancel",Tab:event.shiftKey?"nav-up":"nav-down"}[event.key];if(name)action(name,event.repeat?3:0);}return true;
  }
  function target(point){
   var targets=rows.concat([backButton,acceptButton]);
   for(var n of targets){var r=n.getBoundingClientRect();if(point.x>=r.left&&point.x<r.right&&point.y>=r.top&&point.y<r.bottom)return n;}
   return null;
  }
  function updateTouches(points){
   if(!page)return;
   if(touchBlocked){if(!points.length)touchBlocked=false;return;}
   if(points.length>1){touch=null;touchBlocked=true;return;}
   if(points.length){var p=points[0];
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y)){touch=null;touchBlocked=true;return;}
    if(!touch){touch={id:p.id,x:p.x,y:p.y,target:target(p),valid:true};}
    else if(p.id!==touch.id||Math.hypot(p.x-touch.x,p.y-touch.y)>12*scale||target(p)!==touch.target)touch.valid=false;
    return;
   }
   var ended=touch;touch=null;if(!ended||!ended.valid)return;
   if(ended.target===backButton)back();else if(ended.target===acceptButton)activate();
   else {var index=rows.indexOf(ended.target);if(index>=0){selected=index;paint();activate();}else if(ended.x>435*scale&&ended.y>87*scale)hide();}
  }
  global.addEventListener("resize",resize);
  return {show:show,hide:hide,isOpen:function(){return !!page;},action:action,key:key,updateTouches:updateTouches,cancelTouches:function(){touch=null;touchBlocked=true;},
   destroy:function(){hide();closed=true;global.removeEventListener("resize",resize);if(overlay.parentNode)overlay.parentNode.removeChild(overlay);}};
 }
 global.MoonlightStreamMenu={create:create};
})(window);
