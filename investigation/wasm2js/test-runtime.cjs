const assert=require('node:assert/strict');
const {inflateSync}=require('node:zlib');
const {randomFillSync}=require('node:crypto');
const vm=require('node:vm'),fs=require('node:fs');
const preview={Uint8Array,Uint32Array,Int32Array,Number,DataView,btoa:s=>Buffer.from(s,'binary').toString('base64')};preview.window=preview;vm.createContext(preview);vm.runInContext(fs.readFileSync('app/src/streaming/png-preview.js','utf8'),preview);
const make=require('./dist/moonlight-stream.js');
(async()=>{
 const core=await make({moonlightPlatform:{randomFill:randomFillSync}});
 assert.equal(core._ml_session_metrics(),0,'metrics are unavailable outside an active connection');
 const yieldsBefore=core._ml_runtime_budget_yields();
 assert.equal(core._ml_budget_test_start(),0);core._ml_runtime_pump(1);
 assert.equal(core._ml_budget_test_result(),0,'checkpoint returns to JS before long-running work finishes');
 assert(core._ml_runtime_budget_yields()>yieldsBefore);
 const budgetDeadline=Date.now()+2000;
 while(core._ml_runtime_tasks()&&Date.now()<budgetDeadline){core._ml_runtime_pump(1);await new Promise(r=>setTimeout(r,2));}
 assert.equal(core._ml_budget_test_result(),1);assert.equal(core._ml_runtime_tasks(),0);
 assert.equal(core._ml_input_priority_test_start(),0);core._ml_runtime_pump(2);
 assert.equal(core._ml_input_priority_test_result(),12,'dispatch and InputSend run before a busy media task exhausts the budget');
 const priorityDeadline=Date.now()+2000;
 while(core._ml_runtime_tasks()&&Date.now()<priorityDeadline){core._ml_runtime_pump(2);await new Promise(r=>setTimeout(r,2));}
 assert.equal(core._ml_input_priority_test_result(),123);assert.equal(core._ml_runtime_tasks(),0,'priority tasks join and release normally');
 assert.equal(core._ml_scheduler_test_start(),0);
 const end=Date.now()+2000;
 while(core._ml_runtime_tasks()&&Date.now()<end){core._ml_runtime_pump(5);await new Promise(r=>setTimeout(r,2));}
 assert.equal(core._ml_scheduler_test_result(),42);assert.equal(core._ml_runtime_tasks(),0);
 assert.equal(core._ml_interrupt_test_start(),0);
 const interruptDeadline=Date.now()+1000;
 while(core._ml_runtime_tasks()&&Date.now()<interruptDeadline){core._ml_runtime_pump(5);await new Promise(r=>setTimeout(r,2));}
 assert.equal(core._ml_interrupt_test_result(),42,'interrupt wakes a 60-second sleeper immediately');assert.equal(core._ml_runtime_tasks(),0);
 // Padded NV12 layout and BT.601 limited-range blue, matching the console fixture.
 const width=64,height=64,stride=80,offset=stride*height,length=offset+stride*height/2;
 const p=core._malloc(length);core.HEAPU8.fill(0,p,p+length);
 for(let y=0;y<height;y++)core.HEAPU8.fill(41,p+y*stride,p+y*stride+width);
 for(let y=0;y<height/2;y++)for(let x=0;x<width;x+=2){core.HEAPU8[p+offset+y*stride+x]=240;core.HEAPU8[p+offset+y*stride+x+1]=110;}
 const encoded=core._ml_png_nv12(p,length,width,height,stride,stride,0,offset);assert(encoded);
 const png=Buffer.from(core.UTF8ToString(encoded),'base64');
 assert.equal(preview.MoonlightPreview.encode(core.HEAPU8,p,length,width,height,stride,stride,0,offset,true),'data:image/png;base64,'+core.UTF8ToString(encoded));
 const indexed=Buffer.from(preview.MoonlightPreview.encode(core.HEAPU8,p,length,width,height,stride,stride,0,offset).split(',')[1],'base64');
 let pal,data;for(let i=8;i<indexed.length;){const n=indexed.readUInt32BE(i),type=indexed.toString('ascii',i+4,i+8);if(type==='PLTE')pal=indexed.subarray(i+8,i+8+n);if(type==='IDAT')data=inflateSync(indexed.subarray(i+8,i+8+n));i+=n+12;}
 assert.equal(pal.length,768);assert.equal(data.length,(width+1)*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const index=data[y*(width+1)+x+1];assert(pal[index*3]<=40&&pal[index*3+1]<=40&&pal[index*3+2]>=210);}
 assert(indexed.length<png.length/2);
 assert.throws(()=>preview.MoonlightPreview.encode(core.HEAPU8,p,length-100,width,height,stride,stride,0,offset),/bounds/);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 let compressed=[];
 for(let i=8;i<png.length;){const n=png.readUInt32BE(i),name=png.toString('ascii',i+4,i+8),data=png.subarray(i+8,i+8+n);assert.equal(crc(png.subarray(i+4,i+8+n)),png.readUInt32BE(i+8+n));if(name==='IDAT')compressed.push(data);if(name==='IHDR'){assert.equal(data.readUInt32BE(0),width);assert.equal(data.readUInt32BE(4),height);}i+=n+12;}
 const raw=inflateSync(Buffer.concat(compressed));assert.equal(raw.length,(width*3+1)*height);
 for(let y=0;y<height;y++){assert.equal(raw[y*(width*3+1)],0);for(let x=0;x<width;x++){const pixel=raw.subarray(y*(width*3+1)+1+x*3,y*(width*3+1)+4+x*3);assert(pixel[0]<=2&&pixel[1]<=2&&pixel[2]>=250);}}
 assert.equal(core._ml_png_nv12(p,length-100,width,height,stride,stride,0,offset),0);
 assert.equal(core._ml_png_nv12(p,length,641,height,stride,stride,0,offset),0);
 randomFillSync(core.HEAPU8.subarray(p,p+length));
 const varied=core._ml_png_nv12(p,length,width,height,stride,stride,0,offset);
 assert.equal(preview.MoonlightPreview.encode(core.HEAPU8,p,length,width,height,stride,stride,0,offset,true),'data:image/png;base64,'+core.UTF8ToString(varied));
 core._ml_png_release();core._free(p);
 console.log('Cooperative scheduler and NV12 → PNG pixel/CRC/bounds checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
