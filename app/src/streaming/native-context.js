/* Streaming config for the shared checked SDK graphics context. */
(function(g){"use strict";
 g.MoonlightNativeContext={create:function(){return g.CivHomebrewSDK.graphics.create({
  modules:g.MoonlightNativeModules,resolveSdk:function(name){return g.MoonlightNative.create().resolveNativeSymbol(name);},
  refreshState:g.__moonlightNativeRefreshState||(g.__moonlightNativeRefreshState={})});}};
})(typeof window!=='undefined'?window:globalThis);
