/* Finite installed Moonlight Settings check. Does not save changed preferences
 * or contact a streaming host. Leaves the resident back at Launcher. */
(function(g){
 'use strict';
 var core=g.__civhomebrewCore,shared=g.CivNanoVGSession&&g.CivNanoVGSession.current;
 if(!core||!shared||core.getState().mode==='app')throw Error('Leave Launcher open before this check');
 if(g.__moonlightSettingsAlignment&&!g.__moonlightSettingsAlignment.finished)throw Error('Settings check already active');
 var result={complete:false,finished:false,samples:[],error:null};g.__moonlightSettingsAlignment=result;
 function delay(ms){return new Promise(function(r){setTimeout(r,ms);});}
 async function wait(fn){var end=Date.now()+20000;while(Date.now()<end){if(shared.stats.errors.length)throw Error(shared.stats.errors.join('; '));if(fn())return;await delay(100);}throw Error('Settings check timed out');}
 function click(id){var n=document.getElementById(id);if(!n)throw Error('Missing control: '+id);var e=document.createEvent('Event');e.initEvent('click',true,true);n.dispatchEvent(e);}
 function sample(name){
  var ui=shared.active.ui,scale=1920/g.innerWidth,ids=['resolution','fps','bitrate','showStats','videoPacing','rumble','touchMode','codec'];
  var rows=ids.map(function(id){var n=document.getElementById('moonlight-settings-'+id),label=document.getElementById(n.id+'-label'),value=document.getElementById(n.id+'-value'),r=n.getBoundingClientRect(),s=getComputedStyle(n),c=ui.scene.commands.find(function(c){return c.kind==='text'&&c.id===label.id;}),v=ui.scene.commands.find(function(c){return c.kind==='text'&&c.id===value.id;});if(!c||!v||c.text!==label.textContent)throw Error('Missing or clipped Settings title: '+id);var expected=(r.left+parseFloat(s.paddingLeft)+parseFloat(s.borderLeftWidth))*scale;if(Math.abs(c.x-expected)>1.5)throw Error('Title alignment mismatch: '+id+' '+c.x+' / '+expected);return {id:id,x:c.x,expected:expected,text:c.text,value:v.text};});
  if(result.samples.length)rows.forEach(function(row,i){if(Math.abs(row.x-result.samples[0].rows[i].x)>1)throw Error('Title moved after a value/focus change: '+row.id);});
  result.samples.push({name:name,rows:rows});
 }
 setTimeout(async function(){var app=null;try{
  await core.showLauncher();await wait(function(){return core.getState().mode==='launcher'&&!core.getState().busy;});
  var accepted=await core.dispatch({protocol:1,op:'run',id:'moonlight-civswitch'});if(!accepted.response||!accepted.response.ok||!accepted.after)throw Error('Moonlight launch was not accepted');accepted.after();
  await wait(function(){return core.getState().mode==='app'&&g.__moonlightSimpleUI&&shared.active&&shared.active.root.id==='moonlight-simple-ui';});app=g.__moonlightSimpleUI;
  click('moonlight-open-settings');await delay(400);shared.active.ui.resetLayoutCache();shared.active.ui.update();await delay(200);
  result.viewport=[g.innerWidth,g.innerHeight];result.textRangeAvailable=typeof document.createRange==='function';sample('initial');
  for(var id of ['touchMode','resolution','showStats','codec']){click('moonlight-settings-'+id);await delay(400);shared.active.ui.update();await delay(200);sample(id);}
  result.errors=shared.stats.errors.slice();result.complete=true;
 }catch(e){result.error=String(e.stack||e).slice(0,1500);}finally{
  // Close directly: Settings' draft is not committed through its Back action.
  try{if(app)await app.close();await wait(function(){var s=core.getState();return s.mode==='launcher'&&!s.busy&&s.ftp;});}catch(e){result.complete=false;result.error=String(e.stack||e).slice(0,1500);}
  result.finished=true;
 }},500);
})(window);
