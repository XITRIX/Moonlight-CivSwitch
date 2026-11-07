(async function(){
 var io,media,core,image=document.createElement("img"),displayed=0,loading=false;
 Object.assign(image.style,{position:"fixed",left:"10%",top:"10%",width:"80%",height:"80%",zIndex:"3"});document.body.appendChild(image);
 image.onload=function(){loading=false;displayed++;};image.onerror=function(){loading=false;};
 async function out(name,v){await log("MOONLIGHT_STREAM_"+name+": "+JSON.stringify(v));}
 function hex(s){return Uint8Array.from(s.match(/../g),function(b){return parseInt(b,16);});}
 try{
  var upload=window.__moonlightStreamModuleUpload,make=new Function(upload.parts.join("")+"\nreturn MoonlightStreamCore;")();delete window.__moonlightStreamModuleUpload;
  io=window.MoonlightStreamIO.create(window.MoonlightNative.create());core=await make({moonlightPlatform:{io:io.io,randomFill:io.randomFill}});
  media=window.MoonlightStreamMedia.create(io,core,{canPresent:function(){return !loading;},onImage:function(url){loading=true;image.src=url;}});
  media.videoSetup(1,320,180,15);media.audioSetup(48000,2,1,1,960);
  var fixture=window.__moonlightStreamFixture,pointer=core._malloc(131072),sps=core._malloc(4096),pps=core._malloc(4096),a=hex(fixture.sps),b=hex(fixture.pps);core.HEAPU8.set(a,sps);core.HEAPU8.set(b,pps);
  for(var i=0;i<fixture.packets.length;i++){
   var packet=hex(fixture.packets[i]);core.HEAPU8.set(packet,pointer);if(media.videoFrame(pointer,packet.length,i?2:1,Math.round(i*1000000/15),sps,a.length,pps,b.length,core.HEAPU8))throw Error("Video fixture submission failed");
   for(var j=0;j<3;j++){var audio=hex(window.__moonlightOpusPackets[(i*3+j)%window.__moonlightOpusPackets.length]);core.HEAPU8.set(audio,pointer);media.audioFrame(pointer,audio.length,core.HEAPU8);media.drainVideo();await new Promise(function(r){setTimeout(r,20);});}
  }
  for(var i=0;i<15;i++){media.drainVideo();await new Promise(function(r){setTimeout(r,20);});}
  var stats=media.stats();await out("MEDIA_ADAPTER_RESULT",{stats:stats,displayed:displayed});
  if(stats.decoded<10||displayed<1||stats.audioQueued<10)throw Error("Media adapter did not process enough frames");
  core._free(pointer);core._free(sps);core._free(pps);await out("MEDIA_ADAPTER_PASSED",true);
 }catch(error){await out("ERROR",String(error.stack||error));}
 finally{if(media)media.close();if(io)io.close();image.onload=image.onerror=null;if(image.parentNode)image.parentNode.removeChild(image);delete window.__moonlightStreamFixture;delete window.__moonlightOpusPackets;await out("MEDIA_ADAPTER_END",true);}
})();
