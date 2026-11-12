/* Read-only follow-up after guarded setup rolled back before WSI creation. */
(async function(){
 await log('MOONLIGHT_SHARED_ACTIVATION_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base),layer=base+0x5456558n,logical=layer+0x408n;
  await log('MOONLIGHT_SHARED_ACTIVATION_ORIGINAL '+JSON.stringify({flags:c.read(layer+0x500n,2).toString('hex'),logical:c.read(logical,80).toString('hex'),owner:String(c.native.read64(layer+0x18n))}));
  for(var root of [2470448,2470464]){var word=c.read(base+BigInt(root),4).readUInt32LE(0),imm=word&0x3ffffff;if(imm&0x2000000)imm-=0x4000000;var offset=root+imm*4;await log('MOONLIGHT_SHARED_ACTIVATION_WRAPPER '+JSON.stringify({root:root,offset:offset,hex:c.read(base+BigInt(offset),128).toString('hex')}));}
  var failed=window.__moonlightNativeGraphics,ledger=failed&&failed.ledger&&failed.ledger.snapshot();await log('MOONLIGHT_SHARED_ACTIVATION_LEDGER '+JSON.stringify(ledger?{closed:ledger.closed,quarantined:ledger.quarantined,allocations:ledger.allocations.map(function(a){return a.status;})}:null));
  if(failed&&ledger&&ledger.closed&&!ledger.quarantined&&c.native.read64(logical+0x30n)===layer+8n&&c.read(layer+0x500n,2).toString('hex')==='0101'){delete window.__moonlightNativeGraphics;var children=Array.prototype.slice.call(document.body.children);children.forEach(function(e){if(e.textContent==='GAMEFACE BASELINE\nShared layer connection test')e.parentNode.removeChild(e);});await log('MOONLIGHT_SHARED_ACTIVATION_RESET_CLEAN_STATE');}
  await log('MOONLIGHT_SHARED_ACTIVATION_COMPLETE');
 }finally{c.close();}
})();
