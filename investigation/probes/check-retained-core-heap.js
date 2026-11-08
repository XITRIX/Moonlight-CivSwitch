(async function(){
 var retained=window.__moonlightStreamUnfinished;
 if(!retained){await log('MOONLIGHT_RETAINED_CORE: absent');return;}
 var core=retained.core,io=retained.io,p=core._malloc(16);
 if(!p)throw Error('Witness allocation failed');
 try{
  var view=new DataView(core.HEAPU8.buffer),expected=0x6d6c383074657374n;view.setBigUint64(p,expected,true);
  var address=io.heapAddress(core.HEAPU8),actual=read64(address+BigInt(p));
  await log('MOONLIGHT_RETAINED_CORE: '+JSON.stringify({state:core._ml_session_state(),tasks:core._ml_runtime_tasks(),heapWitness:actual===expected,expected:expected.toString(16),actual:actual.toString(16),stats:io.stats}));
 }finally{core._free(p);}
})();
