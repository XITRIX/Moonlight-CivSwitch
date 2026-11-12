(async function(){
 await log('MOONLIGHT_NVN_WINDOW_CODE_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'}),base=BigInt(info.base),layer=base+0x5456558n,nativeHandle=layer+0x4b0n,windowPtr=main_base+81563128n,holder=c.native.read64(main_base+0x4db9ed8n),device=c.native.read64(holder);
  if(c.native.read64(windowPtr)!==device||c.native.read64(windowPtr+8n)!==nativeHandle||c.native.read32(windowPtr+0x20n)!==3n)throw Error('Original NVN window identity changed');
  await log('MOONLIGHT_NVN_WINDOW_IDENTITY '+JSON.stringify({offset:81563128,pointer:String(windowPtr),nativeHandle:String(nativeHandle),hex:c.read(windowPtr,192).toString('hex'),queueCandidate:String(c.native.read64(holder+8n))}));
  for(var pair of [['initialize',3436000,512],['finalize',3436736,160],['presentInterval',3436544,192],['present',3437520,384],['acquire',3437376,144],['queueError',3412480,384]])for(var at=0;at<pair[2];at+=384)await log('MOONLIGHT_NVN_WINDOW_CODE '+JSON.stringify({name:pair[0],offset:pair[1]+at,hex:c.read(base+BigInt(pair[1]+at),Math.min(384,pair[2]-at)).toString('hex')}));
  for(var i=0;i<3;i++){await new Promise(function(r){setTimeout(r,150);});await log('MOONLIGHT_NVN_WINDOW_SAMPLE '+JSON.stringify({sample:i,hex:c.read(windowPtr+0x18n,64).toString('hex')}));}
  await log('MOONLIGHT_NVN_WINDOW_CODE_COMPLETE');
 }finally{c.close();}
})();
