/* App adapter for the shared SDK controller sampler and button mapping. */
(function(g){"use strict";var input=g.CivHomebrewSDK.controller;
 g.MoonlightControllerInput={fromNpad:input.fromNpad,fromBrowser:input.fromBrowser,
  createNative:function(options){return input.createNative(Object.assign({},options,{bridge:g.MoonlightNative}));}};
})(typeof window!=="undefined"?window:globalThis);
