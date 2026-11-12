/* Local native-layer menu. Uses the qualified NV12 presenter; no new SDK calls. */
(function(g){
 "use strict";
 var glyphs={
  " ":[0,0,0,0,0,0,0],"A":[14,17,17,31,17,17,17],"B":[30,17,17,30,17,17,30],"C":[14,17,16,16,16,17,14],"D":[30,17,17,17,17,17,30],"E":[31,16,16,30,16,16,31],"F":[31,16,16,30,16,16,16],"G":[14,17,16,23,17,17,15],"H":[17,17,17,31,17,17,17],"I":[14,4,4,4,4,4,14],"J":[7,2,2,2,2,18,12],"K":[17,18,20,24,20,18,17],"L":[16,16,16,16,16,16,31],"M":[17,27,21,21,17,17,17],"N":[17,25,21,19,17,17,17],"O":[14,17,17,17,17,17,14],"P":[30,17,17,30,16,16,16],"Q":[14,17,17,17,21,18,13],"R":[30,17,17,30,20,18,17],"S":[15,16,16,14,1,1,30],"T":[31,4,4,4,4,4,4],"U":[17,17,17,17,17,17,14],"V":[17,17,17,17,17,10,4],"W":[17,17,17,21,21,21,10],"X":[17,17,10,4,10,17,17],"Y":[17,17,10,4,4,4,4],"Z":[31,1,2,4,8,16,31],
  "0":[14,17,19,21,25,17,14],"1":[4,12,4,4,4,4,14],"2":[14,17,1,2,4,8,31],"3":[30,1,1,14,1,1,30],"4":[2,6,10,18,31,2,2],"5":[31,16,16,30,1,1,30],"6":[14,16,16,30,17,17,14],"7":[31,1,2,4,8,8,8],"8":[14,17,17,14,17,17,14],"9":[14,17,17,15,1,1,14],".":[0,0,0,0,0,12,12],":":[0,12,12,0,12,12,0],"-":[0,0,0,31,0,0,0],"/":[1,2,2,4,8,8,16],"+":[0,4,4,31,4,4,0],"?":[14,17,1,2,4,0,4]
 };
 function render(spec){
  var width=1280,height=720,bytes=new Uint8Array(width*height*3/2);bytes.fill(20,0,width*height);bytes.fill(128,width*height);
  function rect(x,y,w,h,value){for(var row=y;row<Math.min(height,y+h);row++)bytes.fill(value,row*width+x,row*width+Math.min(width,x+w));}
  function text(value,x,y,scale,color,max){
   value=String(value).toUpperCase().slice(0,max||48);
   for(var i=0;i<value.length;i++){
    var glyph=glyphs[value[i]]||glyphs["?"];
    for(var row=0;row<7;row++)for(var col=0;col<5;col++)if(glyph[row]&(16>>col))rect(x+i*6*scale+col*scale,y+row*scale,scale,scale,color);
   }
  }
  rect(160,128,960,464,65);rect(162,130,956,460,28);
  text(spec.kind==="menu"?"STREAM OPTIONS":spec.kind==="stopping"?"STOPPING STREAM...":"STREAM STOPPED",220,178,5,230,28);
  if(spec.kind==="menu"){
   text(spec.title||"MOONLIGHT",220,236,3,170,46);
   ["RESUME STREAM","DISCONNECT"].forEach(function(label,i){rect(212,292+i*76,856,62,spec.selected===i?72:38);text(label,236,310+i*76,4,235,32);});
   text("A: SELECT   B: RESUME",220,480,3,210,46);
   text("DISCONNECT REQUIRES RESTARTING CIV VII.",220,532,3,170,46);
  }else{
   text("RESTART CIV VII TO RETURN TO MOONLIGHT.",220,310,3,220,46);
   text("YOUR PC APPLICATION IS STILL RUNNING.",220,370,3,170,46);
  }
  return {width:width,height:height,bytes:bytes};
 }
 // A small retained RGBA badge bypasses full DOM/font/1080p UI rebuilds.
 function renderStatistics(stats){
  var t=stats.telemetry||{},m=stats.mode||{};
  function f(v,n){return typeof v==="number"&&Number.isFinite(v)?v.toFixed(n===undefined?1:n):"--";}
  var lines=[m.width+"X"+m.height+" "+m.fps+" FPS  "+f(m.bitrate/1000)+" MBPS "+String(stats.codec||m.codec||"H264").toUpperCase(),
   "FPS "+f(t.textureFps)+"  DEC "+f(t.decodedFps)+"  RX "+f(t.receivedMbps)+" MBPS",
   "FRAME "+f(t.frameIntervalMs)+" MS  JITTER "+f(t.frameJitterMs)+"  RTT "+f(t.rttMs),
   "GAPS "+f(t.videoFrameGaps,0)+"  REJECT "+f(t.decoderRejected,0)+"  AUDIO "+f(t.audioBufferedMsUpperBound,0)+" MS"];
  var width=672,height=88,words=new Uint32Array(width*height);words.fill(0xdc20180c);
  for(var line=0;line<lines.length;line++){
   var value=lines[line].slice(0,54),y=8+line*19;
   for(var i=0;i<value.length;i++){
    var glyph=glyphs[value[i]]||glyphs["?"];
    for(var row=0;row<7;row++)for(var col=0;col<5;col++)if(glyph[row]&(16>>col)){
     var x=8+i*12+col*2,at=(y+row*2)*width+x;words.fill(0xffffefe4,at,at+2);words.fill(0xffffefe4,at+width,at+width+2);
    }
   }
  }
  return {width:width,height:height,bytes:new Uint8Array(words.buffer)};
 }
 function create(options){
  var opened=false,selected=0,title="";
  function paint(){return options.display.showOverlay({kind:"menu",selected:selected,title:title});}
  function hide(resume){if(!opened)return;opened=false;if(resume){options.display.clearOverlay();if(options.onResume)options.onResume();}}
  return {show:function(value){if(opened)return true;title=value;selected=0;if(!paint())return false;opened=true;return true;},
   isOpen:function(){return opened;},hide:hide,
   action:function(name,phase){
    if(!opened||phase!==0)return;
    if(name==="cancel"){hide(true);return;}
    if(name==="nav-up"||name==="nav-down"){selected=name==="nav-down"?1:0;paint();return;}
    if(name==="accept"){if(selected===0)hide(true);else{hide(false);options.onDisconnect();}}
   },
   key:function(event,down){if(!opened)return false;if(down&&!event.repeat){var name={Escape:"cancel",Enter:"accept",ArrowUp:"nav-up",ArrowDown:"nav-down"}[event.key];if(name)this.action(name,0);}return true;}};
 }
 g.MoonlightNativeStreamMenu={render:render,renderStatistics:renderStatistics,create:create};
})(typeof window!=="undefined"?window:globalThis);
