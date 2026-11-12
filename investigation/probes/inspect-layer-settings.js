(async function(){
 await log('MOONLIGHT_LAYER_SETTINGS_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});for(var f of c.findSymbols(/LayerCreationSettings/))await log('MOONLIGHT_LAYER_SETTINGS_CODE '+JSON.stringify({name:f.name,offset:f.offset,hex:c.read(BigInt(info.base)+BigInt(f.offset),f.size).toString('hex')}));await log('MOONLIGHT_LAYER_SETTINGS_COMPLETE');}finally{c.close();}
})();
