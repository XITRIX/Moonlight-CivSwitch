(async function(){
 await log('MOONLIGHT_WINDOW_DISCONNECT_INSPECT_BEGIN');var c=MoonlightNativeContext.create();
 try{
  var info=await c.rpc.request({command:'module-probe',name:'nnCompat'}),base=BigInt(info.base);
  for(var f of c.findSymbols(/vi.*(LayerNativeWindow.*(Disconnect|Finalize)|Layer.*(TryDestroy|OnDisconnect|5Close)|LayerC1)/)){
   await log('MOONLIGHT_WINDOW_DISCONNECT_FUNCTION '+JSON.stringify({name:f.name,offset:f.offset,size:f.size,hex:c.read(base+BigInt(f.offset),f.size).toString('hex')}));
   var b=c.read(base+BigInt(f.offset),f.size);
   for(var at=0;at+4<=b.length;at+=4){var w=b.readUInt32LE(at);if((w>>>26)!==37&&(w>>>26)!==5)continue;var imm=w&0x3ffffff;if(imm&0x2000000)imm-=0x4000000;var off=f.offset+at+imm*4,p=base+BigInt(off);var t=c.read(p,16),op=t.readUInt32LE(0),ld=t.readUInt32LE(4);if((op&0x9f00001f)!==(0x90000010|0)||(ld>>>22&0x3ff)!==0x3e5)continue;var delta=((op>>>5&0x7ffff)*4+(op>>>29&3));if(delta&0x100000)delta-=0x200000;var got=(p&~4095n)+BigInt(delta*4096+(ld>>>10&0xfff)*8),target=c.native.read64(got);await log('MOONLIGHT_WINDOW_DISCONNECT_CALLEE '+JSON.stringify({from:f.offset+at,offset:String(target-base),hex:c.read(target,160).toString('hex')}));}
  }
  await log('MOONLIGHT_WINDOW_DISCONNECT_INSPECT_COMPLETE');
 }finally{c.close();}
})();
