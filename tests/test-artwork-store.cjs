const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const sha=value=>crypto.createHash('sha256').update(value,'binary').digest('hex');
const context={forge:{md:{sha256:{create:()=>{let value='';return {update(v){value+=v;return this;},digest:()=>({toHex:()=>sha(value)})};}}}}};
context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('app/src/storage/artwork-store.js','utf8'),context);
function memory(){
 const files=new Map(),calls=[];let corrupt=false,fail=false;
 const adapter={
  read:(name,max)=>{assert(/^(?:index\.json|[a-f0-9]{56}\.png)$/.test(name));const value=files.get(name);if(value!==undefined&&value.length>max)throw Error('oversized file');return value===undefined?null:value;},
  write:(name,value)=>{calls.push(['write',name]);if(fail)throw Error('disk full');files.set(name,corrupt&&name.endsWith('.png')?'broken':value);},
  remove:name=>{calls.push(['remove',name]);files.delete(name);},ensureDirectory:()=>{},commit:()=>{},clear:()=>{calls.push(['clear']);files.clear();}
 };
 return {files,calls,adapter,setCorrupt:v=>corrupt=v,setFail:v=>fail=v};
}
const key=n=>sha('host:'+n),png=n=>'\x89PNG\r\n\x1a\n'+String.fromCharCode(n,128,255,0).repeat(10);
test('PNG bytes survive a cold cache instance without touching unrelated files',()=>{
 const m=memory(),cache=context.MoonlightArtworkStore.create(m.adapter);assert.equal(cache.get(key(1)),null);
 cache.put(key(1),png(1));assert.equal(context.MoonlightArtworkStore.create(m.adapter).get(key(1)),png(1));
 assert(m.files.has('index.json'));assert.equal(m.files.size,2);assert(m.calls.every(c=>c[0]==='clear'||c[1]==='index.json'||/^[a-f0-9]{56}\.png$/.test(c[1])));
 assert.throws(()=>cache.get('../pairing-0.json'),/key/);assert.throws(()=>cache.put('save:/bad',png(1)),/key/);
});
test('checksum failures and missing PNGs become cache misses and remove stale entries',()=>{
 const m=memory(),cache=context.MoonlightArtworkStore.create(m.adapter);cache.put(key(1),png(1));m.files.set(key(1).slice(0,56)+'.png',png(2));
 assert.equal(context.MoonlightArtworkStore.create(m.adapter).get(key(1)),null);assert(!m.files.has(key(1).slice(0,56)+'.png'));
 cache.put(key(2),png(2));m.files.delete(key(2).slice(0,56)+'.png');assert.equal(context.MoonlightArtworkStore.create(m.adapter).get(key(2)),null);
});
test('quota evicts least recently used files across reloads',()=>{
 const m=memory(),cache=context.MoonlightArtworkStore.create(m.adapter,{limitBytes:100});cache.put(key(1),png(1));cache.put(key(2),png(2));
 const index=JSON.parse(m.files.get('index.json'));index.entries[0].used=1;index.entries[1].used=2;m.files.set('index.json',JSON.stringify(index));
 const cold=context.MoonlightArtworkStore.create(m.adapter,{limitBytes:100});assert.equal(cold.get(key(1)),png(1));cold.put(key(3),png(3));
 assert(!m.files.has(key(2).slice(0,56)+'.png'));assert(m.files.has(key(1).slice(0,56)+'.png'));assert(m.files.has(key(3).slice(0,56)+'.png'));
});
test('bad or oversized indexes reset only disposable cover data',()=>{
 for(const value of ['broken','x'.repeat(65537),JSON.stringify({version:1,entries:[{key:'../outside'}]})]){
  const m=memory();m.files.set('index.json',value);m.files.set(key(1).slice(0,56)+'.png',png(1));
  assert.equal(context.MoonlightArtworkStore.create(m.adapter).get(key(1)),null);assert.equal(m.files.size,0);
 }
});
test('failed and short writes never produce a usable cached PNG',()=>{
 const m=memory(),cache=context.MoonlightArtworkStore.create(m.adapter);cache.get(key(1));m.setFail(true);assert.throws(()=>cache.put(key(1),png(1)),/full/);
 m.setFail(false);m.setCorrupt(true);assert.throws(()=>cache.put(key(1),png(1)),/verification/);
 assert.equal(context.MoonlightArtworkStore.create(m.adapter).get(key(1)),null);assert.equal(m.files.size,0);
});
