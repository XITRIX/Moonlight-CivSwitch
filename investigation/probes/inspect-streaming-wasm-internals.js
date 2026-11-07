/* Read flags and bounded V8 API code; does not change flags or reinitialize V8. */
(async function(){
 var N=window.MoonlightProbeNative;
 async function out(name,value){await log("MOONLIGHT_STREAM_WASM_NATIVE_"+name+": "+JSON.stringify(value));}
 var names=Object.keys(N.mainExports).filter(function(name){return /FLAG_(jitless|expose_wasm|allow_natives_syntax|wasm_interpret_all|wasm_lazy_compilation)|WasmJs.*Install|Isolate.*GetCurrent|WasmModuleObject.*Compile|V8.*GetVersion|V8.*SetFlagsFromString/.test(name);});
 for(var name of names){
  var item=N.mainExports[name],value={name:name,offset:item.offset,size:item.size};
  if(/FLAG_/.test(name))value.value=item.size===1?Number(read8(item.address)):Number(read32(item.address));
  await out("SYMBOL",value);
  if(!/FLAG_/.test(name)&&item.size>0&&item.size<30000){var bytes=N.copyFrom(item.address,Math.min(item.size,2048)),hex="";for(var b of bytes)hex+=("0"+b.toString(16)).slice(-2);await out("CODE",{name:name,offset:item.offset,length:bytes.length,hex:hex});}
 }
 var versionName=Object.keys(N.mainExports).find(function(name){return /^_ZN2v82V810GetVersionEv$/.test(name);});
 if(versionName){var pointer=call_rop(N.mainResolve(versionName));await out("VERSION",read_null_terminated_string(pointer));}
 delete window.MoonlightProbeNative;await out("END",true);
})();
