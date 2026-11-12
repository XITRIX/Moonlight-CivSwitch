/* Reapply the original window's documented NVN interval property, using its
 * exact native-handle identity. No finalize/reinitialize, texture acquisition,
 * visibility service, queue wait, or frame submission is called. */
(async function(){
 await log('MOONLIGHT_WINDOW_INTERVAL_BEGIN');var c=MoonlightNativeContext.create(),changed=false,original,windowPtr,fn;
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base),layer=base+0x5456558n;
  windowPtr=main_base+81563128n;var holder=c.native.read64(main_base+0x4db9ed8n),device=c.native.read64(holder);
  if(c.native.read64(windowPtr)!==device||c.native.read64(windowPtr+8n)!==layer+0x4b0n||c.native.read32(windowPtr+0x20n)!==3n||c.read(layer+0x500n,2).toString('hex')!=='0101')throw Error('Original window identity changed');
  original=Number(c.native.read32(windowPtr+0x28n));if(original<0||original>5)throw Error('Original interval rejected');
  fn=base+3436544n;await c.rpc.request({command:'verify-function',address:String(fn),hex:'7f2303d5ffc300d1fd7b01a9f44f02a9fd430091e8dd02b008411991f4dd02b0f30300aa08c1bf38c8020036884e46b93f00086b34b0881a682a40b99f02086b'});
  await log('MOONLIGHT_WINDOW_INTERVAL_BEFORE '+JSON.stringify({interval:original,frameFields:c.read(windowPtr+0x2cn,12).toString('hex')}));
  c.call(fn,windowPtr,BigInt(original===0?1:0));changed=true;
  await new Promise(function(r){setTimeout(r,1200);});
  await log('MOONLIGHT_WINDOW_INTERVAL_TOGGLED '+JSON.stringify({interval:Number(c.native.read32(windowPtr+0x28n)),frameFields:c.read(windowPtr+0x2cn,12).toString('hex')}));
  c.call(fn,windowPtr,BigInt(original));changed=false;
  if(Number(c.native.read32(windowPtr+0x28n))!==original)throw Error('Original interval did not restore');
  await new Promise(function(r){setTimeout(r,1200);});
  await log('MOONLIGHT_WINDOW_INTERVAL_RESTORED '+JSON.stringify({interval:original,frameFields:c.read(windowPtr+0x2cn,12).toString('hex')}));
  await log('MOONLIGHT_WINDOW_INTERVAL_COMPLETE');
 }finally{if(changed)c.call(fn,windowPtr,BigInt(original));c.close();}
})();
