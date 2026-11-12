(async function(){
 await log('MOONLIGHT_CONTENT_VISIBILITY_BEGIN');var c=MoonlightNativeContext.create();
 try{for(var name of ['_ZN2nn2vi20SetContentVisibilityEb','_ZN2nn2vi19IsContentVisibleEv']){try{var p=c.sdkResolve(name);await log('MOONLIGHT_CONTENT_VISIBILITY_CODE '+JSON.stringify({name:name,offset:String(BigInt(p)-sdk_base),hex:c.read(p,256).toString('hex')}));}catch(e){await log('MOONLIGHT_CONTENT_VISIBILITY_UNAVAILABLE '+name+' '+e.message);}}await log('MOONLIGHT_CONTENT_VISIBILITY_COMPLETE');}finally{c.close();}
})();
