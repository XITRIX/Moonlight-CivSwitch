/* Full real menu/controller path, synthetic native video, no PC dependency. */
(async function(){
 await log('MOONLIGHT_ORIGINAL_UI_BEGIN');
 var root=document.createElement('div');document.body.appendChild(root);
 var originalClient=MoonlightStreamClient.create,screen,frames=0,interval=null,finish,back=0,updates=0,messages=[],firstUiMs=0,uiTimes=[],originalUiCreate=MoonlightNativeUiOverlay.create;
 var retained=MoonlightNativeDisplay.state();
 if(retained&&retained.retired){
  if(retained.failed||!retained.ledger||retained.ledger.snapshot().closed||retained.ledger.snapshot().quarantined||retained.context.read(BigInt(retained.display.layer)+0x500n,2).toString('hex')!=='0101')throw Error('Synthetic UI renderer is not safely reusable');
  retained.retired=false;retained.ready=true;retained.overlayActive=false;
 }
 window.__moonlightOriginalUiSynthetic=true;
 var display=await MoonlightNativeDisplay.prepare({width:1920,height:1080});
 var c=display.context,l=MoonlightNativeModules.layout,frame=c.allocate(1920*1080*3/2),bytes=new Uint8Array(1920*1080*3/2);bytes.fill(128,1920*1080);
 for(var y=0;y<1080;y++)for(var x=0;x<1920;x++)bytes[y*1920+x]=40+Math.floor(x/1920*130);c.write(frame,bytes);
 var setUi=MoonlightNativeDisplay.setUiOverlay;
 MoonlightNativeDisplay.setUiOverlay=function(f){updates++;var t=Date.now(),result=setUi(f);if(!firstUiMs)firstUiMs=Date.now()-t;return result;};
 MoonlightNativeUiOverlay.create=function(options){var adapter=originalUiCreate(options),update=adapter.update;adapter.update=function(){var t=Date.now(),changed=update();if(changed&&uiTimes.length<40)uiTimes.push(Object.assign({totalMs:Date.now()-t},adapter.timings));return changed;};return adapter;};
 MoonlightStreamClient.create=function(options){return {
  start:function(){interval=setInterval(function(){MoonlightNativeDisplay.publish(frame,1920,1080,1920,1080);frames++;options.onPresented();},100);return new Promise(function(r){finish=r;});},
  stop:function(){clearInterval(interval);interval=null;finish({stats:{},error:null});return Promise.resolve();},gamepad:function(){return 0;},key:function(){return 0;},resetKeys:function(){},resetPointer:function(){},mouseMove:function(){return 0;},mouseButton:function(){return 0;},mouseScroll:function(){return 0;}
 };};
 try{
  screen=MoonlightStreamScreen.create({parent:root,log:function(s){if(messages.length<30)messages.push(String(s).slice(0,180));},onBack:function(){back++;}});
  var life=screen.show('test',{id:1,title:'Native UI test'},{width:1920,height:1080,fps:60,bitrate:20000,codec:'av1',renderer:'native',videoPacing:'latency'},'PC');
  await new Promise(function(r){setTimeout(r,500);});
  screen.key({key:'Escape',repeat:false},true);
  await new Promise(function(r){setTimeout(r,500);});
  await log('MOONLIGHT_ORIGINAL_UI_READY '+JSON.stringify({updates:updates,menu:document.getElementById('moonlight-stream-menu').style.display,viewport:[innerWidth,innerHeight],uiTimes:uiTimes}));
  // User opens the menu with actual −/+ and tests More/keyboard/B.
  await Promise.race([life,new Promise(function(r){setTimeout(r,90000);})]);
  await screen.stop();await life;await screen.destroy();screen=null;
  c.release(frame);frame=null;
  await MoonlightNativeDisplay.retire();
  for(var sample of uiTimes)await log('MOONLIGHT_ORIGINAL_UI_TIMING '+JSON.stringify(sample));
  for(var message of messages)await log('MOONLIGHT_ORIGINAL_UI_LOG '+message);
  await log('MOONLIGHT_ORIGINAL_UI_RESULT '+JSON.stringify({updates:updates,frames:frames,back:back,firstUploadMs:firstUiMs,timingSamples:uiTimes.length}));
  await log('MOONLIGHT_ORIGINAL_UI_COMPLETE');
 }finally{if(interval)clearInterval(interval);if(screen)await screen.destroy();if(frame)c.release(frame);MoonlightStreamClient.create=originalClient;MoonlightNativeUiOverlay.create=originalUiCreate;MoonlightNativeDisplay.setUiOverlay=setUi;if(root.parentNode)root.parentNode.removeChild(root);}
})();
