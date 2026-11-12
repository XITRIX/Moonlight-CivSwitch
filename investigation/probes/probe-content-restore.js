/* RETIRED: diagnostic only. Visible Gameface return failed; content-restore crashed. Do not rerun as a recovery action. */
/* Restore this application's content visibility after all owned VI/Vulkan
 * objects were destroyed. Uses the inspected bool-only SDK setter. */
(async function(){
 await log('MOONLIGHT_CONTENT_RESTORE_BEGIN');var c=MoonlightNativeContext.create();
 try{var p=c.sdkResolve('_ZN2nn2vi20SetContentVisibilityEb');if(BigInt(p)!==sdk_base+4154208n||c.read(p,32).toString('hex')!=='ffc300d1fd7b01a9f31300f9fd430091e8230091f303002ac2140894e00740f9')throw Error('Content visibility SDK changed');c.call(BigInt(p),1n);await log('MOONLIGHT_CONTENT_RESTORE_CALLED');}finally{c.close();}
 var n=document.createElement('div');Object.assign(n.style,{position:'fixed',left:'0',right:'0',top:'0',bottom:'0',backgroundColor:'#16334b',color:'white',fontSize:'38px',display:'flex',alignItems:'center',justifyContent:'center',zIndex:'99999'});n.textContent='MOONLIGHT INTERFACE RESTORED';document.body.appendChild(n);await new Promise(function(r){setTimeout(r,8000);});n.parentNode.removeChild(n);
 await log('MOONLIGHT_CONTENT_RESTORE_COMPLETE');
})();
