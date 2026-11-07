/* Real storage policy with a fault-injected filesystem. No console required. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/src/storage/pairing-store.js'), 'utf8'), sandbox);
const Store = sandbox.MoonlightStore, root = 'save:/moonlight-experiment';
const slots = [root + '/pairing-0.json', root + '/pairing-1.json'];
function state(generation, marker='same-client') { return JSON.stringify({version:1,generation,identity:{marker},hosts:{'192.168.1.4:47989':{certificatePem:'public-fixture'}}}); }
function memory(initial={}) {
 const files=new Map(Object.entries(initial)), events=[], controls={};
 const adapter={
  read(p) { assert(p.startsWith(root+'/'),'read escaped dedicated directory');events.push(['read',p]);return files.has(p) ? files.get(p) : null; },
  write(p,v) { assert(p.startsWith(root+'/'),'write escaped dedicated directory');events.push(['write',p]);if(controls.write)throw Error('write failed');files.set(p,controls.corrupt?'broken':v); },
  ensureDirectory(p) { assert.equal(p,root);events.push(['mkdir',p]); },
  removeDirectory(p) { assert.equal(p,root);events.push(['rmdir',p]);if(controls.clear)throw Error('delete failed');for(const f of files.keys())if(f.startsWith(root+'/'))files.delete(f); },
  commit() { events.push(['commit']);if(controls.commit)throw Error('commit failed'); }
 };
 return {files,events,controls,adapter,store:Store.create(adapter)};
}
// Reads create nothing; writes and cold reloads stay inside the directory.
let m=memory();assert.equal(m.store.loadIdentity(),null);assert.equal(m.events.filter(e=>e[0]==='write').length,0);
m.store.saveIdentity({marker:'new'});m.store.saveHost('host:47989',{certificatePem:'pin'});
assert.equal(Store.create(m.adapter).loadIdentity().marker,'new');
assert.equal(Store.create(m.adapter).loadHost('host:47989').certificatePem,'pin');
// Unreadable data must not silently replace the existing identity.
m=memory({[slots[0]]:'null'});assert.throws(()=>m.store.loadIdentity(),/unreadable/);assert.equal(m.files.get(slots[0]),'null');assert(!m.events.some(e=>e[0]==='write'));
// Failed writes/readback/commit retain the earlier slot and in-memory identity.
for(const failure of ['write','corrupt','commit']) {
 const previous=state(4);m=memory({[slots[0]]:previous});assert.equal(m.store.loadIdentity().marker,'same-client');
 m.controls[failure]=true;assert.throws(()=>m.store.saveIdentity({marker:'replacement'}));
 assert.equal(m.files.get(slots[0]),previous,failure);assert.equal(m.store.loadIdentity().marker,'same-client');
}
// An interrupted/corrupt newest slot falls back to the earlier valid slot.
m=memory({[slots[0]]:state(4),[slots[1]]:'broken'});assert.equal(m.store.loadIdentity().marker,'same-client');
m=memory({[slots[0]]:state(4,'older'),[slots[1]]:state(5,'newer')});assert.equal(m.store.loadIdentity().marker,'newer');
// Cleanup failures remain visible and retryable, without touching game files.
m.files.set('save:/saves/Single/game.Civ7Save','game');m.files.set(root+'/future-diagnostic.txt','experiment');
m.controls.clear=true;assert.throws(()=>m.store.clear(),/delete failed/);assert.equal(m.store.loadIdentity().marker,'newer');
m.controls.clear=false;m.store.clear();assert.equal(m.files.get('save:/saves/Single/game.Civ7Save'),'game');assert(![...m.files.keys()].some(p=>p.startsWith(root+'/')));
assert.equal(m.store.loadIdentity(),null);
console.log('Storage tests passed: directory boundary, readback/commit failures, recovery, preserved identity, scoped cleanup.');
