/* Capture only the installed SDK batch-receive wrapper and detail function. */
(async function(){
 var info=malloc(64),page=malloc(8);
 try{
  if(read32(sdk_base+0x168b10n)!==0xd40000c1n)throw Error('Memory query ABI rejected');
  for(var entry of [[0x153d50,576],[0x153f90,1152]]){
   var p=sdk_base+BigInt(entry[0]),length=entry[1];
   if(call_rop(sdk_base+0x168b0cn,info,page,p)&0x3fffffn)throw Error('Code query failed');
   if((Number(read32(info+24n))&5)!==5||p<read64(info)||p+BigInt(length)>read64(info)+read64(info+8n))throw Error('Code read rejected');
   var hex='';for(var i=0;i<length;i+=4)hex+=Number(read32(p+BigInt(i))).toString(16).padStart(8,'0').match(/../g).reverse().join('');
   await log('MOONLIGHT_RENDER_SLICE: '+JSON.stringify({offset:entry[0].toString(16),permissions:5,hex:hex}));
  }
 }finally{free(page);free(info);}
})();
