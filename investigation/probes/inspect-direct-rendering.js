/* Read-only API inventory; no guessed native calls or game-owned texture writes. */
(async function(){
 async function out(name,value){await log("MOONLIGHT_RENDER_"+name+": "+JSON.stringify(value));}
 function members(object){var results=[],seen={};for(var level=0;object&&level<3;level++,object=Object.getPrototypeOf(object))for(var name of Object.getOwnPropertyNames(object)){if(seen[name])continue;seen[name]=true;var d=Object.getOwnPropertyDescriptor(object,name);results.push({name:name,type:d.get?"getter":typeof d.value,level:level});}return results.slice(0,1000);}
 await out("GLOBALS",Object.getOwnPropertyNames(window).filter(function(n){return /image|canvas|texture|render|movie|video|cohtml|coherent|^UI$|^WorldUI$|^engine$/i.test(n);}).map(function(n){return {name:n,type:typeof window[n]};}));
 for(var name of ["UI","WorldUI","engine","Coherent","cohtml"]){if(window[name])await out(name,members(window[name]));}
 var canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");await out("CANVAS",members(canvas));if(ctx)await out("CONTEXT_2D",members(ctx));
 if(ctx&&typeof ctx.createImageData==="function"){try{var data=ctx.createImageData(2,2);await out("IMAGE_DATA",{members:members(data),type:typeof data.data,length:data.data&&data.data.length});}catch(e){await out("IMAGE_DATA_ERROR",String(e));}}
 await out("DOCUMENT_TEXTURE_NAMES",Object.getOwnPropertyNames(document).filter(function(n){return /image|canvas|texture|render/i.test(n);}));
 await out("END",true);
})();
