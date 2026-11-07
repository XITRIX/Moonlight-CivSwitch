/* Verify the app's settings adapter on Switch, retaining the user's mode. */
(async function(){
 var native=window.MoonlightNative.create(),previous=native.loadStreamSettings();
 var testMode={width:960,height:540,fps:60,bitrate:8000};
 try{
  native.saveStreamSettings(testMode);
  var loaded=window.MoonlightNative.create().loadStreamSettings();
  if(JSON.stringify(loaded)!==JSON.stringify(testMode))throw Error("Settings were not persisted");
  await log("MOONLIGHT_SETTINGS_PERSISTED: "+JSON.stringify(loaded));
 }finally{native.saveStreamSettings(previous);}
 await log("MOONLIGHT_SETTINGS_RESTORED: "+JSON.stringify(window.MoonlightNative.create().loadStreamSettings()));
})();
