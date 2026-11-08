const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('investigation/probes/inspect-streaming-movie-discovery.js','utf8');
const shortCtor='_ZN5movie7DecoderC1ENS_11DecoderTypeENS_19DecoderOutputFormatE';
const longCtor='_ZN5movie7DecoderC1ENS_11DecoderTypeENS_19DecoderOutputFormatENS_11DecoderModeEi';

async function probe({large=false,inSdk=false,late=false,cycle=false}={}){
 const memory=new Map(),owned=new Set(),logs=[],regions=[];
 const main=0x1000n,sdk=0x100000n,movie=0x800000n,limit=0x8000000000n;
 let allocation=0x20000000n;
 function write(p,value,n=8){for(let i=0;i<n;i++)memory.set(p+BigInt(i),Number((BigInt(value)>>BigInt(i*8))&255n));}
 function read(p,n){
  assert(regions.some(r=>p>=r.base&&p+BigInt(n)<=r.base+r.size&&(r.permissions&1))||[...owned].some(a=>p>=a&&p+BigInt(n)<=a+64n),'only read mapped memory');
  let value=0n;for(let i=n-1;i>=0;i--)value=(value<<8n)|BigInt(memory.get(p+BigInt(i))||0);return value;
 }
 regions.push({base:main,size:0x10000n,permissions:5},{base:sdk,size:0x300000n,permissions:5});
 if(late)for(let i=0;i<520;i++)regions.push({base:0x400000n+BigInt(i*4096),size:4096n,permissions:1});
 regions.push({base:movie,size:0x400000n,permissions:5});
 write(sdk+0x168b10n,0xd40000c1n,4);
 const base=inSdk?sdk:movie,count=large?10001:3,stringBytes=large?1048577:1024;
 const mod=base+0x100n,dynamic=base+0x200n,hash=base+0x400n,symbols=base+0x20000n,strings=base+0x80000n;
 write(base+4n,0x100n,4);write(mod,0x30444f4dn,4);write(mod+4n,0x100n,4);
 for(const [i,tag,value] of [[0,4,hash],[1,5,strings],[2,6,symbols],[3,10,stringBytes],[4,11,24]]){write(dynamic+BigInt(i*16),tag);write(dynamic+BigInt(i*16+8),value);}
 write(hash,1,4);write(hash+4n,count,4);write(hash+8n,1,4);
 write(hash+12n+4n,cycle?1:2,4);
 let offset=1;
 for(const [i,name] of [shortCtor,longCtor].entries()){
  write(symbols+BigInt((i+1)*24),offset,4);write(symbols+BigInt((i+1)*24+8),0x1000+i*16);
  for(let j=0;j<name.length;j++)write(strings+BigInt(offset+j),name.charCodeAt(j),1);
  offset+=name.length+1;
 }
 const context={main_base:main,sdk_base:sdk,setTimeout,log:async line=>logs.push(line),
  malloc:n=>{const p=allocation;allocation+=BigInt(n+64);owned.add(p);return p;},free:p=>assert(owned.delete(p)),
  read8:p=>read(p,1),read32:p=>read(p,4),read64:p=>read(p,8),
  call_rop:(fn,info,page,address)=>{
   assert.equal(fn,sdk+0x168b0cn,'probe must only call memory query');
   const sorted=regions.slice().sort((a,b)=>a.base<b.base?-1:1);
   let q=sorted.find(r=>address>=r.base&&address<r.base+r.size);
   if(!q){const next=sorted.find(r=>r.base>address);q={base:address,size:(next?next.base:limit)-address,permissions:0};}
   write(info,q.base);write(info+8n,q.size);write(info+24n,q.permissions,4);return 0n;
  }};
 await vm.runInNewContext(source,context);
 assert.equal(owned.size,0,'all scratch allocations freed');
 return logs.map(line=>({key:line.split(': ')[0],value:JSON.parse(line.slice(line.indexOf(': ')+2))}));
}

test('read-only discovery reports a decoder table excluded by app size limits',async()=>{
 const logs=await probe({large:true});
 const module=logs.find(l=>l.key.endsWith('_MODULE')&&l.value.exports?.[longCtor]).value;
 assert.equal(module.symbols,10001);assert.equal(module.appSearchEligible,false);assert.equal(module.exports[longCtor].executable,true);
});
test('discovery inspects SDK exports and mappings beyond the app region limit',async()=>{
 for(const options of [{inSdk:true},{late:true}]){
  const logs=await probe(options),module=logs.find(l=>l.key.endsWith('_MODULE')&&l.value.exports?.[longCtor]).value;
  assert.equal(module.role,options.inSdk?'sdk':'other');
  if(options.late)assert.equal(logs.find(l=>l.key.endsWith('_SCAN')).value.exceededAppRegionLimit,true);
 }
});
test('discovery rejects cyclic symbol chains without invoking a decoder',async()=>{
 const logs=await probe({cycle:true});
 assert(logs.some(l=>l.value.rejected==='Invalid or cyclic symbol chain'));
 assert(logs.some(l=>l.key.endsWith('_END')));
});
