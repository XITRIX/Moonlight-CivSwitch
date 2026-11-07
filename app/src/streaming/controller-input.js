/* Controller 0: native Npad samples on Switch, standard browser pads elsewhere. */
(function(global){
 "use strict";
 function axis(value,scale,invert){
  value=Number(value);if(!Number.isFinite(value))return 0;
  value=Math.max(-1,Math.min(1,value/scale));if(Math.abs(value)<.12)return 0;
  return Math.max(-32768,Math.min(32767,Math.round(value*(invert?-32767:32767))));
 }
 function fromNpad(buttons,lx,ly,rx,ry){
  buttons=Number(buttons)>>>0;var flags=0;
  // Match standard gamepad positions: Nintendo B/A/Y/X -> Xbox A/B/X/Y.
  var mapping=[[0,0x2000],[1,0x1000],[2,0x8000],[3,0x4000],[4,0x40],[5,0x80],[6,0x100],[7,0x200],[10,0x10],[11,0x20],[12,4],[13,1],[14,8],[15,2]];
  for(var entry of mapping)if(buttons&(1<<entry[0]))flags|=entry[1];
  return {state:[flags,buttons&0x100?255:0,buttons&0x200?255:0,axis(lx,32767,false),axis(ly,32767,false),axis(rx,32767,false),axis(ry,32767,false)],exit:(buttons&0xc00)===0xc00};
 }
 function fromBrowser(pad){
  if(!pad||pad.connected===false||pad.mapping!=="standard")return null;
  var flags=[0x1000,0x2000,0x4000,0x8000,0x100,0x200,0,0,0x20,0x10,0x40,0x80,1,2,4,8],buttons=0;
  function pressed(i){return !!(pad.buttons[i]&&pad.buttons[i].pressed);}
  for(var i=0;i<flags.length;i++)if(pressed(i))buttons|=flags[i];
  function trigger(i){var n=Number(pad.buttons[i]&&pad.buttons[i].value);return Number.isFinite(n)?Math.round(Math.max(0,Math.min(1,n))*255):0;}
  return {state:[buttons,trigger(6),trigger(7),axis(pad.axes[0],1,false),axis(pad.axes[1],1,true),axis(pad.axes[2],1,false),axis(pad.axes[3],1,true)],exit:pressed(8)&&pressed(9)};
 }
 function createNative(){
  if(typeof call_rop!=="function"||typeof malloc!=="function"||!global.MoonlightNative||!global.MoonlightNative.available)return null;
  var transport=global.MoonlightNative.create(),owned=[],closed=false,selected=null,nextScan=0;
  function alloc(n){var p=malloc(n);if(!p)throw Error("Controller buffer allocation failed");owned.push(p);return p;}
  var prefix="_ZN2nn3hid6detail",styles=transport.resolveNativeSymbol(prefix+"15GetNpadStyleSetEPNS_4util10BitFlagSetILi32ENS0_12NpadStyleTagEEERKj");
  var getters=[{bit:2,name:"17NpadHandheldState"},{bit:1,name:"16NpadFullKeyState"},{bit:4,name:"16NpadJoyDualState"}].map(function(type){return {bit:type.bit,address:transport.resolveNativeSymbol(prefix+"13GetNpadStatesEPiPNS0_"+type.name+"EiRKj")};});
  var id=0n,style=0n,count=0n,sample=0n;
  function close(){if(closed)return;closed=true;for(var p of owned.reverse())free(p);owned=[];}
  try{id=alloc(8);style=alloc(8);count=alloc(8);sample=alloc(64);}catch(error){close();throw error;}
  function read(controller,getter){
   write32(id,BigInt(controller));write32(count,0n);
   var result=call_rop(getter.address,count,sample,1n,id);
   if(result&0x3fffffn)throw Error("Native controller state read failed: 0x"+(result&0x3fffffn).toString(16));
   if(read32(count)!==1n||!(read32(sample+32n)&1n))return null;
   function signed(offset){return Number(BigInt.asIntN(32,read32(sample+BigInt(offset))));}
   return fromNpad(read64(sample+8n),signed(16),signed(20),signed(24),signed(28));
  }
  return {poll:function(){
   if(closed)return null;
   if(selected){var value=read(selected.id,selected.getter);if(value)return value;selected=null;nextScan=0;}
   if(Date.now()<nextScan)return null;nextScan=Date.now()+500;
   for(var controller of [32,0,1,2,3,4,5,6,7]){
    write32(id,BigInt(controller));write32(style,0n);
    var result=call_rop(styles,style,id);if(result&0x3fffffn)throw Error("Native controller style read failed");
    var bits=Number(read32(style));
    for(var getter of getters)if(bits&getter.bit){var value=read(controller,getter);if(value){selected={id:controller,getter:getter};return value;}}
   }
   return null;
  },close:close};
 }
 global.MoonlightControllerInput={fromNpad:fromNpad,fromBrowser:fromBrowser,createNative:createNative};
})(window);
