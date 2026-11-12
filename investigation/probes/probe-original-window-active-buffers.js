/* Reapply the original active-buffer count through the current driver API.
 * Existing texture/window ownership and count are preserved. */
(async function(){
 await log('MOONLIGHT_WINDOW_ACTIVE_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base),layer=base+0x5456558n,windowPtr=main_base+81563128n,device=c.native.read64(c.native.read64(main_base+0x4db9ed8n));
  if(c.native.read64(windowPtr)!==device||c.native.read64(windowPtr+8n)!==layer+0x4b0n||c.read(layer+0x500n,2).toString('hex')!=='0101')throw Error('Original window identity changed');
  var count=Number(c.native.read32(windowPtr+0x20n)),active=Number(c.native.read32(windowPtr+0x24n));if(count!==3||active!==3)throw Error('Buffer counts changed');
  var fn=base+3436496n;await c.rpc.request({command:'verify-function',address:String(fn),hex:'e203012a022400b9a8e70190e10300aa086540f9000140f9080040f9032140f960001fd6'});
  await log('MOONLIGHT_WINDOW_ACTIVE_BEFORE '+JSON.stringify({count:count,active:active,frameFields:c.read(windowPtr+0x2cn,12).toString('hex')}));
  c.call(fn,windowPtr,BigInt(active));
  await new Promise(function(r){setTimeout(r,1500);});
  await log('MOONLIGHT_WINDOW_ACTIVE_AFTER '+JSON.stringify({active:Number(c.native.read32(windowPtr+0x24n)),frameFields:c.read(windowPtr+0x2cn,12).toString('hex')}));
  await log('MOONLIGHT_WINDOW_ACTIVE_COMPLETE');
 }finally{c.close();}
})();
