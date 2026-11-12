(async function(){
 await log('MOONLIGHT_UI_ANCESTORS_BEGIN');
 var old=document.getElementById('moonlight-stream-menu');if(old&&old.parentNode&&old.parentNode.parentNode&&old.parentNode.parentNode.parentNode===document.body)document.body.removeChild(old.parentNode.parentNode);
 var root=document.createElement('div');document.body.appendChild(root);
 var panel=document.createElement('div');Object.assign(panel.style,{width:innerWidth+'px',height:innerHeight+'px',display:'flex',position:'fixed',left:'0',top:'0',right:'0',bottom:'0',backgroundColor:'#000000',flexDirection:'column',alignItems:'center',justifyContent:'center',overflow:'hidden'});root.appendChild(panel);
 var menu=MoonlightStreamMenu.create({parent:panel,onClose:function(){}});menu.show('PC','trackpad',0,false,false);
 await new Promise(function(r){setTimeout(r,200);});
 var n=document.getElementById('moonlight-stream-menu');
 for(var i=0;n&&n.nodeType===1&&i<7;i++,n=n.parentNode){var r=n.getBoundingClientRect(),s=getComputedStyle(n);await log('MOONLIGHT_UI_ANCESTOR '+JSON.stringify({id:n.id,tag:n.tagName,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},style:{display:s.display,opacity:s.opacity,overflow:s.overflow,overflowX:s.overflowX,overflowY:s.overflowY,visibility:s.visibility}}));}
 var adapter=MoonlightNativeUiOverlay.create({roots:[document.getElementById('moonlight-stream-menu')],display:{setUiOverlay:function(){return true;},clearUiOverlay:function(){}},log:function(t){}});
 adapter.update();await log('MOONLIGHT_UI_ANCESTOR_SCENE '+JSON.stringify({active:adapter.scene().active,commands:adapter.scene().commands.length}));adapter.destroy();menu.destroy();root.parentNode.removeChild(root);
 await log('MOONLIGHT_UI_ANCESTORS_COMPLETE');
})();
