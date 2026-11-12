(async function(){
 await log('MOONLIGHT_LAYER_LIFETIME_BEGIN');var c=MoonlightNativeContext.create();
 try{
  var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});
  var list=c.findSymbols(/vi.*(LayerD[012]|LayerC[12]|Layer.*(AddRef|Release|Finalize|Disconnect|Destroy|Detach)|CloseDisplay|OpenDefaultDisplay)/);
  for(var f of list){await log('MOONLIGHT_LAYER_LIFETIME_EXPORT '+JSON.stringify(f));if(/LayerD[012]|CloseDisplay|OpenDefaultDisplay/.test(f.name)){for(var at=0;at<Math.min(f.size,2048);at+=384)await log('MOONLIGHT_LAYER_LIFETIME_CODE '+JSON.stringify({name:f.name,offset:f.offset+at,hex:c.read(BigInt(info.base)+BigInt(f.offset+at),Math.min(384,f.size-at,2048-at)).toString('hex')}));}}
  await log('MOONLIGHT_LAYER_LIFETIME_COMPLETE');
 }finally{c.close();}
})();
