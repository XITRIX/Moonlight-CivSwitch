/* One paired named-binding clear/restore, using the backend hooks reached by
 * logical attach/detach. No native window, buffer or connection is destroyed. */
(async function(){
 await log('MOONLIGHT_REBIND_LAYER_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base),layer=base+0x5456558n,logical=layer+0x408n,connection=layer+8n,windowPtr=main_base+81563128n;
  if(c.read(layer+0x500n,2).toString('hex')!=='0101'||c.native.read32(layer+0x4c8n)!==1n||c.native.read64(windowPtr+8n)!==layer+0x4b0n)throw Error('Original window is not live');
  var displayKey=c.native.read64(logical+0x10n),layerKey=c.native.read64(logical+0x18n),selected=c.native.read64(logical+0x30n),owner=c.native.read64(connection+0x10n);
  if(displayKey!==0x746c7561666564n||layerKey!==displayKey||selected!==connection||owner!==logical)throw Error('Original named layer identity changed');
  var gs=c.native.read64(connection),backend=c.native.read64(gs),context=c.native.read64(backend+0x18n),fn=c.native.read64(backend+0xd0n);
  if(fn!==base+2427264n||backend!==base+67428016n)throw Error('Backend profile changed');c.native.checkMemory(context,32,3);
  await c.rpc.request({command:'verify-function',address:String(fn),hex:'7f2303d5fd7bbca9f70b00f9f65702a9f44f03a9fd030091f40303aaf50302aaf60301aaf30300aadab4fb97600a40f9200300b4e80f80d277d03bd5'});
  await log('MOONLIGHT_REBIND_LAYER_READY '+JSON.stringify({display:c.read(logical+0x10n,8).toString('hex'),layer:c.read(logical+0x18n,8).toString('hex'),connection:String(connection)}));
  var clear=c.native.read64(backend+0xd8n);if(clear!==base+2427472n)throw Error('Clear hook changed');
  await c.rpc.request({command:'verify-function',address:String(clear),hex:'7f2303d5ff0301d1fd7b01a9f65702a9f44f03a9fd430091f40302aaf50301aaf30300aaa7b4fb97600a40f9200300b4081080d276d03bd5'});
  var cleared=Number(BigInt.asUintN(32,c.call(clear,context,displayKey,layerKey)));await log('MOONLIGHT_REBIND_LAYER_CLEAR '+JSON.stringify({result:cleared}));if(cleared)throw Error('Named binding clear refused: '+cleared);
  var result=Number(BigInt.asUintN(32,c.call(fn,context,displayKey,layerKey,connection)));
  await log('MOONLIGHT_REBIND_LAYER_RESULT '+JSON.stringify({result:result}));if(result)throw Error('Original layer reselect failed: '+result);
  var probe=window.__moonlightModeSwitchProbe;if(probe&&probe.banner)probe.banner.textContent='GAMEFACE RESTORED\nOriginal named layer selected';
  await new Promise(function(r){setTimeout(r,2000);});
  await log('MOONLIGHT_REBIND_LAYER_COMPLETE');
 }finally{c.close();}
})();
