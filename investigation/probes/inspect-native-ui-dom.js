(async function(){
 await log('MOONLIGHT_UI_DOM_BEGIN');
 var parent=document.createElement('div');Object.assign(parent.style,{position:'fixed',left:'0',top:'0',width:'1280px',height:'720px',display:'block'});document.body.appendChild(parent);
 var menu=MoonlightStreamMenu.create({parent:parent,onClose:function(){}});menu.show('PC','trackpad',0,false,false);
 await new Promise(function(r){setTimeout(r,200);});
 for(var id of ['moonlight-stream-menu','moonlight-stream-menu-more','moonlight-stream-menu-title']){
  var n=document.getElementById(id),r=n.getBoundingClientRect(),s=null;try{s=getComputedStyle(n);}catch(e){}
  var rect={};for(var key of ['x','y','left','top','right','bottom','width','height'])rect[key]=r[key]===undefined?'undefined':r[key];
  await log('MOONLIGHT_UI_DOM_NODE '+JSON.stringify({id:id,nodeType:n.nodeType===undefined?'undefined':n.nodeType,tagName:n.tagName,rect:rect,children:n.children?n.children.length:null,childNodes:n.childNodes?n.childNodes.length:null,display:n.style.display,computed:s?{display:s.display,visibility:s.visibility,color:s.color,fontSize:s.fontSize}:null,text:String(n.textContent).slice(0,100)}));
 }
 var fake={setUiOverlay:function(f){return true;},clearUiOverlay:function(){}},adapter=MoonlightNativeUiOverlay.create({roots:[document.getElementById('moonlight-stream-menu')],display:fake,log:function(s){}});
 adapter.update();await log('MOONLIGHT_UI_DOM_SCENE '+JSON.stringify(adapter.scene()).slice(0,1200));adapter.destroy();menu.destroy();parent.parentNode.removeChild(parent);
 await log('MOONLIGHT_UI_DOM_COMPLETE');
})();
