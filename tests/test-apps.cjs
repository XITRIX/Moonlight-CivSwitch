/* App-list parsing and authenticated request tests; no packages or network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context={};context.window=context;vm.createContext(context);
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
  randomBytes:n=>new Uint8Array(n).map((_,i)=>i),requestHttps:async value=>{request=value;calls++;return fixture;}};
 let result=await Apps.create(options).listApps('192.168.1.4:47989');
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
 console.log('Application-list tests passed: host response, XML/entities/CDATA, malformed/oversized responses, pinned HTTPS, saved identity, cancellation, TLS failure.');
})().catch(error=>{console.error(error);process.exitCode=1;});
