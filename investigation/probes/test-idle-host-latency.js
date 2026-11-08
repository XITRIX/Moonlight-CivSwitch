/* Read-only Sunshine status timings while the streaming loop is stopped. */
(async function(){
 var native=window.MoonlightNative.create(),times=[],wakes=[],errors=[];
 function now(){return window.performance&&window.performance.now?window.performance.now():Date.now();}
 for(var i=0;i<16;i++){
  var before=now();await new Promise(function(done){setTimeout(done,2);});wakes.push(now()-before);
  before=now();
  try{await native.requestHttp({host:'192.168.1.4',port:47989,path:'/serverinfo?uniqueid=moonlight-network-check',timeoutMs:2500,maxResponseBytes:65536});times.push(now()-before);}
  catch(error){errors.push(error.message);}
  await new Promise(function(done){setTimeout(done,100);});
 }
 function summary(values){if(!values.length)return null;values.sort(function(a,b){return a-b;});return {count:values.length,min:values[0],median:values[Math.floor(values.length/2)],max:values[values.length-1],mean:values.reduce(function(a,b){return a+b;},0)/values.length};}
 await log('MOONLIGHT_IDLE_HOST_HTTP: '+JSON.stringify(summary(times)));
 await log('MOONLIGHT_IDLE_TIMER_2MS: '+JSON.stringify(summary(wakes)));
 await log('MOONLIGHT_IDLE_HOST_ERRORS: '+JSON.stringify(errors));
})();
