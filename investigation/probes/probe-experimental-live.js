(async function(){
 var mode=window.__moonlightExperimentalTestMode||{width:1920,height:1080,fps:60,bitrate:20000,codec:"h264",renderer:"native",videoPacing:"latency"};
 var messages=[],samples=[],client,shown=0;
 await log("MOONLIGHT_EXPERIMENTAL_LIVE_BEGIN "+JSON.stringify(mode));
 try{
  client=window.MoonlightStreamClient.create({host:"192.168.1.4:47989",app:{id:881448767,title:"Desktop"},mode:mode,durationMs:window.__moonlightExperimentalTestDuration||15000,
   onStatus:function(text){messages.push(text);},log:function(text){if(messages.length<100)messages.push(text);},
   onPresented:function(){shown++;},canPresent:function(){return true;},onStats:function(stats){samples.push({at:Date.now(),decoded:stats.decoded,presented:stats.presented,submitted:stats.submitted,queued:stats.queuedFrames,audio:stats.audioDecoded,rx:stats.network.receivedBytes,pumpMs:stats.pumpMs,drainMs:stats.drainMs});}});
  var result=await client.start(),s=result&&result.stats;
  for(var text of messages)await log("MOONLIGHT_EXPERIMENTAL_LIVE_LOG "+text.slice(0,1500));
  for(var sample of samples)await log("MOONLIGHT_EXPERIMENTAL_LIVE_SAMPLE "+JSON.stringify(sample));
  var head=samples[1],tail=samples[samples.length-1];
  if(head&&tail&&tail.at>head.at)await log("MOONLIGHT_EXPERIMENTAL_LIVE_RATE "+JSON.stringify({sampleMs:tail.at-head.at,presentedFps:(tail.presented-head.presented)*1000/(tail.at-head.at),decodedFps:(tail.decoded-head.decoded)*1000/(tail.at-head.at),audioPacketsPerSecond:(tail.audio-head.audio)*1000/(tail.at-head.at)}));
  if(s)await log("MOONLIGHT_EXPERIMENTAL_LIVE_TIMING "+JSON.stringify({maxPumpMs:s.maxPumpMs,maxDrainMs:s.maxDrainMs,decodeMs:s.decodeMs,maxDecodeMs:s.maxDecodeMs,audioPrimed:s.audioPrimed,audioEmptyEpisodes:s.audioEmptyEpisodes,audioEmptyMs:s.audioEmptyMs,audioDiscardedMs:s.audioDiscardedMs,videoExpired:s.videoExpired,videoBacklogDrops:s.videoBacklogDrops}));
  await log("MOONLIGHT_EXPERIMENTAL_LIVE_RESULT "+JSON.stringify({error:result&&result.error?result.error.message:null,shown:shown,renderer:s&&s.renderer,codec:s&&s.codec,decoded:s&&s.decoded,presented:s&&s.presented,audioDecoded:s&&s.audioDecoded,audioDropped:s&&s.audioDropped,decoderRejected:s&&s.decoderRejected,tasks:s&&s.tasks,display:s&&[s.displayWidth,s.displayHeight]}));
  if(result&&result.error)throw result.error;
  if(!s||s.presented<30)throw Error("Too few decoded/presented video frames");
  await log("MOONLIGHT_EXPERIMENTAL_LIVE_COMPLETE");
 }catch(error){await log("MOONLIGHT_EXPERIMENTAL_LIVE_ERROR "+String(error.stack||error).slice(0,1400));throw error;}
})();
