/* Poll the app's native adapter briefly; no controller setup changes or files. */
(async function(){
 var input=window.MoonlightControllerInput.createNative(),samples=0,changes=0,last='';
 if(!input)throw Error('Native controller unavailable');
 try{
  for(var i=0;i<120;i++){
   var value=input.poll();if(value){samples++;var text=JSON.stringify(value);if(text!==last){changes++;await log('MOONLIGHT_INPUT_SAMPLE: '+text);last=text;}}
   await new Promise(function(resolve){setTimeout(resolve,16);});
  }
 }finally{input.close();}
 if(!samples)throw Error('No connected standard controller samples');
 await log('MOONLIGHT_INPUT_RESULT: '+JSON.stringify({samples:samples,changes:changes}));
})();
