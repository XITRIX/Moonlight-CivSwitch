/* Controller-friendly stream settings, using the same panel style as Host. */
(function(global){
 "use strict";
 function create(options){
  var element = global.MoonlightLayout.element;
  var panel=element("div",options.parent,{display:"none",flexDirection:"column",width:"660px",maxWidth:"88vw",maxHeight:"800px",overflowY:"auto",padding:"20px",border:"1px solid #29354b",borderRadius:"18px",backgroundColor:"#131d2e",boxSizing:"border-box"});panel.id="moonlight-settings-screen";
  element("div",panel,{fontSize:"17px",color:"#94b6e2",marginBottom:"6px"},"Moonlight");
  element("h2",panel,{fontSize:"36px",lineHeight:"1.2",margin:"0 0 16px",color:"#f4f7ff"},"Settings");
  var definitions=[{id:"resolution",label:"Resolution",values:global.MoonlightSettings.resolutions},{id:"fps",label:"Frame rate",values:global.MoonlightSettings.frameRates},{id:"bitrate",label:"Bitrate",values:global.MoonlightSettings.bitrates},{id:"showStats",label:"Performance overlay",values:[false,true]},{id:"videoPacing",label:"Frame pacing",values:["smooth","latency"]},{id:"rumble",label:"Gamepad rumble",values:[false,true]},{id:"touchMode",label:"Touchscreen",values:["trackpad","touchpad"]},{id:"codec",label:"Video codec",values:["h264","av1"]}];
  var rows=[],selected=0,mode=null,bitrateMenu=null,bitrateButtons=[],bitrateOpen=false,bitrateSelected=0;
  var style={display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",height:"46px",flexShrink:"0",marginBottom:"8px",padding:"0 16px",border:"2px solid #35435b",borderRadius:"9px",backgroundColor:"#0c1423",color:"#f4f7ff",fontFamily:"Arial, sans-serif",fontSize:"22px",textAlign:"left",outline:"none",boxSizing:"border-box"};
  definitions.forEach(function(def,index){
   // The native snapshot orders siblings by z-index; raise the whole popup
   // branch so later settings rows cannot paint over its choices.
   var parent=def.id==="bitrate"?element("div",panel,{position:"relative",zIndex:"1",flexShrink:"0",marginBottom:"8px"}):panel;
   var button=element("button",parent,Object.assign({},style,def.id==="bitrate"?{marginBottom:"0"}:{}));button.id="moonlight-settings-"+def.id;button.type="button";button.tabIndex=-1;
   // Button defaults can center inherited text on console. Use stable columns
   // so native fallback text starts at the same edge even when values change.
   var label=element("span",button,{display:"block",flex:"1",minWidth:"0",textAlign:"left",lineHeight:"28px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},def.label);label.id=button.id+"-label";
   var value=element("span",button,{display:"block",flex:"1",minWidth:"0",marginLeft:"16px",textAlign:"right",lineHeight:"28px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",color:"#b7d7ff"});value.id=button.id+"-value";
   button.addEventListener("click",function(){if(bitrateOpen)closeBitrate();selected=index;activate();});rows.push({node:button,value:value,definition:def});
   if(def.id==="bitrate"){
    button.setAttribute("aria-haspopup","listbox");button.setAttribute("aria-expanded","false");button.setAttribute("aria-controls","moonlight-bitrate-options");
    bitrateMenu=element("div",parent,{display:"none",position:"absolute",left:"0",right:"0",top:"52px",padding:"12px",border:"2px solid #94c6ff",borderRadius:"9px",backgroundColor:"#131d2e",boxShadow:"0 8px 24px #000",boxSizing:"border-box",zIndex:"2"});
    bitrateMenu.id="moonlight-bitrate-options";bitrateMenu.setAttribute("role","listbox");bitrateMenu.setAttribute("aria-label","Bitrate");
    var line;
    def.values.forEach(function(bitrate,i){
     if(i%3===0)line=element("div",bitrateMenu,{display:"flex",marginTop:i?"8px":"0"});
     var choice=element("button",line,{display:"flex",alignItems:"center",justifyContent:"center",flex:"1",minWidth:"0",height:"42px",marginLeft:i%3?"8px":"0",border:"2px solid #35435b",borderRadius:"6px",backgroundColor:"#0c1423",color:"#f4f7ff",fontFamily:"Arial, sans-serif",fontSize:"20px",outline:"none"},bitrate==="auto"?"Auto":bitrate/1000+" Mbps");
     choice.id="moonlight-bitrate-option-"+bitrate;choice.type="button";choice.tabIndex=-1;choice.setAttribute("role","option");choice.setAttribute("data-value",String(bitrate));
     choice.addEventListener("click",function(){bitrateSelected=i;confirmBitrate();});bitrateButtons.push(choice);
    });
   }
  });
  var message=element("div",panel,{minHeight:"42px",flexShrink:"0",fontSize:"16px",lineHeight:"1.4",color:"#b7c6dd",margin:"2px 0 16px"},"Changes apply to the next stream and are saved when you go back.");message.id="moonlight-settings-status";message.setAttribute("role","status");
  var back=element("button",panel,Object.assign({},style,{marginBottom:"0",justifyContent:"center",backgroundColor:"#284c83"}),"Back");back.id="moonlight-settings-back";back.type="button";back.tabIndex=-1;back.addEventListener("click",leave);
  function settingValue(id){return mode[id]||(id==="codec"?"h264":mode[id]);}
  function index(row){return row.definition.values.findIndex(function(v){return row.definition.id==="resolution"?v.width===mode.width&&v.height===mode.height:v===settingValue(row.definition.id);});}
  function paint(){
   message.textContent=bitrateOpen?"D-pad: Choose bitrate. A: Apply. B: Cancel.":selected===2?"Auto starts at 50 Mbps and only reduces for playback stalls. Reductions reconnect.":selected<rows.length&&rows[selected].definition.id==="videoPacing"?"Smooth steadies 60 FPS motion with up to one frame of buffering. Low latency favors response time." : selected<rows.length&&rows[selected].definition.id==="rumble"?"Enable controller vibration during streaming. Changes apply to the next stream.":selected<rows.length&&rows[selected].definition.id==="touchMode"?(mode.touchMode==="trackpad"?"Slide: cursor. Tap: left click. Two-finger tap: right click; swipe: scroll. Double-tap and hold: drag.":"Each finger sends direct touch to Sunshine. Requires host touch support."):"Changes apply to the next stream and are saved when you go back.";
   if(selected<rows.length&&["codec","resolution","fps"].indexOf(rows[selected].definition.id)>=0)message.textContent="Native output is 1080p. AV1 supports higher source resolutions; 4K up to 60 FPS. −/+ opens stream options. Disconnect returns to Moonlight.";
   rows.forEach(function(row,i){var id=row.definition.id;row.value.textContent=id==="codec"?(settingValue(id)==="av1"?"AV1":"H.264"):id==="resolution"?mode.width+" × "+mode.height:id==="fps"?mode.fps+" FPS":(id==="showStats"||id==="rumble")?(mode[id]?"On":"Off"):id==="videoPacing"?(mode.videoPacing==="smooth"?"Smooth":"Low latency"):id==="touchMode"?(mode.touchMode==="trackpad"?"Trackpad":"Touchpad (direct touch)"):mode.bitrate==="auto"?"Auto ("+global.MoonlightSettings.resolveBitrate(mode)/1000+" Mbps)":mode.bitrate/1000+" Mbps";row.node.setAttribute("aria-label",row.definition.label+": "+row.value.textContent);row.node.setAttribute("data-value",id==="resolution"?mode.width+"x"+mode.height:String(settingValue(id)));});
   rows.map(function(r){return r.node;}).concat([back]).forEach(function(n,i){var active=i===selected;n.style.borderColor=active?"#94c6ff":"#35435b";n.style.backgroundColor=active?"#284c83":"#0c1423";n.setAttribute("data-selected",active?"true":"false");});
   bitrateButtons.forEach(function(button,i){var active=i===bitrateSelected;button.style.borderColor=active?"#94c6ff":"#35435b";button.style.backgroundColor=active?"#284c83":"#0c1423";button.setAttribute("data-selected",active?"true":"false");button.setAttribute("aria-selected",global.MoonlightSettings.bitrates[i]===mode.bitrate?"true":"false");});
   bitrateMenu.setAttribute("aria-activedescendant",bitrateButtons[bitrateSelected].id);
  }
  function closeBitrate(){bitrateOpen=false;bitrateMenu.style.display="none";rows[2].node.setAttribute("aria-expanded","false");}
  function openBitrate(){bitrateSelected=global.MoonlightSettings.bitrates.indexOf(mode.bitrate);bitrateOpen=true;bitrateMenu.style.display="block";rows[2].node.setAttribute("aria-expanded","true");paint();}
  function confirmBitrate(){mode.bitrate=global.MoonlightSettings.bitrates[bitrateSelected];closeBitrate();paint();}
  function activate(){if(bitrateOpen)confirmBitrate();else if(selected===2)openBitrate();else if(selected===rows.length)leave();else adjust(1,true);}
  function adjust(delta,wrap){if(selected>=rows.length)return;var row=rows[selected],values=row.definition.values,current=index(row),next=wrap?(current+delta+values.length)%values.length:Math.max(0,Math.min(values.length-1,current+delta));var v=values[next];if(row.definition.id==="resolution"){mode.width=v.width;mode.height=v.height;}else mode[row.definition.id]=v;
   if(row.definition.id==="codec"&&v==="h264"&&mode.width>1920){mode.width=1920;mode.height=1080;}
   if(mode.width>1920){mode.codec="av1";if(mode.width>2560)mode.fps=60;}
   paint();}
  function leave(){try{options.onBack(global.MoonlightSettings.validate(mode));}catch(error){message.textContent="Could not save settings: "+error.message;}}
  return {
   show:function(value){closeBitrate();mode=global.MoonlightSettings.validate(value);selected=0;message.textContent="Changes apply to the next stream and are saved when you go back.";panel.style.display="flex";paint();},
   hide:function(){closeBitrate();panel.style.display="none";},
   move:function(direction){if(bitrateOpen){var column=bitrateSelected%3;if(direction==="up")bitrateSelected=Math.max(column,bitrateSelected-3);else if(direction==="down")bitrateSelected=Math.min(bitrateButtons.length-1,bitrateSelected+3);else if(direction==="left"&&column>0)bitrateSelected--;else if(direction==="right"&&column<2)bitrateSelected=Math.min(bitrateButtons.length-1,bitrateSelected+1);}else if(direction==="up")selected=Math.max(0,selected-1);else if(direction==="down")selected=Math.min(rows.length,selected+1);else if(direction==="left")adjust(-1,false);else if(direction==="right")adjust(1,false);paint();},
   step:function(delta){if(bitrateOpen)bitrateSelected=(bitrateSelected+delta+bitrateButtons.length)%bitrateButtons.length;else selected=(selected+delta+rows.length+1)%(rows.length+1);paint();},
   activate:activate,back:function(){if(bitrateOpen){closeBitrate();paint();}else leave();},
   destroy:function(){if(panel.parentNode)panel.parentNode.removeChild(panel);}
  };
 }
 global.MoonlightSettingsScreen={create:create};
})(typeof window!=="undefined"?window:globalThis);
