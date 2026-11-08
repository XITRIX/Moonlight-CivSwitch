(async function(){
 var retained=window.__moonlightStreamUnfinished;
 if(!retained){await log('MOONLIGHT_REAP_CORE: absent');return;}
 var core=retained.core,begin=Date.now(),before={state:core._ml_session_state(),tasks:core._ml_runtime_tasks()};
 if(before.state!==0){await log('MOONLIGHT_REAP_CORE: '+JSON.stringify({before:before,retained:true}));return;}
 while(core._ml_runtime_tasks()&&Date.now()-begin<2000){core._ml_runtime_pump(2);await new Promise(function(r){setTimeout(r,2);});}
 var after={state:core._ml_session_state(),tasks:core._ml_runtime_tasks()};
 if(after.state===0&&after.tasks===0){if(retained.media)retained.media.close();if(retained.io)retained.io.close();delete window.__moonlightStreamUnfinished;}
 await log('MOONLIGHT_REAP_CORE: '+JSON.stringify({before:before,after:after,retained:!!window.__moonlightStreamUnfinished,ms:Date.now()-begin}));
})();
