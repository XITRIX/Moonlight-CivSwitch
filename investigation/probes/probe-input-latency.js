/* Neutral controller packets: sample->socket and socket->host ENet ACK under load.
   Does not measure physical button age, host game response, or display scanout. */
(async function(){
 var fps=window.__moonlightInputProbeFps||30;delete window.__moonlightInputProbeFps;
 var continuous=!!window.__moonlightInputProbeContinuous;delete window.__moonlightInputProbeContinuous;
 var mode=window.__moonlightInputProbeMode||{width:1280,height:720,bitrate:3000};delete window.__moonlightInputProbeMode;
 if(fps!==30&&fps!==60)throw Error('Unsupported input probe rate');
 var now=window.MoonlightTelemetry.now,observer=window.MoonlightInputObserver.create(),makeIO=window.MoonlightStreamIO.create;
 var client,frame=null,activeAt=0,nextInput=0,pulses=0,pollCosts=[],pollIntervals=[],lastPoll=0,pad=null,samples=[],messages=[];
 var panel=document.createElement('div');panel.style.cssText='position:fixed;inset:0;background:#000;background-size:contain;background-position:center;background-repeat:no-repeat;z-index:3;';document.body.appendChild(panel);
 window.MoonlightStreamIO.create=function(transport,options){var io=makeIO(transport,options),invoke=io.io,interrupt=io.interrupt;io.interrupt=function(){observer.finish();return interrupt.apply(io,arguments);};io.io=function(op,args,heap){var begin=now(),value=invoke(op,args,heap),end=now();if(op===4||op===5)observer.observe(op,args,heap,value,begin,end);return value;};return io;};
 function poll(){
  var time=now();if(activeAt){
   if(lastPoll)pollIntervals.push(time-lastPoll);lastPoll=time;
   var before=now();if(pad)pad.poll();pollCosts.push(now()-before);
   if(time>=nextInput&&pulses<(continuous?1200:80)){
    var queuedAt=now();if(client.gamepad(0,0,0,0,0,0,0)===0){observer.enqueue(queuedAt);pulses++;}
    nextInput=time+(continuous?0:233);
   }
  }
  frame=requestAnimationFrame(poll);
 }
 function rounded(key,value){return typeof value==='number'?Math.round(value*1000)/1000:value;}
 async function out(name,value){await log('MOONLIGHT_INPUT_'+name+': '+JSON.stringify(value,rounded));}
 function range(values){var v=values.slice().sort(function(a,b){return a-b;});return {count:v.length,min:v[0],median:v[Math.floor(v.length/2)],p95:v[Math.floor((v.length-1)*.95)],max:v[v.length-1]};}
 try{
  pad=window.MoonlightControllerInput.createNative();frame=requestAnimationFrame(poll);
  client=window.MoonlightStreamClient.create({host:'192.168.1.4:47989',app:{id:881448767,title:'Desktop'},mode:Object.assign({},mode,{fps:fps}),durationMs:24000,
   onImage:function(url){panel.style.backgroundImage='url("'+url+'")';},canPresent:function(){return true;},log:function(text){messages.push(String(text).slice(0,512));if(messages.length>64)messages.shift();},
   onStats:function(s){if(s.state===2){if(!activeAt){activeAt=now();nextInput=activeAt+500;}samples.push(s.telemetry);}}});
  var result=await client.start();cancelAnimationFrame(frame);frame=null;
  if(result.error)await out('ERROR',{message:String(result.error.message),messages:messages});
  if(!result.stats)throw result.error||Error('Stream did not initialize');
  var s=result.stats,observed=observer.summary(),sent=observed.samples.filter(function(v){return v.sent!==null;}),acked=sent.filter(function(v){return v.ack!==null;});
  var timingValid=sent.length===pulses&&observed.pending===0;
  await out('RESULT',{mode:s.mode,pumpBudgetMs:s.pumpBudgetMs,network:s.network,referenceRecovery:s.referenceRecovery,fps:fps,continuousInput:continuous,timingValid:timingValid,error:result.error?String(result.error.message):null,state:s.state,tasks:s.tasks,pulses:pulses,sent:sent.length,acked:acked.length,retries:observed.retries,pending:observed.pending,
   queueToSocketMs:timingValid?range(sent.map(function(v){return v.sent-v.queued;})):null,socketToAckMs:range(acked.map(function(v){return v.ack-v.sent;})),sampleToAckMs:timingValid?range(acked.map(function(v){return v.ack-v.queued;})):null,pollIntervalMs:range(pollIntervals),pollCostMs:range(pollCosts),decoded:s.decoded,presented:s.presented,audioDecoded:s.audioDecoded,audioDiscardedMs:s.audioDiscardedMs});
  var events=continuous?observed.samples.slice(0,10).concat(observed.samples.slice(-10)):observed.samples;
  if(continuous)await out('EVENT_SELECTION',{total:observed.samples.length,logged:events.length,selection:'first and last ten; aggregates use all events'});
  for(var i=0;i<events.length;i+=10)await out('EVENTS',events.slice(i,i+10));
  for(var i=0;i<samples.length;i+=1)await out('STREAM',samples[i]);
  if(result.error||s.tasks||s.state||sent.length<40||acked.length<40)throw Error('Input timing probe incomplete');
 }finally{if(frame!==null)cancelAnimationFrame(frame);if(pad)pad.close();window.MoonlightStreamIO.create=makeIO;if(panel.parentNode)panel.parentNode.removeChild(panel);}
})();
