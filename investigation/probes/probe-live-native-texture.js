(async function(){
 var panel=document.createElement('div'),image=document.createElement('div'),label=document.createElement('div'),client,firstImage=0;
 panel.style.cssText='position:fixed;inset:0;z-index:3;background:#0c1220;color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;';
 image.style.cssText='width:960px;height:540px;background-size:100% 100%;background-repeat:no-repeat;';panel.appendChild(image);panel.appendChild(label);document.body.appendChild(panel);
 async function out(name,value){await log('MOONLIGHT_STREAM_'+name+': '+JSON.stringify(value));}
 try{
  client=window.MoonlightStreamClient.create({host:'192.168.1.4:47989',app:{id:881448767,title:'Desktop'},durationMs:20000,
   mode:{width:320,height:180,fps:15,bitrate:1000},
   onStatus:function(text){label.textContent=text;out('STATUS',text);},
   onImage:function(url){if(!url.startsWith('live:/moonlight-experiment/'))throw Error('Expected a native live image');image.style.backgroundImage='url("'+url+'")';if(!firstImage)firstImage=Date.now();},canPresent:function(){return true;},
   log:function(text){log('MOONLIGHT_STREAM_CORE: '+text.slice(0,1200));},onStats:function(stats){out('STATS',stats);},onError:function(error){out('ERROR',String(error.message).slice(0,1000));}
  });
  var result=await client.start();await out('LIVE_RESULT',{error:result&&result.error?result.error.message:null,stats:result&&result.stats,visibleMs:firstImage?Date.now()-firstImage:0});
  if(result&&result.error)throw result.error;
  if(!result||!result.stats||result.stats.renderer!=='native-texture'||result.stats.textureFrames<5||!firstImage)throw Error('Native stream produced too few frames');
  await out('LIVE_PASSED',true);
 }catch(error){await out('ERROR',String(error.message).slice(0,1000));throw error;}
 finally{if(panel.parentNode)panel.parentNode.removeChild(panel);await out('LIVE_END',true);}
})();
