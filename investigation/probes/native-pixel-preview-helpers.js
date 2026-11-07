/* Tiny diagnostic PNG encoder; deliberately not a streaming renderer. */
(function(){
 function crc(bytes){var c=0xffffffff;for(var b of bytes){c^=b;for(var j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
 function be(value){return[value>>>24,(value>>>16)&255,(value>>>8)&255,value&255];}
 function chunk(name,bytes){var body=Array.from(name,function(c){return c.charCodeAt(0);}).concat(bytes);return be(bytes.length).concat(body,be(crc(body)));}
 function b64(bytes){var alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",s="";for(var i=0;i<bytes.length;i+=3){var v=(bytes[i]<<16)|((bytes[i+1]||0)<<8)|(bytes[i+2]||0);s+=alphabet[(v>>>18)&63]+alphabet[(v>>>12)&63]+(i+1<bytes.length?alphabet[(v>>>6)&63]:"=")+(i+2<bytes.length?alphabet[v&63]:"=");}return s;}
 function clamp(value){return Math.max(0,Math.min(255,value));}
 window.MoonlightProbePreview=async function(nv12,width,height,yStride,uvStride,uvOffset){
  var scan=[];for(var y=0;y<height;y++){scan.push(0);for(var x=0;x<width;x++){var Y=nv12[y*yStride+x]-16,uv=uvOffset+(y>>1)*uvStride+(x&~1),U=nv12[uv]-128,V=nv12[uv+1]-128;scan.push(clamp((298*Y+409*V+128)>>8),clamp((298*Y-100*U-208*V+128)>>8),clamp((298*Y+516*U+128)>>8));}}
  if(scan.length>65535)throw Error("Preview exceeds single PNG block bound");
  var a=1,b=0;for(var v of scan){a=(a+v)%65521;b=(b+a)%65521;}
  var n=scan.length,z=[0x78,1,1,n&255,n>>>8,(~n)&255,((~n)>>>8)&255].concat(scan,be(((b<<16)|a)>>>0));
  var png=[137,80,78,71,13,10,26,10].concat(chunk("IHDR",be(width).concat(be(height),[8,2,0,0,0])),chunk("IDAT",z),chunk("IEND",[]));
  var panel=document.createElement("div"),label=document.createElement("div"),img=document.createElement("img");
  panel.style.cssText="position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483647;background:#111827;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-size:28px;";
  label.textContent="Native H.264 decoded frame — blue test sample";img.style.cssText="width:320px;height:320px;margin-top:24px;";panel.appendChild(label);panel.appendChild(img);document.body.appendChild(panel);
  var timer;
  try{
   var result=await new Promise(function(resolve,reject){timer=setTimeout(function(){reject(Error("Preview image timed out"));},2000);img.onload=function(){resolve({loaded:true,width:img.naturalWidth,height:img.naturalHeight,pngBytes:png.length});};img.onerror=function(){reject(Error("Preview PNG failed"));};img.src="data:image/png;base64,"+b64(png);});
   await new Promise(function(resolve){setTimeout(resolve,1500);});return result;
  }finally{clearTimeout(timer);panel.remove();}
 };
})();
