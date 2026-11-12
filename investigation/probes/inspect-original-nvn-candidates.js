(async function(){
 await log('MOONLIGHT_NVN_CANDIDATES_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'}),base=BigInt(info.base),layer=base+0x5456558n,native=layer+0x4a8n;
  var holder=c.native.read64(main_base+0x4db9ed8n),device=c.native.read64(holder),nativeHandle=c.native.read64(native+8n),needles=[device,native+8n,nativeHandle];
  await log('MOONLIGHT_NVN_CANDIDATE_ANCHORS '+JSON.stringify({device:String(device),holder:String(holder),handleStorage:String(native+8n),handleValue:String(nativeHandle),getHandleCode:c.read(base+0x1099a0n,64).toString('hex')}));
  var regions=[c.native.query(main_base+0x4db9ed8n),c.native.query(holder)];
  for(var region of regions){var start=region.base,limit=region.size;if(start!==regions[0].base&&limit>0x100000n)limit=0x100000n;
   await log('MOONLIGHT_NVN_CANDIDATE_REGION '+JSON.stringify({base:String(start),size:String(region.size),scan:String(limit),permissions:region.permissions,type:region.type}));
   if(!(region.permissions&1)||limit>0x400000n)throw Error('Candidate scan rejected');var matches=0;
   for(var at=0n;at<limit;at+=65536n){var count=Number(limit-at<65536n?limit-at:65536n),bytes=c.read(start+at,count),words=new Uint32Array(bytes.buffer,bytes.byteOffset,Math.floor(count/4));
    for(var i=0;i+1<words.length;i+=2)for(var k=0;k<needles.length;k++)if(words[i]===Number(needles[k]&0xffffffffn)&&words[i+1]===Number(needles[k]>>32n)){
     var pointer=start+at+BigInt(i*4);await log('MOONLIGHT_NVN_CANDIDATE '+JSON.stringify({kind:k,pointer:String(pointer),mainOffset:String(pointer-main_base),hex:c.read(pointer,80).toString('hex')}));if(++matches>=40)throw Error('Too many candidate matches');
    }
   }
  }
  await log('MOONLIGHT_NVN_CANDIDATES_COMPLETE');
 }finally{c.close();}
})();
