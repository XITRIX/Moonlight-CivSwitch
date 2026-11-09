const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({console,Uint8Array,DataView,Number,window:{}});
for(const name of ['protocol/sunshine-pairing.js','protocol/sunshine-apps.js','streaming/sunshine-session.js'])vm.runInContext(fs.readFileSync('app/src/'+name,'utf8'),context);
const Protocol=context.window.MoonlightSessionProtocol;
const mode={width:320,height:180,fps:15,bitrate:1000};
const xml=(fields,status=200,message='')=>'<root status_code="'+status+'" status_message="'+message+'">'+Object.entries(fields).map(([k,v])=>'<'+k+'>'+v+'</'+k+'>').join('')+'</root>';
async function main(){
 let requests=[],current=0,state='SUNSHINE_SERVER_FREE',response=null,signal={aborted:false};
 const identity={uniqueId:'test'},host={uniqueId:'test',certificatePem:'PINNED',httpsPort:47984};
 const options={signal,loadIdentity:()=>identity,loadHost:()=>host,randomBytes:n=>Uint8Array.from({length:n},(_,i)=>i+128),requestHttps:async r=>{
  requests.push(r);if(r.path.startsWith('/serverinfo?'))return xml({PairStatus:1,appversion:'7.1.431.-1',currentgame:current,state,ServerCodecModeSupport:2032385});
  return response||xml({[current?'resume':'gamesession']:1,sessionUrl0:'rtspenc://192.168.1.4:48010'});
 }};
 const api=Protocol.create(options),session=await api.launch('192.168.1.4:47989',123,mode,'&corever=1');
 assert.equal(session.url,'rtspenc://192.168.1.4:48010');assert.equal(session.keyId,0x80818283);assert.equal(session.resumed,false);
 let request=requests[1],query=new URL('https://host'+request.path).searchParams;
 assert(request.path.startsWith('/launch?'));assert.equal(query.get('corever'),'1');assert.equal(query.get('rikey'),'808182838485868788898a8b8c8d8e8f');assert.equal(query.get('rikeyid'),String(0x80818283));assert.equal(query.get('surroundAudioInfo'),'196610');assert.equal(query.get('mode'),'320x180x15');
 assert.equal(request.pinnedCertificatePem,'PINNED');assert.equal(request.identity,identity);assert.equal(request.signal,signal);
 requests=[];await api.launch('192.168.1.4',123,{width:1280,height:720,fps:30,bitrate:5000},'');
 assert.equal(new URL('https://host'+requests[1].path).searchParams.get('mode'),'1280x720x30');
 requests=[];await api.launch('192.168.1.4',123,{width:1920,height:1080,fps:60,bitrate:80000},'');
 assert.equal(new URL('https://host'+requests[1].path).searchParams.get('mode'),'1920x1080x60');
 current=123;state='SUNSHINE_SERVER_BUSY';requests=[];assert.equal((await api.launch('192.168.1.4',123,mode,'&corever=1')).resumed,true);assert(requests[1].path.startsWith('/resume?'));
 // A pinned Sunshine host can return its LAN URL through a forwarded WAN address.
 // Keep the original resource/encryption/port, with transport bound separately.
 for(const scheme of ['rtsp','rtspenc']){
  for(const resuming of [false,true]){
   current=resuming?123:0;state=resuming?'SUNSHINE_SERVER_BUSY':'SUNSHINE_SERVER_FREE';requests=[];
   const url=scheme+'://192.168.1.4:49010/session';
   response=xml({[resuming?'resume':'gamesession']:1,sessionUrl0:url});
   const wan=await api.launch('203.0.113.10:47989',123,mode,'');
   assert.equal(wan.host,'203.0.113.10');assert.equal(wan.url,url);assert.equal(wan.resumed,resuming);
   assert(requests.every(r=>r.host==='203.0.113.10'&&r.pinnedCertificatePem==='PINNED'&&r.identity===identity));
   assert(requests[1].path.startsWith(resuming?'/resume?':'/launch?'));
  }
 }
 current=123;state='SUNSHINE_SERVER_BUSY';
 await assert.rejects(api.launch('192.168.1.4',124,mode,''),/Another application/);
 current=0;state='SUNSHINE_SERVER_FREE';response=xml({},403,'Permission denied');await assert.rejects(api.launch('192.168.1.4',123,mode,''),/403: Permission denied/);
 response=xml({gamesession:0,sessionUrl0:'rtsp://192.168.1.4:48010'});await assert.rejects(api.launch('192.168.1.4',123,mode,''),/did not start/);
 for(const url of ['rtsp://192.168.1.4:0','https://192.168.1.4:48010','rtsp://192.168.1.4:99999',
  'rtsp://user@192.168.1.4:48010','rtsp://192.168.1.4:48010/\r\nInjected: value','rtspenc://192.168.1.4:48010/\0hidden',
  'rtsp://192.168.1.4:48010/'+'x'.repeat(1000)]){
  response=xml({gamesession:1,sessionUrl0:url});await assert.rejects(api.launch('192.168.1.4',123,mode,''),/RTSP session URL/);
 }
 signal.aborted=true;await assert.rejects(api.launch('192.168.1.4',123,mode,''),/canceled/);signal.aborted=false;
 host.uniqueId='other';await assert.rejects(api.launch('192.168.1.4',123,mode,''),/Pair with/);host.uniqueId='test';
 await assert.rejects(api.launch('192.168.1.4',123,{...mode,width:1921},''),/stream mode/);
 await assert.rejects(api.launch('192.168.1.4',123,{...mode,height:1081},''),/stream mode/);
 await assert.rejects(api.launch('192.168.1.4',123,{...mode,bitrate:80001},''),/stream mode/);
 console.log('Streaming negotiation tests passed: launch/resume, pinned TLS, session keys, permissions, WAN transport with LAN RTSP URLs, malformed URLs, cancellation.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
