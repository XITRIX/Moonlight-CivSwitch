/* Bounded, read-only VI layer construction and live presentation roots. */
(async function(){
 await log('MOONLIGHT_COMPAT_LAYER_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base),layer=base+0x5456558n;
  for(var f of c.findSymbols(/vi.*(?:Layer6OnOpen|LayerC1Ev|LayerNativeWindow7Connect|InternalLayer10Initialize|InternalLayer8Finalize)/)){
   for(var at=0;at<f.size;at+=384)await log('MOONLIGHT_COMPAT_LAYER_CODE '+JSON.stringify({name:f.name,offset:f.offset+at,hex:c.read(base+BigInt(f.offset+at),Math.min(384,f.size-at)).toString('hex')}));
  }
  for(var pair of [['layer',layer],['internal',layer+8n],['native',layer+0x4a8n]]){
   var table=c.native.read64(pair[1]);c.native.checkMemory(table,128,1);
   await log('MOONLIGHT_COMPAT_LAYER_OBJECT '+JSON.stringify({name:pair[0],pointer:String(pair[1]),hex:c.read(pair[1],128).toString('hex'),vtable:String(table),vtableHex:c.read(table,128).toString('hex')}));
  }
  await log('MOONLIGHT_COMPAT_LAYER_COMPLETE');
 }finally{c.close();}
})();
