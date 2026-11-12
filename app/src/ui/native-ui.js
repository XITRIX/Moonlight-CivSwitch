/* Moonlight supplies preview/log policy; the SDK owns view/session binding. */
(function(g){"use strict";
 async function mount(root,options){
  options=options||{};
  var native=!!(g.MoonlightNative&&g.MoonlightNative.available&&typeof call_rop==='function');
  var preview=!native&&g.location&&/(?:[?&])nativeUi=1(?:&|$)/.test(g.location.search);
  if(!native&&!preview)return null;
  if(!g.CivHomebrewSDK)throw Error('Update the native Launcher and restart Civ VII');
  var view=await g.CivHomebrewSDK.app.mount(root,{native:native,browser:preview,log:options.log});
  if(view&&view.blocked)return view;
  if(native&&(!g.CivSDKKeyboard||g.CivSDKKeyboard.api!==1)){await view.close();throw Error('Update Launcher and restart Civ VII to enable the native keyboard');}
  if(native&&(!view.session.renderer.bindSurface||!view.session.renderer.owner)){await view.close();throw Error('Update the native Launcher to enable app streaming, then restart Civ VII');}
  return view;
 }
 function keyboard(root,view,onError){
  if(!view||!view.session||!view.session.renderer.owner)return null;
  if(!g.CivSDKKeyboard)throw Error('Update Launcher and restart Civ VII to enable the native keyboard');
  return g.CivSDKKeyboard.open({root:root,view:view,session:view.session,error:onError});
 }
 g.MoonlightNativeUi={mount:mount,keyboard:keyboard};
})(typeof window!=='undefined'?window:globalThis);
