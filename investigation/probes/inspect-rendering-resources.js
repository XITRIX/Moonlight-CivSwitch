(async function(){
 function read(path){return new Promise(function(resolve){var r=new XMLHttpRequest(),timer=setTimeout(function(){try{r.abort();}catch(_){}resolve({path:path,error:"timeout"});},2000);r.onload=function(){clearTimeout(timer);resolve({path:path,status:r.status,length:r.responseText.length,text:r.responseText.split(/\r?\n/).map(function(line,i){return {line:i+1,text:line};}).filter(function(x){return /live:|texture|portrait|image|render|camera|import|engine\./i.test(x.text);}).slice(0,180)});};r.onerror=function(){clearTimeout(timer);resolve({path:path,error:"unavailable"});};try{r.open("GET",path,true);r.send();}catch(e){clearTimeout(timer);resolve({path:path,error:String(e)});}});}
 for(var path of ["/base-standard/ui/mini-map/panel-mini-map.css","/base-standard/ui/mini-map/model-mini-map.js"]){await log("MOONLIGHT_RENDER_RESOURCE: "+JSON.stringify(await read(path)));}
 await log("MOONLIGHT_RENDER_RESOURCE_END: true");
})();
