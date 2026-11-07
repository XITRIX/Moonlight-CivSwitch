/* Locate reads of the same backend upload function used by texture creation. */
(async function () {
 var info=malloc(64),page=malloc(8),matches=[];
 try {
  if(read32(sdk_base+0x168b10n)!==0xd40000c1n)throw Error('Unknown query ABI');
  var start=0x760000,end=0x790000,words=new Uint32Array((end-start)/4);
  var address=main_base+BigInt(start);
  if(call_rop(sdk_base+0x168b0cn,info,page,address)&0x3fffffn)throw Error('Query failed');
  if((read32(info+24n)&5n)!==5n||address<read64(info)||main_base+BigInt(end+4)>read64(info)+read64(info+8n))throw Error('Invalid code range');
  for(var i=0;i<words.length;i++)words[i]=Number(read32(address+BigInt(i*4)));
  for(var i=0;i<words.length;i++){
   var op=words[i];if(((op&0x9f000000)>>>0)!==0x90000000)continue;
   var imm=(((op>>>5)&0x7ffff)<<2)|((op>>>29)&3);imm=(imm<<11)>>11;
   var pc=start+i*4,pg=(pc&~4095)+imm*4096,reg=op&31;
   if(pg!==0x4db9000)continue;
   for(var j=i+1;j<Math.min(i+16,words.length);j++){
    var load=words[j];if(((load&0xffc003e0)>>>0)!==((0xf9400000|(reg<<5))>>>0))continue;
    var offset=((load>>>10)&4095)*8;
    if(offset===0xbd8||offset===0xbe0||offset===0xbe8)matches.push({pc:(start+j*4).toString(16),slot:(pg+offset).toString(16)});
   }
  }
 }finally{free(page);free(info);}
 await log('MOONLIGHT_RENDER_UPLOAD_CALLERS: '+JSON.stringify(matches));
})();
