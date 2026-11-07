/* Read-only inventory of existing controller-state entry points. */
(async function(){
 var N=window.MoonlightProbeNative,matches=[];
 for(var name of Object.keys(N.exports))if(/hid.*(Npad|State|Style|Id)|Npad.*State/.test(name))matches.push({name:name,offset:N.exports[name].offset,size:N.exports[name].size});
 await log('MOONLIGHT_INPUT_EXPORTS: '+JSON.stringify(matches));
 await log('MOONLIGHT_INPUT_BROWSER: '+JSON.stringify({getGamepads:typeof navigator.getGamepads,pads:typeof navigator.getGamepads==='function'?Array.from(navigator.getGamepads(),function(p){return p?{id:p.id,mapping:p.mapping,buttons:p.buttons.length,axes:p.axes.length}:null;}):null}));
 delete window.MoonlightProbeNative;
})();
