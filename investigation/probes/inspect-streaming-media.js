/* Actual sample playback and rendering checks; auto-closes, no console files. */
(async function(){
 var samples=window.__moonlightStreamingSamples;
 async function out(name,value){await log("MOONLIGHT_STREAM_MEDIA_"+name+": "+JSON.stringify(value));}
 function pause(ms){return new Promise(function(done){setTimeout(done,ms);});}
 function decode(text){
  var alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",values=[],bits=0,acc=0;
  for(var i=0;i<text.length;i++){var value=alphabet.indexOf(text.charAt(i));if(value<0)continue;acc=(acc<<6)|value;bits+=6;if(bits>=8){bits-=8;values.push((acc>>bits)&255);}}
  return new Uint8Array(values);
 }
 var box=document.createElement("div");Object.assign(box.style,{position:"fixed",right:"20px",top:"20px",width:"260px",height:"310px",padding:"12px",backgroundColor:"#131d2e",color:"white",zIndex:"100"});
 var title=document.createElement("div");box.appendChild(title);document.body.appendChild(box);
 await out("URL_APIS",{createObjectURL:typeof URL.createObjectURL,revokeObjectURL:typeof URL.revokeObjectURL,atob:typeof atob});
 try{
  for(var test of [{name:"H264_MP4_DATA",key:"mp4",mime:"video/mp4",blob:false},{name:"VP8_WEBM_DATA",key:"webm",mime:"video/webm",blob:false},{name:"VP8_WEBM_BLOB",key:"webm",mime:"video/webm",blob:true},{name:"VP8_VORBIS_WEBM_BLOB",key:"webmAudio",mime:"video/webm",blob:true}]){
   var video=document.createElement("video"),events=[],url=null;
   Object.assign(video.style,{display:"block",width:"240px",height:"240px",backgroundColor:"#111"});title.textContent=test.name;
   video.autoplay=true;video.loop=false;video.muted=true;video.preload="auto";
   video.setAttribute("autoplay","");video.setAttribute("muted","");video.setAttribute("preload","auto");
   box.appendChild(video);
   for(var name of ["loadstart","loadedmetadata","loadeddata","canplay","play","playing","timeupdate","durationchange","ended","error"])(function(name){video.addEventListener(name,function(){events.push(name);});})(name);
   try{
    if(test.blob){if(typeof URL.createObjectURL!=="function")throw Error("Blob URLs absent");url=URL.createObjectURL(new Blob([decode(samples[test.key])],{type:test.mime}));}
    else url="data:"+test.mime+";base64,"+samples[test.key];
    video.src=url;
    var play=video.play(),playResult=typeof play;
    if(play&&typeof play.then==="function")play.then(function(){events.push("play-resolved");},function(e){events.push("play-rejected:"+String(e.message||e));});
    var times=[];for(var i=0;i<6;i++){await pause(150);times.push(video.currentTime);}
    await out(test.name,{playReturn:playResult,events:events,times:times,readyState:video.readyState,networkState:video.networkState,width:video.videoWidth,height:video.videoHeight,duration:video.duration,error:video.error?{code:video.error.code,message:video.error.message}:null});
   }catch(e){await out(test.name+"_ERROR",String(e.message||e));}
   finally{try{video.pause();video.removeAttribute("src");if(typeof video.load==="function")video.load();}catch(_){}video.parentNode.removeChild(video);if(test.blob&&url)URL.revokeObjectURL(url);}
  }
  var canvas=document.createElement("canvas");canvas.width=64;canvas.height=64;box.appendChild(canvas);
  var ctx=canvas.getContext("2d"),methods={};
  for(var key of ["drawImage","getImageData","putImageData","createImageData","clearRect","fillRect","createPattern","createLinearGradient"])methods[key]=ctx?typeof ctx[key]:"no context";
  methods.toDataURL=typeof canvas.toDataURL;methods.toBlob=typeof canvas.toBlob;await out("CANVAS_METHODS",methods);
  if(ctx){ctx.fillStyle="#0000ff";ctx.fillRect(0,0,64,64);await out("CANVAS_DRAW_COMMAND",{accepted:true});}
  var sounds={};for(var key of Object.getOwnPropertyNames(window.Sound||{})){var d=Object.getOwnPropertyDescriptor(window.Sound,key);sounds[key]=d&&typeof d.value;}
  var proto=window.Sound&&Object.getPrototypeOf(window.Sound);if(proto){sounds.prototype=Object.getOwnPropertyNames(proto).filter(function(k){return k!=="constructor";});}
  await out("SOUND_API",sounds);
 }finally{if(box.parentNode)box.parentNode.removeChild(box);delete window.__moonlightStreamingSamples;}
 await out("END",true);
})();
