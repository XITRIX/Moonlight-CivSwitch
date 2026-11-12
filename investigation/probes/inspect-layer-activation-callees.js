/* Read code only: resolve direct callees and PLT targets of VI activation. */
(async function(){
 await log('MOONLIGHT_LAYER_ACTIVATION_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base),seen={};
  for(var pair of [[2479616,116],[2470176,124],[2474224,88],[2470304,56]]){
   var bytes=c.read(base+BigInt(pair[0]),pair[1]);
   for(var at=0;at+4<=bytes.length;at+=4){var w=bytes.readUInt32LE(at);if((w>>>26)!==37&&(w>>>26)!==5)continue;var imm=w&0x3ffffff;if(imm&0x2000000)imm-=0x4000000;var off=pair[0]+at+imm*4,p=base+BigInt(off),t=c.read(p,16),op=t.readUInt32LE(0),ld=t.readUInt32LE(4);
    if((op&0x9f00001f)===(0x90000010|0)&&(ld>>>22&0x3ff)===0x3e5){var delta=((op>>>5&0x7ffff)*4+(op>>>29&3));if(delta&0x100000)delta-=0x200000;p=c.native.read64((p&~4095n)+BigInt(delta*4096+(ld>>>10&0xfff)*8));}
    await log('MOONLIGHT_LAYER_ACTIVATION_EDGE '+JSON.stringify({from:pair[0]+at,targetOffset:String(p-base)}));if(seen[String(p)])continue;seen[String(p)]=true;c.native.checkMemory(p,512,5);
    for(var chunk=0;chunk<512;chunk+=256)await log('MOONLIGHT_LAYER_ACTIVATION_CODE '+JSON.stringify({offset:String(p-base+BigInt(chunk)),hex:c.read(p+BigInt(chunk),256).toString('hex')}));
   }
  }
  await log('MOONLIGHT_LAYER_ACTIVATION_COMPLETE');
 }finally{c.close();}
})();
