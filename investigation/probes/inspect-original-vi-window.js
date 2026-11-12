/* Read exact original layer singleton derived from the game's CreateLayer import. */
(async function(){
 await log('MOONLIGHT_ORIGINAL_WINDOW_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base),layer=base+0x5456558n;
  await log('MOONLIGHT_ORIGINAL_WINDOW_LAYER '+JSON.stringify({offset:0x5456558,pointer:String(layer),head:c.read(layer,96).toString('hex'),native:c.read(layer+0x4a8n,96).toString('hex'),flags:c.read(layer+0x500n,8).toString('hex')}));
  for(var f of c.findSymbols(/vi.*LayerNativeWindow.*(?:GetHandle|GetNativeWindow|Get.*Window|Connect)/))await log('MOONLIGHT_ORIGINAL_WINDOW_FUNCTION '+JSON.stringify(f));
  var root=main_base+0x4db9ed8n,region=c.native.query(root);
  await log('MOONLIGHT_ORIGINAL_WINDOW_MAIN '+JSON.stringify({base:String(main_base),region:{base:String(region.base),size:String(region.size),permissions:region.permissions}}));
  await log('MOONLIGHT_ORIGINAL_WINDOW_COMPLETE');
 }finally{c.close();}
})();
