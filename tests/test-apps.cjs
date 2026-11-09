/* App-list parsing and authenticated request tests; no packages or network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto=require('node:crypto');
let onPause=()=>{};
const context={forge:{util:{encode64:value=>Buffer.from(value,'binary').toString('base64')},md:{sha256:{create:()=>{let text='';return {update(value){text+=value;return this;},digest:()=>({toHex:()=>crypto.createHash('sha256').update(text,'binary').digest('hex')})};}}}}};context.window=context;vm.createContext(context);
context.setTimeout=resolve=>{onPause();queueMicrotask(resolve);};
for(const name of ['sunshine-pairing.js','sunshine-apps.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,"../app/src/protocol",name),'utf8'),context);
const Apps=context.MoonlightApps;
const xml=apps=>'<root status_code="200">'+apps+'</root>';
const app=(id,title,extra='')=>'<App><AppTitle>'+title+'</AppTitle><ID>'+id+'</ID>'+extra+'</App>';
const fixture='<?xml version="1.0" encoding="utf-8"?>'+xml(app(881448767,'Desktop','<IsHdrSupported>1</IsHdrSupported><IDX>0</IDX>')+app(1093255277,'Steam Big Picture')+app(382300562,'Virtual Display'));
const parsed=Apps.parseList(fixture);
assert.deepEqual(Array.from(parsed,a=>a.title),['Desktop','Steam Big Picture','Virtual Display']);assert.equal(parsed[0].hdrSupported,true);
assert.equal(Apps.parseList(xml('')).length,0);assert.equal(Apps.parseList('<root status_code="200"/>').length,0);
assert.equal(Apps.parseList(xml(app(1,'A &amp; B &lt;X&gt; &#x1f3ae; &#169;')))[0].title,'A & B <X> 🎮 ©');
assert.equal(Apps.parseList(xml(app(1,'<![CDATA[A <B> & C]]>')))[0].title,'A <B> & C');
assert.equal(Apps.parseList(xml(app(1,'&amp;lt;script&amp;gt;')))[0].title,'&lt;script&gt;');
for(const bad of [
 fixture.slice(0,-7),'<root status_code="200"><App></root>',xml(app(0,'Bad')),xml(app('1x','Bad')),
 xml(app(1,'')),xml('<App><ID>1</ID></App>'),xml(app(1,'A')+app(1,'B')),
 xml('<App><ID>1</ID><ID>2</ID><AppTitle>X</AppTitle></App>'),
 xml(app(1,'<b>Nested</b>')),xml(app(1,'&unknown;')),xml(app(1,'broken & text')),
 xml(app(1,'&#0;')),xml(app(1,'&#xd800;')),xml(app(1,'&#x110000;')),
 '<!DOCTYPE root [<!ENTITY x SYSTEM "file:///private">]>'+xml(app(1,'&x;')),
 xml(app(1,'A'))+xml(app(2,'B')),xml('<Unknown/>'),'<root status_code="200" status_code="200"/>',
 '<root status_code="200">'+'<X>'.repeat(20)+'</X>'.repeat(20)+'</root>', 'x'.repeat(131073)
])assert.throws(()=>Apps.parseList(bad),undefined,bad.slice(0,70));
assert.throws(()=>Apps.parseList('<root status_code="401"/>'),/401/);
(async()=>{
 const identity={uniqueId:'0123456789abcdef'},host={uniqueId:identity.uniqueId,hostname:'Gaming PC',httpsPort:47984,certificatePem:'pinned-public-cert'};
 let request,calls=0;
 const options={loadIdentity:()=>identity,loadHost:key=>{assert.equal(key,'192.168.1.4:47989');return host;},
  randomBytes:n=>new Uint8Array(n).map((_,i)=>i),requestHttps:async value=>{calls++;if(value.path.startsWith('/serverinfo?'))return xml('<PairStatus>1</PairStatus><currentgame>0</currentgame><state>SUNSHINE_SERVER_FREE</state>');request=value;return fixture;}};
 let result=await Apps.create(options).listApps('192.168.1.4:47989');
 assert.equal(result.runningAppId,0);
 assert.equal(result.apps.length,3);assert.equal(result.hostname,'Gaming PC');assert.equal(request.identity,identity);
 assert.equal(request.pinnedCertificatePem,host.certificatePem);assert.equal(request.port,47984);assert.equal(request.host,'192.168.1.4');
 const url=new URL('https://host'+request.path);assert.equal(url.pathname,'/applist');assert.equal(url.searchParams.get('uniqueid'),identity.uniqueId);
 assert.match(url.searchParams.get('uuid'),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 await Apps.create(options).listApps('192.168.1.4:47989',48000);assert.equal(request.port,48000);
 for(const change of [{loadIdentity:()=>null},{loadHost:()=>null},{loadHost:()=>({...host,uniqueId:'other'})},{loadHost:()=>({...host,httpsPort:0})},{randomBytes:()=>new Uint8Array(0)}]){
  const before=calls;await assert.rejects(Apps.create({...options,...change}).listApps('192.168.1.4'));assert.equal(calls,before);
 }
 const before=calls;await assert.rejects(Apps.create({...options,signal:{aborted:true}}).listApps('192.168.1.4'),/canceled/);assert.equal(calls,before);
 const signal={aborted:false};await assert.rejects(Apps.create({...options,signal,requestHttps:async()=>{signal.aborted=true;return fixture;}}).listApps('192.168.1.4'),/canceled/);
 await assert.rejects(Apps.create({...options,requestHttps:async()=>{throw Error('TLS pin mismatch');}}).listApps('192.168.1.4'),/pin mismatch/);
 const requests=[];let current=1093255277,state='SUNSHINE_SERVER_BUSY',cancel='1',status='200',pendingStops=0,stopAfter=2;
 const management={...options,requestHttps:async value=>{requests.push(value);if(value.path.startsWith('/serverinfo?')){if(pendingStops>0&&--pendingStops===0)state='SUNSHINE_SERVER_FREE';return xml('<PairStatus>1</PairStatus><currentgame>'+current+'</currentgame><state>'+state+'</state>');}if(value.path.startsWith('/cancel?')){pendingStops=stopAfter;return '<root status_code="'+status+'"><cancel>'+cancel+'</cancel></root>';}return fixture;}};
 const api=Apps.create(management);
 assert.equal((await api.listApps('192.168.1.4',48000)).runningAppId,current);
 await api.terminateApp('192.168.1.4',48000,current);
 assert.equal(state,'SUNSHINE_SERVER_FREE','termination waits for delayed host cleanup');
 const quit=requests.find(r=>r.path.startsWith('/cancel?'));assert.equal(quit.port,48000);assert.equal(quit.identity,identity);assert.equal(quit.pinnedCertificatePem,host.certificatePem);
 assert.equal(new URL('https://host'+quit.path).searchParams.get('uniqueid'),identity.uniqueId);
 let beforeCancel=requests.filter(r=>r.path.startsWith('/cancel?')).length;
 state='SUNSHINE_SERVER_BUSY';
 await assert.rejects(api.terminateApp('192.168.1.4',48000,123),/changed/);
 assert.equal(requests.filter(r=>r.path.startsWith('/cancel?')).length,beforeCancel);
 state='SUNSHINE_SERVER_FREE';assert.equal((await api.listApps('192.168.1.4')).runningAppId,0);
 await api.terminateApp('192.168.1.4',48000,current);assert.equal(requests.filter(r=>r.path.startsWith('/cancel?')).length,beforeCancel);
 state='SUNSHINE_SERVER_BUSY';cancel='0';await assert.rejects(api.terminateApp('192.168.1.4',48000,current),/did not terminate/);
 cancel='1';status='403';await assert.rejects(api.terminateApp('192.168.1.4',48000,current),/403/);
 status='200';pendingStops=0;stopAfter=0;
 beforeCancel=requests.filter(r=>r.path.startsWith('/cancel?')).length;
 await assert.rejects(api.terminateApp('192.168.1.4',48000,current),/still running/);
 assert.equal(requests.filter(r=>r.path.startsWith('/cancel?')).length,beforeCancel+1,'a slow exit never resends the kill request');
 const stopSignal={aborted:false};onPause=()=>{stopSignal.aborted=true;};
 await assert.rejects(Apps.create({...management,signal:stopSignal}).terminateApp('192.168.1.4',48000,current),/canceled/);
 onPause=()=>{current=123;};
 await api.terminateApp('192.168.1.4',48000,current);
 assert.equal(current,123,'a newly running app is preserved');onPause=()=>{};
 current='invalid';await assert.rejects(api.listApps('192.168.1.4'),/Invalid Sunshine current/);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=','base64');
 const artworkOptions={...options,requestHttps:async value=>{request=value;return png.toString('binary');}};
 const cover=await Apps.create(artworkOptions).loadArtwork('192.168.1.4',881448767);
 assert.equal(cover.url,'data:image/png;base64,'+png.toString('base64'));assert.equal(cover.width,1);assert.equal(cover.height,1);assert.equal(cover.bytes,png.length);
 const assetURL=new URL('https://host'+request.path);assert.equal(assetURL.pathname,'/appasset');assert.equal(assetURL.searchParams.get('appid'),'881448767');
 assert.equal(assetURL.searchParams.get('AssetType'),'2');assert.equal(assetURL.searchParams.get('AssetIdx'),'0');assert.equal(assetURL.searchParams.get('uniqueid'),identity.uniqueId);
 assert.equal(request.responseType,'binary');assert.equal(request.maxResponseBytes,2097152);assert.equal(request.pinnedCertificatePem,host.certificatePem);assert.equal(request.identity,identity);
 for(const id of [0,-1,1.5,'1',0x100000000])await assert.rejects(Apps.create(artworkOptions).loadArtwork('192.168.1.4',id),/application ID/);
 const huge=Buffer.from(png);huge.writeUInt32BE(4097,16);
 const pixels=Buffer.from(png);pixels.writeUInt32BE(4096,16);pixels.writeUInt32BE(4096,20);
 for(const data of ['<root status_code="401"/>',png.subarray(0,32).toString('binary'),huge.toString('binary'),pixels.toString('binary'),'x'.repeat(2097153)])
  await assert.rejects(Apps.create({...artworkOptions,requestHttps:async()=>data}).loadArtwork('192.168.1.4',1),/PNG|dimensions/);
 await assert.rejects(Apps.create({...artworkOptions,loadIdentity:()=>null}).loadArtwork('192.168.1.4',1),/pair/i);
 const artSignal={aborted:false};await assert.rejects(Apps.create({...artworkOptions,signal:artSignal,requestHttps:async()=>{artSignal.aborted=true;return png.toString('binary');}}).loadArtwork('192.168.1.4',1),/canceled/);
 const files=new Map();let downloads=0;
 const disk={get:key=>files.has(key)?files.get(key):null,put:(key,value)=>files.set(key,value),remove:key=>files.delete(key)};
 const saved={...artworkOptions,artworkCache:disk,requestHttps:async()=>{downloads++;return png.toString('binary');}};
 await Apps.create(saved).loadArtwork('192.168.1.4',1);assert.equal(downloads,1);
 const cached=await Apps.create({...saved}).loadArtwork('192.168.1.4',1);assert.equal(cached.cacheHit,true);assert.equal(downloads,1);
 await Apps.create({...saved,loadHost:()=>({...host,certificatePem:'different-cert'})}).loadArtwork('192.168.1.4',1);assert.equal(downloads,2);
 await Apps.create(saved).loadArtwork('192.168.1.4',1,48000);assert.equal(downloads,3);
 await assert.rejects(Apps.create({...saved,loadIdentity:()=>null}).loadArtwork('192.168.1.4',1),/pair/i);assert.equal(downloads,3);
 cached.invalidateCache();await Apps.create(saved).loadArtwork('192.168.1.4',1);assert.equal(downloads,4);
 files.forEach((_,key)=>files.set(key,'broken'));await Apps.create(saved).loadArtwork('192.168.1.4',1);assert.equal(downloads,5);
 const errors=[];const fallback=await Apps.create({...saved,artworkCache:{get:()=>{throw Error('read failed');},remove:()=>{},put:()=>{throw Error('disk full');}},onArtworkCacheError:e=>errors.push(e.message)}).loadArtwork('192.168.1.4',1);
 assert.equal(fallback.bytes,png.length);assert.deepEqual(errors,['read failed','disk full']);assert.equal(downloads,6);
 console.log('Application tests passed: XML parsing, pinned HTTPS and saved identity, PNG artwork bytes/dimensions/limits, cancellation, TLS failure.');
})().catch(error=>{console.error(error);process.exitCode=1;});
