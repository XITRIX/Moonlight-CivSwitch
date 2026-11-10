/* Touchscreen gestures and Sunshine pointers. Native and DOM sources never mix. */
(function(global){
 "use strict";
 function videoRect(bounds,width,height){
  var scale=Math.min(bounds.width/width,bounds.height/height),w=width*scale,h=height*scale;
  return {left:bounds.left+(bounds.width-w)/2,top:bounds.top+(bounds.height-h)/2,width:w,height:h};
 }
 function create(options){
  var previous=new Map(),direct=new Map(),group=null,lastTap=null,drag=false,dirty=false,blocked=options.startBlocked!==false,closed=false,failed=false,rx=0,ry=0;
  var clock=options.now||function(){return Date.now();};
  function clear(){previous.clear();direct.clear();group=null;lastTap=null;drag=dirty=false;rx=ry=0;}
  function cancel(){if(closed)return;var touching=blocked||previous.size!==0;if(dirty||drag||direct.size||previous.size)options.reset();clear();blocked=touching;}
  function send(method,args){
   var result=options[method].apply(null,args);
   if(result===0){dirty=true;return true;}
   options.reset();clear();blocked=true;
   if(result!==-1&&!failed){failed=true;if(options.onError)options.onError(result===-5501?"Host does not support direct touch. Select Trackpad in Settings.":"Touch input could not be queued. Lift all fingers and try again.");}
   return false;
  }
  function button(which,down){return send("mouseButton",[which,down]);}
  function click(which){return button(which,true)&&button(which,false);}
  function update(points,enabled){
   if(closed)return;
   if(!enabled){cancel();blocked=points.length!==0;return;}
   if(blocked){if(!points.length)blocked=false;return;}
   var next=new Map();
   for(var p of points){if(next.size>=16||!Number.isInteger(p.id)||p.id<0||p.id>0xffffffff||!Number.isFinite(p.x)||!Number.isFinite(p.y)||next.has(p.id)){cancel();return;}next.set(p.id,p);}
   var bounds=options.bounds();if(!bounds||bounds.width<=0||bounds.height<=0){cancel();return;}
   var area=videoRect(bounds,options.width,options.height);
   if(options.mode==="touchpad"){
    for(var entry of direct){if(!next.has(entry[0])){var old=entry[1];if(!send("touch",[2,entry[0],old.x,old.y]))return;direct.delete(entry[0]);}}
    for(var pair of next){
     var id=pair[0],point=pair[1],known=direct.get(id),x=(point.x-area.left)/area.width,y=(point.y-area.top)/area.height;
     // A contact beginning in a letterbox bar stays ignored until lifted.
     if(!known&&(previous.has(id)||x<0||x>1||y<0||y>1))continue;
     x=Math.max(0,Math.min(1,x));y=Math.max(0,Math.min(1,y));
     if(!known||known.x!==x||known.y!==y){if(!send("touch",[known?3:1,id,x,y]))return;direct.set(id,{x:x,y:y});}
    }
   }else{
    var time=clock();
    if(!previous.size&&next.size){
     var first=next.values().next().value;
     group={began:time,max:next.size,moved:false,origins:new Map(),primary:first.id};
     if(next.size===1&&lastTap&&time-lastTap.time>=0&&time-lastTap.time<=300&&Math.hypot((first.x-lastTap.x)*1280/bounds.width,(first.y-lastTap.y)*720/bounds.height)<=24){
      lastTap=null;if(!button(1,true))return;drag=true;
     }else lastTap=null;
    }
    if(group){
     if(group.max===1&&next.size===1&&!next.has(group.primary)){cancel();return;}
     group.max=Math.max(group.max,next.size);
     for(var contact of next){
      var origin=group.origins.get(contact[0]);if(!origin){origin=contact[1];group.origins.set(contact[0],origin);}
      if(Math.hypot((contact[1].x-origin.x)*1280/bounds.width,(contact[1].y-origin.y)*720/bounds.height)>12)group.moved=true;
     }
     if(group.max>1&&drag){if(!button(1,false))return;drag=false;group.moved=true;}
     if(group.max===2&&next.size===2){
      var fingers=Array.from(next.values()),cx=(fingers[0].x+fingers[1].x)/2,cy=(fingers[0].y+fingers[1].y)/2,scroll=group.scroll;
      // Rebase when either contact changes; arrival/lift must never move the centroid.
      if(!scroll||!next.has(scroll.ids[0])||!next.has(scroll.ids[1])){
       scroll=group.scroll={ids:[fingers[0].id,fingers[1].id],x:cx,y:cy,lastX:cx,lastY:cy,rx:0,ry:0};
      }
      var sx=1280/bounds.width,sy=720/bounds.height;
      if(!group.scrolling&&Math.hypot((cx-scroll.x)*sx,(cy-scroll.y)*sy)>12){group.scrolling=true;group.moved=true;}
      if(group.scrolling){
       // Natural scrolling: 40 reference pixels = one 120-unit wheel notch.
       scroll.rx-=(cx-scroll.lastX)*sx*3;scroll.ry+=(cy-scroll.lastY)*sy*3;
       scroll.lastX=cx;scroll.lastY=cy;
       var horizontal=Math.max(-32768,Math.min(32767,Math.trunc(scroll.rx))),vertical=Math.max(-32768,Math.min(32767,Math.trunc(scroll.ry)));
       if(horizontal||vertical){if(!send("mouseScroll",[horizontal||0,vertical||0]))return;scroll.rx-=horizontal;scroll.ry-=vertical;}
      }
     }else group.scroll=null;
     if(group.max===1&&next.size===1&&previous.has(group.primary)&&next.has(group.primary)){
      var before=previous.get(group.primary),after=next.get(group.primary);
      rx+=(after.x-before.x)*options.width/area.width;ry+=(after.y-before.y)*options.height/area.height;
      var dx=Math.trunc(rx),dy=Math.trunc(ry);
      if(dx||dy){dx=Math.max(-32768,Math.min(32767,dx));dy=Math.max(-32768,Math.min(32767,dy));if(!send("mouseMove",[dx,dy]))return;rx-=dx;ry-=dy;}
     }
     if(!next.size){
      if(drag){if(!button(1,false))return;drag=false;}
      else if(!group.moved&&time-group.began<=250&&group.max<=2){
       if(!click(group.max===2?3:1))return;
       if(group.max===1){var tap=group.origins.values().next().value;lastTap={time:time,x:tap.x,y:tap.y};}
      }
      group=null;rx=ry=0;
     }
    }
   }
   previous=next;
  }
  return {update:update,cancel:cancel,close:function(){cancel();closed=true;}};
 }
 function createNative(){
  if(typeof call_rop!=="function"||typeof malloc!=="function"||!global.MoonlightNative||!global.MoonlightNative.available)return null;
  var transport=global.MoonlightNative.create();
  var getter=transport.resolveNativeSymbol("_ZN2nn3hid6detail19GetTouchScreenStateILm16EEENS_6ResultEPNS0_16TouchScreenStateIXT_EEE");
  // SDK TouchScreenState<16>: 16-byte header and sixteen 40-byte contacts.
  // See switchbrew/libnx hid.h. Use the existing game HID session; never init it.
  var memory=malloc(688);if(!memory)throw Error("Touchscreen allocation failed");var sample=memory+16n,closed=false;
  for(var i=0;i<688;i+=8)write64(memory+BigInt(i),0n);
  var guard=0x746f756368677561n;write64(memory,guard);write64(memory+672n,guard);write64(memory+680n,guard);
  return {poll:function(){
   if(closed)return [];
   var result=call_rop(getter,sample);if(result&0x3fffffn)throw Error("Touchscreen state read failed");
   if(read64(memory)!==guard||read64(memory+672n)!==guard||read64(memory+680n)!==guard)throw Error("Touchscreen state exceeded its buffer");
   var count=Number(read32(sample+8n));if(count<0||count>16)throw Error("Invalid touchscreen contact count");
   var points=[],seen=new Set();
   for(var i=0;i<count;i++){
    var at=sample+16n+BigInt(i*40),id=Number(read32(at+12n)),x=Number(read32(at+16n)),y=Number(read32(at+20n)),attributes=Number(read32(at+8n));
    if(x>1279||y>719||seen.has(id))throw Error("Invalid touchscreen contact");seen.add(id);
    // The final sample can retain a contact with its End attribute set.
    if(!(attributes&2))points.push({id:id,x:x/1279,y:y/719});
   }
   return points;
  },close:function(){if(!closed){closed=true;free(memory);}}};
 }
 global.MoonlightTouchInput={create:create,createNative:createNative,videoRect:videoRect};
})(typeof window!=="undefined"?window:globalThis);
