/* Memory-only cover queue: paging, failure, LRU eviction and cancellation. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const context={};context.window=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/src/ui/game-artwork.js'),'utf8'),context);
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const calls=[],ready=[],errors=[];let finish,signal;
 const loader=context.MoonlightArtwork.create({load:(app,s)=>{calls.push(app.id);signal=s;return new Promise(r=>finish=r);},onReady:id=>ready.push(id),onError:id=>errors.push(id)});
 loader.setVisible([{id:1},{id:2}]);assert.deepEqual(calls,[1]);
 loader.setVisible([{id:3}]);finish({url:'data:first'});await tick();assert.deepEqual(calls,[1,3]);assert.deepEqual(ready,[1]);
 const close=loader.close();assert(signal.aborted);let done=false;close.then(()=>done=true);await tick();assert(!done);
 finish({url:'data:late'});await close;assert.deepEqual(ready,[1]);assert.equal(loader.get(1),undefined);
 const visited=[];const cache=context.MoonlightArtwork.create({load:async app=>{visited.push(app.id);if(app.id===9)throw Error('missing');return {url:String(app.id).repeat(1600000)};},onReady:()=>{},onError:id=>errors.push(id)});
 for(const id of [1,2]){cache.setVisible([{id}]);await tick();}
 assert(cache.get(1));cache.setVisible([{id:3}]);await tick();assert.equal(cache.get(2),undefined);assert(cache.get(1));assert(cache.get(3));
 cache.setVisible([{id:9}]);await tick();cache.setVisible([{id:9}]);await tick();assert.equal(visited.filter(id=>id===9).length,1);
 cache.reject(3,Error('decode'));assert.equal(cache.get(3),undefined);cache.setVisible([{id:3}]);await tick();assert.equal(visited.filter(id=>id===3).length,1);
 cache.pause();assert(cache.get(1));cache.setLoader(async app=>{visited.push(app.id);return {url:'resumed'};});cache.setVisible([{id:1},{id:3}]);await tick();assert(cache.get(3));assert.equal(visited.filter(id=>id===1).length,1);
 await cache.close();console.log('Artwork queue tests passed: serial visible-page downloads, off-page queue replacement, bounded LRU, download/decode failure, cancellation and draining.');
})().catch(error=>{console.error(error);process.exitCode=1;});
