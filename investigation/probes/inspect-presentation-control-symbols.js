(async function(){
 await log('MOONLIGHT_CONTROL_SYMBOLS_BEGIN');var c=MoonlightNativeContext.create();
 try{
  for(var group of [{name:'gs',pattern:/2gs.*(?:Window|Display|Active|Mode|Visib|Switch|Renderer)/},{name:'vi2',pattern:/3vi2/},{name:'driver',pattern:/^(?:nvn|nvpresent|nvpresent|nvp|Nv).*(?:Window|Display|Present|Mode|Switch|Active)|(?:Legacy|legacy|Renderer).*(?:Window|Present|Mode|Switch)/},{name:'settings',pattern:/LayerCreationSettings|vi.*InternalLayer.*(?:Set|Initialize|Finalize|Open|Close)/}]){
   var list=c.findSymbols(group.pattern);await log('MOONLIGHT_CONTROL_GROUP '+JSON.stringify({name:group.name,count:list.length}));
   for(var f of list)await log('MOONLIGHT_CONTROL_SYMBOL '+JSON.stringify({group:group.name,name:f.name,offset:f.offset,size:f.size}));
  }
  await log('MOONLIGHT_CONTROL_SYMBOLS_COMPLETE');
 }finally{c.close();}
})();
