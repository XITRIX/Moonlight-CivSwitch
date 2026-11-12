(async function(){
 await log('MOONLIGHT_LAYER_HISTORY_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});for(var f of c.findSymbols(/vi.*(LayerWithHistory|LayerHistory)/)){
 await log('MOONLIGHT_LAYER_HISTORY_EXPORT '+JSON.stringify(f));
 for(var at=0;at<Math.min(f.size,2048);at+=384)await log('MOONLIGHT_LAYER_HISTORY_CODE '+JSON.stringify({name:f.name,offset:f.offset+at,hex:c.read(BigInt(info.base)+BigInt(f.offset+at),Math.min(384,f.size-at,2048-at)).toString('hex')}));
 }await log('MOONLIGHT_LAYER_HISTORY_COMPLETE');}finally{c.close();}
})();
