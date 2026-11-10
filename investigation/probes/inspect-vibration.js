/* Read-only SDK export and instruction capture; does not activate vibration. */
(async function(){
 var N=window.MoonlightProbeNative;
 try{
  var names=Object.keys(N.exports).filter(function(name){return /^_ZN2nn3hid/.test(name)&&/Vibration/.test(name)&&!(/6system/.test(name));});
  for(var name of names){
   var entry=N.exports[name];
   await log("VIBRATION_EXPORT "+JSON.stringify({name:name,offset:entry.offset,size:entry.size}));
   if(/GetVibrationDeviceHandles|InitializeVibrationDevice|SendVibrationValue|IsVibrationPermitted/.test(name)){
    var length=Math.min(entry.size,2048),bytes=N.copyFrom(entry.address,length);
    for(var i=0;i<length;i+=128){
     var hex="";for(var j=i;j<Math.min(i+128,length);j++)hex+=(bytes[j]<16?"0":"")+bytes[j].toString(16);
     await log("VIBRATION_CODE "+JSON.stringify({offset:(BigInt("0x"+entry.offset)+BigInt(i)).toString(16),hex:hex}));
    }
   }
  }
  await log("VIBRATION_INSPECT_DONE");
 }finally{delete window.MoonlightProbeNative;}
})();
