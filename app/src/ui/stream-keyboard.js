/* English streaming keyboard. Touch and controller are explicit opening modes.
 * Layout/interaction reference: XITRIX/Moonlight-Switch, a75fee223914f36e.
 * Key transitions are queued through the owning streaming client. */
(function(global){
 "use strict";
 function key(id,code,label,width,shift,modifier,extended){return {id:id,code:code,label:label,width:width||1,shift:shift,modifier:modifier||0,extended:!!extended};}
 function letter(value){return key("Key"+value,value.charCodeAt(0),value.toLowerCase(),1,value);}
 var rows=[
  [key("Escape",27,"Esc")].concat(Array.from({length:12},function(_,i){return key("F"+(i+1),112+i,"F"+(i+1));}),[key("Delete",46,"Del",1,null,0,true)]),
  [key("Backquote",192,"`",1,"~")].concat(Array.from("1234567890",function(c,i){return key("Digit"+c,c.charCodeAt(0),c,1,"!@#$%^&*()"[i]);}),[key("Minus",189,"-",1,"_"),key("Equal",187,"=",1,"+"),key("Backspace",8,"Backspace",2)]),
  [key("Tab",9,"Tab",1.5)].concat(Array.from("QWERTYUIOP",letter),[key("BracketLeft",219,"[",1,"{"),key("BracketRight",221,"]",1,"}"),key("Backslash",220,"\\",1.5,"|")]),
  [key("CapsLock",20,"Caps",1.75)].concat(Array.from("ASDFGHJKL",letter),[key("Semicolon",186,";",1,":"),key("Quote",222,"'",1,'"'),key("Enter",13,"Enter",2.25)]),
  [key("ShiftLeft",160,"Shift",2.25,null,1)].concat(Array.from("ZXCVBNM",letter),[key("Comma",188,",",1,"<"),key("Period",190,".",1,">"),key("Slash",191,"/",1,"?"),key("ShiftRight",161,"Shift",2.75,null,1)]),
  [key("ControlLeft",162,"Ctrl",1,null,2),key("MetaLeft",91,"Win",1,null,8,true),key("AltLeft",164,"Alt",1,null,4),key("Space",32,"Space",5),key("AltRight",165,"Alt",1,null,4,true),key("MetaRight",92,"Win",1,null,8,true),key("ControlRight",163,"Ctrl",1,null,2,true),key("ArrowLeft",37,"Left",1,null,0,true),key("ArrowUp",38,"Up",1,null,0,true),key("ArrowDown",40,"Down",1,null,0,true),key("ArrowRight",39,"Right",1,null,0,true)]
 ];
 var byId=new Map(),byCode=new Map();
 rows.forEach(function(row){row.forEach(function(k){byId.set(k.id,k);byCode.set(k.code,k);});});
 function describe(code){return byCode.get(code)||{id:"Code"+code,code:code,modifier:({16:1,17:2,18:4})[code]||0,extended:false};}
 function createKeys(options){
  var owners=new Map(),sent=new Map(),listeners=new Set(),caps=false;
  function notify(){for(var listener of listeners)listener();}
  function modifiers(){var mask=0;for(var k of sent.values())mask|=k.modifier||0;return mask;}
  function reset(){owners.clear();sent.clear();options.reset();notify();}
  function emit(k,down,extra){
   var result=options.key(k.code,down,modifiers()|(k.extended?16:0)|(extra===undefined?k.extra||0:extra));
   if(result!==0){reset();if(result!==-1&&options.onError)options.onError("Keyboard input could not be queued. Lift all fingers and try again.");return false;}
   if(down){sent.set(k.code,k);if(k.code===20)caps=!caps;}else sent.delete(k.code);
   return true;
  }
  function set(owner,keys,releaseExtra){
   var old=owners.get(owner)||[];
   if(old.length===keys.length&&old.every(function(k,i){return k.code===keys[i].code&&(k.extra||0)===(keys[i].extra||0)&&!!k.extended===!!keys[i].extended;}))return true;
   owners.set(owner,keys);var desired=new Map();
   for(var list of owners.values())for(var k of list)desired.set(k.code,k);
   // Release ordinary keys before modifiers. Press modifiers before other keys,
   // even when all contacts arrive in the same snapshot in arbitrary order.
   for(var modifier of [false,true])for(var item of Array.from(sent.values()))if(!!item.modifier===modifier&&!desired.has(item.code)){if(!emit(item,false,releaseExtra))return false;}
   for(var modifier of [true,false])for(var item of desired.values())if(!!item.modifier===modifier&&!sent.has(item.code)){if(!emit(item,true))return false;}
   if(!keys.length)owners.delete(owner);notify();return true;
  }
  return {set:set,clear:function(owner,extra){return set(owner,[],extra);},reset:reset,modifiers:modifiers,
   pressed:function(code){return sent.has(code);},caps:function(){return caps;},subscribe:function(fn){listeners.add(fn);return function(){listeners.delete(fn);};}};
 }
 function create(options){
  var keys=options.keys,mode=null,armed=false,gamepadArmed=false,lastButtons=0,nextRepeat=0,selected={row:2,index:1},latched=new Set(),held=null,buttons=[],destroyed=false,geometry=null;
  var clock=options.now||function(){return Date.now();};
  function element(tag,parent,style,text){var n=document.createElement(tag);Object.assign(n.style,style);if(text!==undefined)n.textContent=text;parent.appendChild(n);return n;}
  var layer=element("div",options.parent,{position:"absolute",left:"0",top:"0",right:"0",bottom:"0",zIndex:"5",display:"none",alignItems:"flex-end",justifyContent:"center",backgroundColor:"rgba(0,0,0,0.15)",touchAction:"none",userSelect:"none"});layer.id="moonlight-stream-keyboard";layer.setAttribute("role","dialog");layer.setAttribute("aria-label","English virtual keyboard");
  var panel=element("div",layer,{width:"100%",boxSizing:"border-box",backgroundColor:"rgba(20,29,43,0.97)",borderTop:"1px solid #61718a",fontFamily:"BodyFont, Arial, sans-serif",fontWeight:"400"});panel.id="moonlight-stream-keyboard-panel";
  rows.forEach(function(row,r){
   var line=element("div",panel,{display:"flex",justifyContent:"center"});var total=row.reduce(function(n,k){return n+k.width;},0);
   row.forEach(function(k,i){
    var node=element("div",line,{display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",border:"2px solid #46566e",borderRadius:"6px",color:"#fff",fontFamily:"BodyFont, Arial, sans-serif",fontWeight:"400",flexShrink:"0"});
    node.id="moonlight-key-"+k.id;node.setAttribute("role","button");node.setAttribute("tabindex","-1");node.setAttribute("aria-label",k.label);node.setAttribute("data-key",k.id);
    buttons.push({node:node,key:k,row:r,index:i,total:total});
   });
  });
  function resize(){
   if(!mode)return;geometry=null;
   var bounds=options.parent.getBoundingClientRect(),scale=Math.min(bounds.width/1280,bounds.height/720),unit=(bounds.width-32*scale-15*6*scale)/15;
   panel.style.padding=12*scale+"px "+16*scale+"px";
   for(var b of buttons){b.node.style.width=(b.key.width*unit+(b.key.width-1)*6*scale)+"px";b.node.style.height=(b.row===0?38:48)*scale+"px";b.node.style.margin="0 "+3*scale+"px "+6*scale+"px";b.node.style.fontSize=(b.key.label.length>4?16:20)*scale+"px";}
  }
  function paint(){
   var shifted=!!(keys.modifiers()&1);
   for(var b of buttons){
    var active=b.key.code===20?keys.caps():keys.pressed(b.key.code),focus=mode==="gamepad"&&b.row===selected.row&&b.index===selected.index;
    var upper=shifted;if(/^Key[A-Z]$/.test(b.key.id))upper=shifted!==keys.caps();
    b.node.textContent=upper&&b.key.shift!==undefined&&b.key.shift!==null?b.key.shift:b.key.label;
    b.node.style.backgroundColor=active?"#23675e":"#303c50";b.node.style.borderColor=focus?"#00efcf":active?"#79d8c9":"#46566e";
    b.node.setAttribute("aria-pressed",active?"true":"false");b.node.setAttribute("data-selected",focus?"true":"false");
   }
  }
  var unsubscribe=keys.subscribe(paint);
  function syncGamepad(){var list=Array.from(latched,function(id){return byId.get(id);});if(held)list.push(byId.get(held));return keys.set("keyboard-gamepad",list);}
  function close(){
   if(!mode)return;var closedMode=mode;mode=null;layer.style.display="none";layer.removeAttribute("data-mode");armed=gamepadArmed=false;lastButtons=0;latched.clear();held=null;
   keys.clear("keyboard-touch");keys.clear("keyboard-gamepad");paint();if(options.onClose)options.onClose(closedMode);
  }
  function open(openMode){
   if(destroyed||mode)return false;if(openMode!=="touch"&&openMode!=="gamepad")throw Error("Invalid keyboard opening mode");
   mode=openMode;armed=gamepadArmed=false;lastButtons=0;selected={row:2,index:1};layer.style.display="flex";layer.setAttribute("data-mode",mode);
   resize();paint();return true;
  }
  function updateTouches(points,enabled){
   if(!mode)return;if(!enabled){close();return;}
   if(!armed){if(!points.length)armed=true;return;}
   if(!geometry)geometry={bounds:panel.getBoundingClientRect(),buttons:buttons.map(function(b){return {key:b.key,rect:b.node.getBoundingClientRect()};})};
   var bounds=geometry.bounds,list=[],ids=new Set();
   for(var p of points){
    if(ids.size>=16||!Number.isInteger(p.id)||p.id<0||p.id>0xffffffff||ids.has(p.id)||!Number.isFinite(p.x)||!Number.isFinite(p.y)){close();return;}ids.add(p.id);
    if(p.x<bounds.left||p.x>=bounds.right||p.y<bounds.top||p.y>=bounds.bottom){close();return;}
    for(var b of geometry.buttons){var r=b.rect;if(p.x>=r.left&&p.x<r.right&&p.y>=r.top&&p.y<r.bottom){list.push(b.key);break;}}
   }
   if(!keys.set("keyboard-touch",list)){armed=false;latched.clear();held=null;}
  }
  function move(direction){
   if(held){held=null;syncGamepad();}
   var row=rows[selected.row];
   if(direction==="left"||direction==="right")selected.index=Math.max(0,Math.min(row.length-1,selected.index+(direction==="left"?-1:1)));
   else{
    var source=buttons.find(function(b){return b.row===selected.row&&b.index===selected.index;}).node.getBoundingClientRect(),x=source.left+source.width/2;
    selected.row=Math.max(0,Math.min(rows.length-1,selected.row+(direction==="up"?-1:1)));
    var distance=Infinity;for(var b of buttons)if(b.row===selected.row){var rect=b.node.getBoundingClientRect(),d=Math.abs(rect.left+rect.width/2-x);if(d<distance){distance=d;selected.index=b.index;}}
   }
   paint();
  }
  function controller(buttons){
   if(mode!=="gamepad")return false;
   if(!gamepadArmed){if(!buttons)gamepadArmed=true;lastButtons=buttons;return true;}
   if((buttons&0x1000)&&!(lastButtons&0x1000)){close();return true;}
   var now=clock(),direction=[[1,"up"],[2,"down"],[4,"left"],[8,"right"]].find(function(d){return buttons&d[0];});
   if(direction&&(!(lastButtons&direction[0])||now>=nextRepeat)){move(direction[1]);nextRepeat=now+(!(lastButtons&direction[0])?350:100);}
   if((buttons&0x2000)&&!(lastButtons&0x2000)){
    var k=rows[selected.row][selected.index];if(k.modifier){if(latched.has(k.id))latched.delete(k.id);else latched.add(k.id);}else held=k.id;
    if(!syncGamepad()){latched.clear();held=null;gamepadArmed=false;}
   }else if(!(buttons&0x2000)&&(lastButtons&0x2000)){held=null;syncGamepad();}
   lastButtons=buttons;return true;
  }
  function action(name,phase){
   if(mode!=="gamepad")return false;
   var flag={"nav-up":1,"nav-down":2,"nav-left":4,"nav-right":8,accept:0x2000,cancel:0x1000}[name];
   // Action-only input has no neutral snapshots. A fresh press can arm it;
   // an inherited repeat must wait for release before it can type.
   if(flag&&!gamepadArmed){if(phase===0)gamepadArmed=true;else{if(phase!==3)controller(0);return true;}}
   if(flag){var down=phase===0||phase===3;controller(down?lastButtons|flag:lastButtons&~flag);}return true;
  }
  global.addEventListener("resize",resize);
  return {open:open,close:close,isOpen:function(){return mode!==null;},mode:function(){return mode;},updateTouches:updateTouches,controller:controller,action:action,
   destroy:function(){close();destroyed=true;unsubscribe();global.removeEventListener("resize",resize);if(layer.parentNode)layer.parentNode.removeChild(layer);}};
 }
 global.MoonlightStreamKeyboard={create:create,createKeys:createKeys,rows:rows,byId:byId,describe:describe};
})(typeof window!=="undefined"?window:globalThis);
