/* Bounded real stream: direct I/O and telemetry, with a visible diagnostics panel. */
(async function(){
 var panel=document.createElement('div'),image=document.createElement('div'),overlay=document.createElement('div'),client,firstImage=0,samples=0,lastTelemetry=null;
 panel.style.cssText='position:fixed;left:0;top:0;right:0;bottom:0;z-index:3;background:#000;color:white;';
 image.style.cssText='position:absolute;left:0;top:0;right:0;bottom:0;background-size:contain;background-position:center;background-repeat:no-repeat;';panel.appendChild(image);
 overlay.style.cssText='position:absolute;top:14px;left:14px;padding:12px 16px;max-width:90vw;background:rgba(12,18,32,0.88);border-radius:8px;color:#e4efff;font:16px/1.4 Arial;white-space:pre-wrap;';panel.appendChild(overlay);document.body.appendChild(panel);
 async function out(name,value){var text='MOONLIGHT_SCHEDULING_'+name+': '+JSON.stringify(value,function(key,v){return typeof v==='number'?Math.round(v*1000)/1000:v;});if(text.length>1800)throw Error('Probe log exceeds bound');await log(text);}
 try{
  client=window.MoonlightStreamClient.create({host:'192.168.1.4:47989',app:{id:881448767,title:'Desktop'},durationMs:30000,
   mode:{width:1280,height:720,fps:30,bitrate:3000},
   onStatus:function(text){if(!firstImage)overlay.textContent=text;},
   onImage:function(url){if(!url.startsWith('live:/moonlight-experiment/'))throw Error('Expected GPU texture');image.style.backgroundImage='url("'+url+'")';if(!firstImage)firstImage=Date.now();},canPresent:function(){return true;},
   log:function(text){log('MOONLIGHT_STREAM_CORE: '+text.slice(0,1000));},
   onStats:function(stats){overlay.textContent=window.MoonlightTelemetry.format(stats);if(stats.state===2){samples++;lastTelemetry=stats.telemetry;out('SAMPLE',{telemetry:stats.telemetry,clock:stats.clock,budgetYields:stats.budgetYields,maxPumpMs:stats.maxPumpMs,maxDrainMs:stats.maxDrainMs});}},
   onError:function(error){out('ERROR',String(error.message).slice(0,1000));}
  });
  var result=await client.start(),s=result&&result.stats;
  await out('RESULT',{error:result&&result.error?result.error.message:null,visibleMs:firstImage?Date.now()-firstImage:0,samples:samples,submitted:s&&s.submitted,decoded:s&&s.decoded,presented:s&&s.presented,decodeSamples:s&&s.decodeSamples,network:s&&s.network,clock:s&&s.clock,budgetYields:s&&s.budgetYields,audioDiscardedMs:s&&s.audioDiscardedMs,lastTelemetry:lastTelemetry});
  if(result&&result.error)throw result.error;
  if(!s||s.state!==0||s.tasks!==0||s.presented<30||s.decodeSamples<10||samples<3||!s.network.directReceivedBytes||s.network.directReceivedBytes!==s.network.receivedBytes)throw Error('Direct I/O / telemetry validation failed');
  await out('PASSED',true);
 }finally{if(panel.parentNode)panel.parentNode.removeChild(panel);}
})();
