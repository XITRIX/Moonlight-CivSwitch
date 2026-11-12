/* Read-only qualification of owned-window setup on the existing logical layer. */
(async function(){
 await log('MOONLIGHT_SHARED_LAYER_INSPECT_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base),layer=base+0x5456558n;
  await log('MOONLIGHT_SHARED_LAYER_BASELINE '+JSON.stringify({base:String(base),layer:String(layer),flags:c.read(layer+0x500n,2).toString('hex'),logical:c.read(layer+0x408n,80).toString('hex')}));
  for(var f of c.findSymbols(/vi.*(?:LayerNativeWindow.*(?:Initialize|Set.*Size|Set.*Dimension|Set.*Width|Finalize)|InternalLayer.*SetNextUserData)/))for(var at=0;at<f.size;at+=256)await log('MOONLIGHT_SHARED_LAYER_FUNCTION '+JSON.stringify({name:f.name,offset:f.offset+at,hex:c.read(base+BigInt(f.offset+at),Math.min(256,f.size-at)).toString('hex')}));
  var p=base+0x2bd36f0n,b=c.read(p,16),op=b.readUInt32LE(0),ld=b.readUInt32LE(4),delta=((op>>>5&0x7ffff)*4+(op>>>29&3));if(delta&0x100000)delta-=0x200000;if((op&0x9f00001f)!==(0x90000010|0))throw Error('Size setter PLT changed');var target=c.native.read64((p&~4095n)+BigInt(delta*4096+(ld>>>10&0xfff)*8));await log('MOONLIGHT_SHARED_LAYER_SIZE '+JSON.stringify({offset:String(target-base),hex:c.read(target,160).toString('hex')}));
  for(var pair of [[2419472,32],[2419504,32],[2473712,128],[2470416,16]])await log('MOONLIGHT_SHARED_LAYER_ENTRY '+JSON.stringify({offset:pair[0],hex:c.read(base+BigInt(pair[0]),pair[1]).toString('hex')}));
  await log('MOONLIGHT_SHARED_LAYER_INSPECT_COMPLETE');
 }finally{c.close();}
})();
