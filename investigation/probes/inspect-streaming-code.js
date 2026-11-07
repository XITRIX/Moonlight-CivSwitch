/* Execute permission test confined to a private allocated page. */
(async function(){
 var N=window.MoonlightProbeNative;
 async function out(name,value){await log("MOONLIGHT_STREAM_EXEC_"+name+": "+JSON.stringify(value));}
 function result(v){return "0x"+Number(v&0x3fffffn).toString(16);}
 var allocation=malloc(0x6000),rx=false,page=(allocation+4095n)&~4095n;
 try{
  // Exact raw syscall wrapper was inspected in the shipped SDK. The public
  // SetMemoryPermission wrapper aborts on unsupported permissions, so do not use it.
  var setter=sdk_base+0x168aecn;
  if(read32(setter)!==0xd4000041n||read32(setter+4n)!==0xd65f03c0n)throw Error("SetMemoryPermission wrapper does not match inspected code");
  write32(page,0x52800540n);write32(page+4n,0xd65f03c0n); // mov w0,42; ret
  N.call("_ZN2nn2os14FlushDataCacheEPKvm",[page,4096]);
  var changed=call_rop(setter,page,4096n,5n);rx=(changed&0x3fffffn)===0n;
  await out("OWN_PAGE_RX",{result:result(changed),allowed:rx});
  if(rx)await out("NATIVE_CODE_RESULT",Number(call_rop(page)));
 }catch(error){await out("OWN_PAGE_RX_ERROR",String(error.message||error));}
 finally{
  if(rx){var restored=call_rop(sdk_base+0x168aecn,page,4096n,3n);await out("OWN_PAGE_RW_RESTORED",result(restored));if((restored&0x3fffffn)===0n)free(allocation);}
  else free(allocation);
 }
 delete window.MoonlightProbeNative;await out("CODE_END",true);
})();
