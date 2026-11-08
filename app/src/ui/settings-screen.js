/* Controller-friendly stream settings, using the same panel style as Host. */
(function(global){
 "use strict";
 function create(options){
  function element(tag,parent,style,text){var n=document.createElement(tag);Object.assign(n.style,style);if(text!==undefined)n.textContent=text;parent.appendChild(n);return n;}
  var panel=element("div",options.parent,{display:"none",flexDirection:"column",width:"600px",maxWidth:"88vw",padding:"32px",border:"1px solid #29354b",borderRadius:"18px",backgroundColor:"#131d2e",boxSizing:"border-box"});panel.id="moonlight-settings-screen";
  element("div",panel,{fontSize:"17px",color:"#94b6e2",marginBottom:"6px"},"Moonlight");
  element("h2",panel,{fontSize:"36px",lineHeight:"1.2",margin:"0 0 22px",color:"#f4f7ff"},"Settings");
  var definitions=[{id:"resolution",label:"Resolution",values:global.MoonlightSettings.resolutions},{id:"fps",label:"Frame rate",values:global.MoonlightSettings.frameRates},{id:"bitrate",label:"Bitrate",values:global.MoonlightSettings.bitrates},{id:"showStats",label:"Performance overlay",values:[false,true]},{id:"videoPacing",label:"Frame pacing",values:["smooth","latency"]}];
  var rows=[],selected=0,mode=null;
  var style={display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",height:"58px",marginBottom:"14px",padding:"0 16px",border:"2px solid #35435b",borderRadius:"9px",backgroundColor:"#0c1423",color:"#f4f7ff",fontFamily:"Arial, sans-serif",fontSize:"22px",outline:"none",boxSizing:"border-box"};
  definitions.forEach(function(def,index){
   var button=element("button",panel,style);button.id="moonlight-settings-"+def.id;button.type="button";button.tabIndex=-1;
   element("span",button,{},def.label);var value=element("span",button,{color:"#b7d7ff"});
   button.addEventListener("click",function(){selected=index;adjust(1,true);});rows.push({node:button,value:value,definition:def});
  });
  var message=element("div",panel,{minHeight:"42px",fontSize:"16px",lineHeight:"1.4",color:"#b7c6dd",margin:"2px 0 16px"},"Changes apply to the next stream and are saved when you go back.");message.id="moonlight-settings-status";message.setAttribute("role","status");
  var back=element("button",panel,Object.assign({},style,{marginBottom:"0",justifyContent:"center",backgroundColor:"#284c83"}),"Back");back.id="moonlight-settings-back";back.type="button";back.tabIndex=-1;back.addEventListener("click",leave);
  function index(row){return row.definition.values.findIndex(function(v){return row.definition.id==="resolution"?v.width===mode.width&&v.height===mode.height:v===mode[row.definition.id];});}
  function paint(){
   message.textContent=selected<rows.length&&rows[selected].definition.id==="videoPacing"?"Smooth steadies 60 FPS motion with up to one frame of buffering. Low latency favors response time." : "Changes apply to the next stream and are saved when you go back.";
   rows.forEach(function(row,i){var id=row.definition.id;row.value.textContent=id==="resolution"?mode.width+" × "+mode.height:id==="fps"?mode.fps+" FPS":id==="showStats"?(mode.showStats?"On":"Off"):id==="videoPacing"?(mode.videoPacing==="smooth"?"Smooth":"Low latency"):mode.bitrate/1000+" Mbps";row.node.setAttribute("aria-label",row.definition.label+": "+row.value.textContent);row.node.setAttribute("data-value",id==="resolution"?mode.width+"x"+mode.height:String(mode[id]));});
   rows.map(function(r){return r.node;}).concat([back]).forEach(function(n,i){var active=i===selected;n.style.borderColor=active?"#94c6ff":"#35435b";n.style.backgroundColor=active?"#284c83":"#0c1423";n.setAttribute("data-selected",active?"true":"false");});
  }
  function adjust(delta,wrap){if(selected>=rows.length)return;var row=rows[selected],values=row.definition.values,current=index(row),next=wrap?(current+delta+values.length)%values.length:Math.max(0,Math.min(values.length-1,current+delta));var v=values[next];if(row.definition.id==="resolution"){mode.width=v.width;mode.height=v.height;}else mode[row.definition.id]=v;paint();}
  function leave(){try{options.onBack(global.MoonlightSettings.validate(mode));}catch(error){message.textContent="Could not save settings: "+error.message;}}
  return {
   show:function(value){mode=global.MoonlightSettings.validate(value);selected=0;message.textContent="Changes apply to the next stream and are saved when you go back.";panel.style.display="flex";paint();},
   hide:function(){panel.style.display="none";},
   move:function(direction){if(direction==="up")selected=Math.max(0,selected-1);else if(direction==="down")selected=Math.min(rows.length,selected+1);else if(direction==="left")adjust(-1,false);else if(direction==="right")adjust(1,false);paint();},
   step:function(delta){selected=(selected+delta+rows.length+1)%(rows.length+1);paint();},
   activate:function(){if(selected===rows.length)leave();else adjust(1,true);},back:leave,
   destroy:function(){if(panel.parentNode)panel.parentNode.removeChild(panel);}
  };
 }
 global.MoonlightSettingsScreen={create:create};
})(typeof window!=="undefined"?window:globalThis);
