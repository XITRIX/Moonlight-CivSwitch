(async()=>{
 var root=document.createElement('div');document.body.appendChild(root);
 var messages=[],samples=[],draws=[],screen,originalCreate=MoonlightStreamClient.create,originalOverlay=MoonlightNativeDisplay.showOverlay,originalUi=MoonlightNativeDisplay.setUiOverlay,begin=Date.now(),firstPicture=false;
 function record(text){if(messages.length<120)messages.push(String(text));}
 await log('MOONLIGHT_NATIVE_MENU_TEST_BEGIN');
 MoonlightNativeDisplay.setUiOverlay=function(frame){var t=Date.now(),result=originalUi(frame);draws.push({at:Date.now()-begin,kind:'original-ui',uploadMs:Date.now()-t});return result;};
 MoonlightNativeDisplay.showOverlay=function(spec){draws.push({at:Date.now()-begin,kind:spec.kind,selected:spec.selected});return originalOverlay(spec);};
 MoonlightStreamClient.create=function(options){options.durationMs=120000;var shown=options.onPresented;options.onPresented=function(){if(shown)shown();if(!firstPicture){firstPicture=true;setTimeout(function(){if(screen)screen.key({key:'Escape',repeat:false},true);},1000);}};return originalCreate(options);};
 try{
  screen=MoonlightStreamScreen.create({parent:root,log:record,onBack:function(){record('Back callback');},onStats:function(s){samples.push({at:Date.now()-begin,decoded:s.decoded,presented:s.presented,audio:s.audioDecoded,tasks:s.tasks});}});
  var result=await screen.show('192.168.1.4:47989',{id:881448767,title:'Desktop'},{width:1920,height:1080,fps:60,bitrate:20000,codec:'av1',renderer:'native',videoPacing:'latency'},'PC');
  await screen.destroy();screen=null;
  for(var text of messages)await log('MOONLIGHT_NATIVE_MENU_LOG '+text.slice(0,1400));
  for(var sample of samples)await log('MOONLIGHT_NATIVE_MENU_SAMPLE '+JSON.stringify(sample));
  for(var draw of draws)await log('MOONLIGHT_NATIVE_MENU_DRAW '+JSON.stringify(draw));
  await log('MOONLIGHT_NATIVE_MENU_RESULT '+JSON.stringify({error:result&&result.error?result.error.message:null,tasks:result&&result.stats&&result.stats.tasks,decoded:result&&result.stats&&result.stats.decoded,presented:result&&result.stats&&result.stats.presented,unfinished:!!window.__moonlightStreamUnfinished,firstPicture:firstPicture,retired:!!(MoonlightNativeDisplay.state()&&MoonlightNativeDisplay.state().retired)}));
  if(result&&result.error)throw result.error;
  await log('MOONLIGHT_NATIVE_MENU_TEST_COMPLETE');
 }finally{MoonlightStreamClient.create=originalCreate;MoonlightNativeDisplay.showOverlay=originalOverlay;MoonlightNativeDisplay.setUiOverlay=originalUi;if(root.parentNode)root.parentNode.removeChild(root);}
})();
