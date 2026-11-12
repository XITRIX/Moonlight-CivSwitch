/* Streaming config for the shared checked SDK graphics context. */
(function(g){"use strict";
 function checkedCalls(context,functions){
  var native=context.native,known=context.rpc.verifiedFunctions;
  if(!known||typeof native.read64!=="function"||typeof context.rawCall!=="function")return native;
  // The fixed functions stay in retained, range-checked modules. Preserve the
  // SDK's per-call eight-byte signature check without allocating/copying bytes.
  var signatures=new Map();
  for(var name of Object.keys(functions)){
   var pointer=BigInt(functions[name]),key="0x"+pointer.toString(16),hex=known.get(key);
   if(!hex||hex.length<16||!native.verified.has(key))throw Error("Unverified streaming function");
   native.checkMemory(pointer,8,5);
   signatures.set(pointer,g.MoonlightNativeBuffer.from(hex.slice(0,16),"hex").readBigUInt64LE());
  }
  var fast=Object.create(native);
  fast.call=function(pointer){
   pointer=BigInt(pointer);var expected=signatures.get(pointer);
   if(expected===undefined||native.read64(pointer)!==expected)throw Error("Streaming function changed");
   return context.rawCall(pointer,Array.prototype.slice.call(arguments,1));
  };
  return fast;
 }
 g.MoonlightNativeContext={create:function(){return g.CivHomebrewSDK.graphics.create({
  modules:g.MoonlightNativeModules,resolveSdk:function(name){return g.MoonlightNative.create().resolveNativeSymbol(name);},
  refreshState:g.__moonlightNativeRefreshState||(g.__moonlightNativeRefreshState={})});},checkedCalls:checkedCalls};
})(typeof window!=='undefined'?window:globalThis);
