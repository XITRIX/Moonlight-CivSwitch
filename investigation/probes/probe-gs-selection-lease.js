/* No Vulkan. Own one GS connected state; borrow the original logical layer.
 * Select through the exact GS backend hook under its logical mutex, mirror the
 * successful selection cache, then let owned-state Detach promote the prior. */
(async function(){
 await log('MOONLIGHT_GS_LEASE_BEGIN');var c=MoonlightNativeContext.create(),info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base),original=base+0x5456558n,logical=original+0x408n,prior=original+8n;
 if(c.read(original+0x500n,2).toString('hex')!=='0101'||c.native.read64(logical+0x30n)!==prior||c.native.read64(logical+0x20n)!==prior+0x18n||c.native.read64(logical+0x28n)!==prior+0x18n)throw Error('Original layer has other connections');
 var profiles={connect:[2419472,'08f0019008210491e20301aae10300aa032140f9000140f960001fd6'],disconnect:[2419504,'08f0019008210491e10300aa022540f9000140f940001fd6'],initialize:[2473712,'010c00f9c88f02f00881119108c1bf38a8000036c18f02f021a01191002000914077fd17'],finalize:[2474160,'7f2303d5fd7bbea9f30b00f9fd030091f30300aa0020009136b6fa977f0e00f9f30b40f9fd7bc2a8ff0f5fd6'],metadata:[2470416,'94cdff17'],size:[2475008,'0160007902640079c0035fd6'],lock:[1301776,'34000014'],unlock:[1301808,'44000014'],select:[2427264,'7f2303d5fd7bbca9f70b00f9f65702a9f44f03a9fd030091f40303aaf50302aaf60301aaf30300aadab4fb97600a40f9200300b4e80f80d277d03bd5']},fn={};
 for(var key of Object.keys(profiles)){fn[key]=base+BigInt(profiles[key][0]);await c.rpc.request({command:'verify-function',address:String(fn[key]),hex:profiles[key][1]});}
 var backend=c.native.read64(c.native.read64(prior)),context=c.native.read64(backend+0x18n),displayKey=c.native.read64(logical+0x10n),layerKey=c.native.read64(logical+0x18n);if(c.native.read64(backend+0xd0n)!==fn.select||displayKey!==0x746c7561666564n||layerKey!==displayKey)throw Error('Backend selection profile changed');
 var owned=BigInt(c.allocate(8192)),connected=false,initialized=false,selected=false,banner=document.createElement('div');
 Object.assign(banner.style,{position:'fixed',left:'0',top:'0',width:innerWidth+'px',height:innerHeight+'px',zIndex:'99999',backgroundColor:'#164565',color:'white',fontSize:'36px',display:'flex',alignItems:'center',justifyContent:'center',whiteSpace:'pre-wrap',textAlign:'center'});banner.textContent='GAMEFACE BASELINE\nGS selection only: no Vulkan';document.body.appendChild(banner);
 window.__moonlightGsLeaseProbe={context:c,owned:owned,logical:logical,prior:prior,banner:banner};
 try{
  await new Promise(function(r){setTimeout(r,4000);});c.write(owned,MoonlightNativeBuffer.alloc(8192));c.call(BigInt(c.resolve('_ZN2nn2vi5LayerC1Ev')),owned);
  var rc=Number(BigInt.asUintN(32,c.call(fn.connect,owned+8n,logical)));await log('MOONLIGHT_GS_LEASE_CONNECT '+JSON.stringify({result:rc}));if(rc)throw Error('GS connect refused: '+rc);connected=true;
  if(c.native.read64(owned+0x18n)!==logical||c.native.read64(logical+0x30n)!==prior||c.native.read64(logical+0x20n)!==owned+0x20n||c.native.read64(logical+0x28n)!==prior+0x18n)throw Error('Dormant registration changed');
  c.call(fn.metadata,owned+8n,4n,0n);c.call(fn.initialize,owned+0x4a8n,owned+8n);initialized=true;c.call(fn.size,owned+0x4a8n,1920n,1080n);
  await log('MOONLIGHT_GS_LEASE_SELECT_BEGIN');c.call(fn.lock,logical);
  try{if(c.native.read64(logical+0x30n)!==prior||c.native.read64(owned+0x18n)!==logical)throw Error('Selection changed before activation');rc=Number(BigInt.asUintN(32,c.call(fn.select,context,displayKey,layerKey,owned+8n)));if(rc===0){c.native.write64(logical+0x30n,owned+8n);selected=true;}}finally{c.call(fn.unlock,logical);}
  await log('MOONLIGHT_GS_LEASE_SELECTED '+JSON.stringify({result:rc,cacheMirrored:selected}));
  await new Promise(function(r){setTimeout(r,2000);});
 }finally{
  if(initialized){if(c.native.read32(owned+0x4c8n)!==0n)throw Error('Unexpected native window connection; retained');c.call(fn.finalize,owned+0x4a8n);initialized=false;}
  if(connected){await log('MOONLIGHT_GS_LEASE_DETACH_BEGIN');c.call(fn.disconnect,owned+8n);connected=false;}
  if(c.native.read64(owned+0x18n)!==0n||c.native.read64(logical+0x30n)!==prior||c.native.read64(logical+0x20n)!==prior+0x18n||c.native.read64(logical+0x28n)!==prior+0x18n)throw Error('GS restoration uncertain; owned backing retained');
  await log('MOONLIGHT_GS_LEASE_RESTORED');c.release(Number(owned));c.close();delete window.__moonlightGsLeaseProbe;
  banner.textContent='GAMEFACE AFTER GS CONNECTION CLOSE\nNo Vulkan device was created';await new Promise(function(r){setTimeout(r,6000);});banner.parentNode.removeChild(banner);await new Promise(function(r){setTimeout(r,1000);});
 }
 await log('MOONLIGHT_GS_LEASE_COMPLETE');
})();
