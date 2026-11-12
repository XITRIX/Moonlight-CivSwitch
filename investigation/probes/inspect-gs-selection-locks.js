(async function(){
 await log('MOONLIGHT_GS_LOCK_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base);for(var pair of [[2447360+0x1c,96],[2447360+0x64,96]]){var pc=pair[0],w=c.read(base+BigInt(pc),4).readUInt32LE(0),imm=w&0x3ffffff;if(imm&0x2000000)imm-=0x4000000;var target=pc+imm*4;for(var at=0;at<192;at+=96)await log('MOONLIGHT_GS_LOCK_CODE '+JSON.stringify({from:pc,offset:target+at,hex:c.read(base+BigInt(target+at),96).toString('hex')}));}
  for(var at=0;at<768;at+=256)await log('MOONLIGHT_GS_LOCK_METADATA '+JSON.stringify({offset:2448880+at,hex:c.read(base+BigInt(2448880+at),256).toString('hex')}));
  await log('MOONLIGHT_GS_LOCK_COMPLETE');}finally{c.close();}
})();
