/* Bounded SDK function reads; no input setup or controller reassignment. */
(async function(){
 var N=window.MoonlightProbeNative,info=malloc(64),page=malloc(8);
 try{
  for(var name of ['_ZN2nn3hid15GetNpadStyleSetERKj','_ZN2nn3hid12GetNpadStateEPNS0_16NpadFullKeyStateERKj','_ZN2nn3hid6detail13GetNpadStatesEPiPNS0_16NpadFullKeyStateEiRKj','_ZN2nn3hid6detail13GetNpadStatesEPiPNS0_17NpadHandheldStateEiRKj','_ZN2nn3hid6detail15GetNpadStyleSetEPNS_4util10BitFlagSetILi32ENS0_12NpadStyleTagEEERKj']){
   var e=N.exports[name];if(!e||e.size>1024)throw Error('Missing bounded HID function');
   if(call_rop(sdk_base+0x168b0cn,info,page,e.address)&0x3fffffn)throw Error('Query failed');
   if((read32(info+24n)&5n)!==5n||e.address<read64(info)||e.address+BigInt(e.size+4)>read64(info)+read64(info+8n))throw Error('Code range rejected');
   var b=N.copyFrom(e.address,e.size);await log('MOONLIGHT_INPUT_CODE_NAME: '+JSON.stringify({name:name,offset:e.offset}));
   await log('MOONLIGHT_RENDER_SLICE: '+JSON.stringify({offset:e.offset,permissions:5,hex:Array.from(b,function(x){return ('0'+x.toString(16)).slice(-2);}).join('')}));
  }
 }finally{free(page);free(info);}
})();
