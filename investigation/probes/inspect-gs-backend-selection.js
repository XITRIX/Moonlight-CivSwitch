/* Read-only GS layer names and backend selection hooks. */
(async function(){
 await log('MOONLIGHT_GS_BACKEND_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base),layer=base+0x5456558n;
  await log('MOONLIGHT_GS_BACKEND_LAYER '+JSON.stringify({internalTail:c.read(layer+0x408n,160).toString('hex'),internalHead:c.read(layer+8n,128).toString('hex')}));
  var gs=c.native.read64(layer+8n),backend=c.native.read64(gs);c.native.checkMemory(backend,320,1);
  await log('MOONLIGHT_GS_BACKEND_ROOT '+JSON.stringify({gsOffset:String(gs-base),backendOffset:String(backend-base),gsHex:c.read(gs,128).toString('hex'),backendHex:c.read(backend,320).toString('hex')}));
  for(var slot of [0xd0,0xd8,0xf8,0x100,0x118]){var fn=c.native.read64(backend+BigInt(slot));c.native.checkMemory(fn,512,5);for(var at=0;at<512;at+=256)await log('MOONLIGHT_GS_BACKEND_CODE '+JSON.stringify({slot:slot,offset:String(fn-base+BigInt(at)),hex:c.read(fn+BigInt(at),256).toString('hex')}));}
  for(var pair of [[2480912,192],[2445632,288]])await log('MOONLIGHT_GS_BACKEND_CONSTRUCTOR '+JSON.stringify({offset:pair[0],hex:c.read(base+BigInt(pair[0]),pair[1]).toString('hex')}));
  await log('MOONLIGHT_GS_BACKEND_COMPLETE');
 }finally{c.close();}
})();
