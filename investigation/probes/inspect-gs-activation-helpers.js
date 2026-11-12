/* Exact read-only descendants from captured layer/window activation calls. */
(async function(){
 await log('MOONLIGHT_GS_ACTIVATION_BEGIN');var c=MoonlightNativeContext.create();
 try{var info=await c.rpc.request({command:'module-probe',name:'nnCompat'});if(info.hash!=='cf649bbd')throw Error('Driver changed');var base=BigInt(info.base);
  for(var pair of [[2446624,768],[2447360,512],[3437024,176],[2483040,80],[2418784,64]])for(var at=0;at<pair[1];at+=256)await log('MOONLIGHT_GS_ACTIVATION_CODE '+JSON.stringify({root:pair[0],offset:pair[0]+at,hex:c.read(base+BigInt(pair[0]+at),Math.min(256,pair[1]-at)).toString('hex')}));
  var layer=base+0x5456558n,windowPtr=main_base+81563128n;
  var samples=[];for(var n=0;n<12;n++){samples.push({ms:Date.now(),window:c.read(windowPtr+0x2cn,12).toString('hex'),layer:c.read(layer+0x68n,32).toString('hex')});await new Promise(function(r){setTimeout(r,100);});}
  await log('MOONLIGHT_GS_ACTIVATION_SAMPLES '+JSON.stringify(samples));
  await log('MOONLIGHT_GS_ACTIVATION_COMPLETE');
 }finally{c.close();}
})();
