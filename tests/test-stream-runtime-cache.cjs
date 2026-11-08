const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('a newly uploaded core replaces the cached factory and incomplete uploads cannot reuse a stale core',async()=>{
 const scope={};scope.window=scope;scope.__moonlightStreamFactory=()=>{throw Error('old core');};scope.__moonlightStreamFactoryDigest='old';
 scope.MoonlightTelemetry={create:()=>({})};scope.MoonlightNative={create:()=>({})};scope.MoonlightStreamIO={create:()=>({close(){}})};
 vm.createContext(scope);vm.runInContext(fs.readFileSync('app/src/streaming/stream-client.js','utf8'),scope);
 const source='var MoonlightStreamCore=function(){throw Error("new core marker");};';
 scope.__moonlightStreamModuleUpload={sha256:'new',parts:[source],length:source.length,count:1};
 let result=await scope.MoonlightStreamClient.create({}).start();assert.match(result.error.message,/new core marker/);assert.equal(scope.__moonlightStreamFactoryDigest,'new');assert.equal(scope.__moonlightStreamModuleUpload,undefined);
 result=await scope.MoonlightStreamClient.create({}).start();assert.match(result.error.message,/new core marker/);
 scope.__moonlightStreamModuleUpload={sha256:'different',parts:[],length:source.length,count:1};
 result=await scope.MoonlightStreamClient.create({}).start();assert.match(result.error.message,/not loaded/);
});
