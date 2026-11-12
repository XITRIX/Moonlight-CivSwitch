(async function(){
 await log("MOONLIGHT_AV1_SAMPLE_BEGIN");
 var c=window.MoonlightNativeContext.create(),av1=null,source=0;
 try{
  var bytes=window.MoonlightNativeBuffer.from("12000a0b0000004aabbfc3776be401328e0110008360020820880000f4b984adf33387d831d7453d19a64085fcb7a566efcaa54ee3174259f382766804b4df332b78fdbfdf059c123e1bea4e686109435fa058a1e8bb85c480cd26d304cfe7903daf37f0c785767aee28775da08a1dd7f0b90e5763b29cc8987732ca87b35d9aa5457d2fd22d7512fcc2c539cb3179708aa8ad694b4e77585d1a30484494c7f0","hex");
  av1=await window.MoonlightNativeVideo.openAv1(c,bytes,{width:1920,height:1080},function(v){log("MOONLIGHT_AV1_STAGE "+JSON.stringify(v));});
  source=c.allocate(bytes.length);c.write(source,bytes);
  av1.backend.submit({source:BigInt(source),length:bytes.length,pts:123456n});
  av1.backend.wait();var pts=av1.backend.output();
  var w=av1.coded.width,h=av1.coded.height,expected=[135, 170, 81],points=[];
  for(var point of [[0,0],[32,32],[w/2|0,h/2|0],[w-8,h-8]]){
   var y=Number(c.native.read32(BigInt(av1.destination+point[1]*w+point[0]))&255n);
   var uv=c.read(av1.destination+w*h+(point[1]>>1)*w+(point[0]&~1),2);
   if(Math.abs(y-expected[0])>3||Math.abs(uv[0]-expected[1])>3||Math.abs(uv[1]-expected[2])>3)throw Error("AV1 pixel sample differs: "+[y,uv[0],uv[1]]);
   points.push([y,uv[0],uv[1]]);
  }
  var display=window.MoonlightNativeDisplay.state();if(display&&display.ready)window.MoonlightNativeDisplay.publish(av1.destination,1920,1080,w,h);
  await log("MOONLIGHT_AV1_SAMPLE_RESULT "+JSON.stringify({coded:av1.coded,pts:pts,pixels:points,trace:av1.backend.report()}));
  await av1.close();av1=null;c.release(source);source=0;c.close();c=null;
  await log("MOONLIGHT_AV1_SAMPLE_COMPLETE");
 }catch(error){await log("MOONLIGHT_AV1_SAMPLE_ERROR "+String(error.stack||error).slice(0,1400));throw error;}
})();
