(async function(){
 var panel=document.createElement("div"),image=document.createElement("img"),label=document.createElement("div"),client,loading=false,displayed=0,lastImage="",imageStarted=0;
 Object.assign(panel.style,{position:"fixed",left:"0",top:"0",right:"0",bottom:"0",zIndex:"3",backgroundColor:"#0c1220",color:"white",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"});
 Object.assign(image.style,{width:"960px",height:"540px"});panel.appendChild(image);panel.appendChild(label);document.body.appendChild(panel);
 async function out(name,value){await log("MOONLIGHT_STREAM_"+name+": "+JSON.stringify(value));}
 image.onload=function(){loading=false;displayed++;};image.onerror=function(){loading=false;out("IMAGE_ERROR",true);};
 try{
  client=window.MoonlightStreamClient.create({host:"192.168.1.4:47989",app:{id:881448767,title:"Desktop"},durationMs:20000,
   mode:{width:320,height:180,fps:15,bitrate:1000},
   onStatus:function(text){label.textContent=text;out("STATUS",text);},
   onImage:function(url){if(url===lastImage)return;lastImage=url;loading=true;imageStarted=Date.now();image.src=url;},canPresent:function(){return !loading||Date.now()-imageStarted>1000;},
   log:function(text){log("MOONLIGHT_STREAM_CORE: "+text);},onStats:function(stats){out("STATS",stats);},onError:function(error){out("ERROR",String(error.stack||error));}
  });
  var result=await client.start();await out("LIVE_RESULT",{error:result&&result.error?result.error.message:null,stats:result&&result.stats,displayed:displayed});
  if(result&&result.error)throw result.error;
  if(!result||!result.stats||!result.stats.decoded||!displayed)throw Error("Live stream produced no displayed frames");
  await out("LIVE_PASSED",true);
 }catch(error){await out("ERROR",String(error.stack||error));}
 finally{image.onload=image.onerror=null;if(panel.parentNode)panel.parentNode.removeChild(panel);await out("LIVE_END",true);}
})();
