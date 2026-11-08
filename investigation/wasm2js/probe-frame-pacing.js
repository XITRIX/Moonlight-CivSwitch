/* Frame pacing profile: all logs emitted after the live stream has stopped. */
(async function(){
 var config=window.__moonlightPacingProbe||{};delete window.__moonlightPacingProbe;
 var now=window.MoonlightTelemetry.now,makeMedia=window.MoonlightStreamMedia.create,client,pad,raf=null,activeAt=0,pulses=0,lastPoll=0;
 var samples=[],trace=[],messages=[],hist={},submitCosts=[],drainCosts=[],pollIntervals=[],lastSubmit=0,lastPresent=0,presentIntervals=[];
 var panel=document.createElement('div');panel.style.cssText='position:fixed;left:0;right:0;top:0;bottom:0;background:#000;background-size:contain;background-position:center;background-repeat:no-repeat;z-index:3;';document.body.appendChild(panel);
 window.MoonlightStreamMedia.create=function(io,core,options){options.synchronousGpu=!!config.synchronousGpu;options.smoothVideo=config.smoothVideo!==false;var media=makeMedia(io,core,options),submit=media.videoFrame,drain=media.drainVideo;
  media.videoFrame=function(){var begin=now(),result=submit.apply(media,arguments);submitCosts.push(now()-begin);if(result===0)lastSubmit=now();return result;};
  media.drainVideo=function(){var a=media.stats(),begin=now(),result=drain();var end=now(),b=media.stats();
   if(activeAt){var decoded=b.decoded-a.decoded,presented=b.presented-a.presented,key=decoded+':'+presented;hist[key]=(hist[key]||0)+1;drainCosts.push(end-begin);
    if(trace.length<80)trace.push({t:end-activeAt,submitted:a.submitted,decoded:decoded,presented:presented,pending:b.decoderPending,sinceSubmit:lastSubmit?begin-lastSubmit:null});
   }return result;
  };return media;
 };
 function poll(){var t=now();if(activeAt){if(lastPoll)pollIntervals.push(t-lastPoll);lastPoll=t;if(pad)pad.poll();if(config.continuous&&pulses<1200&&client.gamepad(0,0,0,0,0,0,0)===0)pulses++;}raf=requestAnimationFrame(poll);}
 function range(values){var v=values.filter(Number.isFinite).slice().sort(function(a,b){return a-b;});return {count:v.length,min:v[0],median:v[Math.floor(v.length/2)],p95:v[Math.floor((v.length-1)*.95)],max:v[v.length-1]};}
 function rounded(k,v){return typeof v==='number'?Math.round(v*1000)/1000:v;}
 async function out(k,v){await log('MOONLIGHT_PACING_'+k+': '+JSON.stringify(v,rounded));}
 try{
  await log('MOONLIGHT_PACING_STAGE: preparing');
  pad=window.MoonlightControllerInput.createNative();raf=requestAnimationFrame(poll);
  await log('MOONLIGHT_PACING_STAGE: controller ready');
  client=window.MoonlightStreamClient.create({host:'192.168.1.4:47989',app:{id:881448767,title:'Desktop'},durationMs:24000,mode:{width:config.width||1280,height:config.height||720,fps:config.fps||60,bitrate:config.bitrate||3000,videoPacing:config.smoothVideo===false?"latency":"smooth"},
   onImage:function(url){var t=now();if(activeAt&&lastPresent)presentIntervals.push(t-lastPresent);lastPresent=t;panel.style.backgroundImage='url("'+url+'")';},canPresent:function(){return true;},
   onStatus:function(text){if(!activeAt)log('MOONLIGHT_PACING_STAGE: '+String(text).slice(0,128));},
   log:function(text){messages.push(String(text).slice(0,512));if(messages.length>64)messages.shift();},
   onStats:function(stats){if(stats.state===2){if(!activeAt)activeAt=now();samples.push(stats);}}
  });
  var result=await client.start();cancelAnimationFrame(raf);raf=null;var s=result.stats;
  await out('RESULT',{mode:s&&s.mode,network:s&&s.network,budgetYields:s&&s.budgetYields,maxPumpMs:s&&s.maxPumpMs,maxDrainMs:s&&s.maxDrainMs,pumpBudgetMs:config.pumpBudgetMs||10,phase:config.phase||'baseline',prePumpMs:config.prePumpMs||0,completionPumpMs:config.completionPumpMs||0,synchronousGpu:!!config.synchronousGpu,smoothVideo:config.smoothVideo!==false,gpuTransferMs:s&&s.gpuTransferMs,gpuPollMs:s&&s.gpuPollMs,gpuPendingPolls:s&&s.gpuPendingPolls,continuous:!!config.continuous,error:result.error?result.error.message:null,state:s&&s.state,tasks:s&&s.tasks,submitted:s&&s.submitted,decoded:s&&s.decoded,presented:s&&s.presented,superseded:s&&s.videoSuperseded,audioDecoded:s&&s.audioDecoded,audioDiscardedMs:s&&s.audioDiscardedMs,pulses:pulses,clock:s&&s.clock,iterations:s&&s.iterations,pumpMs:s&&s.pumpMs,drainMs:s&&s.drainMs,histogram:hist,submitCostMs:range(submitCosts),drainCostMs:range(drainCosts),pollIntervalMs:range(pollIntervals),presentIntervalMs:range(presentIntervals)});
  for(var i=0;i<samples.length;i++)await out('SAMPLE',samples[i].telemetry);
  for(var i=0;i<trace.length;i+=10)await out('TRACE',trace.slice(i,i+10));
  if(result.error||!s||s.state||s.tasks||s.presented<300)throw result.error||Error('Pacing test incomplete');
 }finally{if(raf!==null)cancelAnimationFrame(raf);if(pad)pad.close();window.MoonlightStreamMedia.create=makeMedia;if(panel.parentNode)panel.parentNode.removeChild(panel);}
})();
