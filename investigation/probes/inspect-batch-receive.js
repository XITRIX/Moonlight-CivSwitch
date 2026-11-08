/* Bounded export inventory only; no unverified socket functions are called. */
(async function(){
 var exports=window.MoonlightProbeNative.exports;
 var names=Object.keys(exports).filter(function(name){return /socket.*(?:Recv|Readv|SendM|Mmsg)|recvmmsg|recvmsg/i.test(name);});
 await log('MOONLIGHT_BATCH_RECEIVE_EXPORTS: '+JSON.stringify(names.map(function(name){var entry=exports[name];return {name:name,offset:entry.offset,size:entry.size};})));
 delete window.MoonlightProbeNative;
})();
