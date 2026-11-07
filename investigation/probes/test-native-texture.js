/* One owned 64x64 RGBA texture, private live URI, automatic cleanup; no files. */
(async function () {
 var info=malloc(64),page=malloc(8),owned=[],handle=0n,provider=0n,published=false,root=null;
 function alloc(n){var p=malloc(n);if(!p)throw Error('Allocation failed');owned.push(p);return p;}
 function range(p,n,permissions){
  if(call_rop(sdk_base+0x168b0cn,info,page,p)&0x3fffffn)throw Error('Query failed');
  var base=read64(info),end=base+read64(info+8n);
  if((Number(read32(info+24n))&permissions)!==permissions||p<base||p+BigInt(n)>end)throw Error('Rejected native range');
 }
 function pointer(p){range(p,8,1);return read64(p);}
 function invoke(offset,args){return call_rop.apply(null,[main_base+offset].concat(args));}
 function frames(n){return new Promise(function(resolve){function tick(){if(--n<=0)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);});}
 try {
  if(window.__moonlightNativeTextureTest)throw Error('Texture test already running');
  window.__moonlightNativeTextureTest=true;
  if(read32(sdk_base+0x168b10n)!==0xd40000c1n)throw Error('Unknown memory query ABI');
  for(var signature of [[0x771750n,0xa9ba7bfdn],[0x7817c0n,0xd10103ffn],[0x4bbb90n,0xd101c3ffn],[0x4bc160n,0xd10183ffn],[0x771100n,0x72003c1fn]]){
   range(main_base+signature[0],8,5);
   if(read32(main_base+signature[0])!==signature[1])throw Error('Unsupported renderer build at '+signature[0].toString(16));
  }
  provider=pointer(main_base+0x5e7bba0n+0x180n);range(provider,64,3);
  var name=alloc(32);write_string(name,'moonlight-experiment');
  if(invoke(0x4bca00n,[provider,name])&0xffffn)throw Error('Private image name is already registered');
  var pixels=alloc(64*64*4),description=alloc(0x448);
  var rgba=new Uint8Array(64*64*4);
  for(var y=0;y<64;y++)for(var x=0;x<64;x++){
   var i=(y*64+x)*4;rgba[i]=x<32?255:0;rgba[i+1]=y<32?255:0;rgba[i+2]=x>=32?255:0;rgba[i+3]=255;
  }
  write_buffer(pixels,rgba);
  // TextureDesc constructor 0x823710: format/type/mips, dimensions, mip pixels.
  write32(description,28n);write32(description+4n,0n);write32(description+8n,1n);
  write32(description+0x10n,64n);write32(description+0x14n,64n);write32(description+0x18n,1n);write64(description+0x20n,pixels);
  await log('MOONLIGHT_NATIVE_TEXTURE_CREATE_BEGIN');
  handle=invoke(0x771750n,[description,name,1n,0x4an,0n])&0xffffn;
  if(handle<22n)throw Error('Native texture allocation returned reserved/empty handle '+handle);
  var metadata=invoke(0x771100n,[handle]);range(metadata,64,1);
  if(read32(metadata+4n)!==64n||read16(metadata+8n)!==64n||read32(metadata+0x20n)!==28n)throw Error('Created texture metadata differs from descriptor');
  await log('MOONLIGHT_NATIVE_TEXTURE_CREATED: '+handle);
  invoke(0x4bbb90n,[provider,handle,name]);published=true;
  if((invoke(0x4bca00n,[provider,name])&0xffffn)!==handle)throw Error('Private live image lookup mismatch');
  root=document.createElement('div');root.style.cssText='position:fixed;inset:0;z-index:999999;background:#101d2b;color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:26px;';
  var title=document.createElement('div');title.textContent='Moonlight — native texture test';root.appendChild(title);
  var image=document.createElement('div');image.style.cssText='width:512px;height:512px;margin:20px;background-size:100% 100%;background-repeat:no-repeat;';image.style.backgroundImage='url("live:/moonlight-experiment")';root.appendChild(image);
  var note=document.createElement('div');note.textContent='Four colored squares. This test closes automatically in 20 seconds.';root.appendChild(note);document.body.appendChild(root);
  await log('MOONLIGHT_NATIVE_TEXTURE_DISPLAYED: live:/moonlight-experiment');
  await new Promise(function(resolve){setTimeout(resolve,20000);});
 } finally {
  if(root){root.remove();await frames(3);}
  if(published){invoke(0x4bc160n,[provider,name]);if(invoke(0x4bca00n,[provider,name])&0xffffn)throw Error('Private live image unregister failed');}
  if(handle>=22n){var refs=invoke(0x7817c0n,[handle]);await log('MOONLIGHT_NATIVE_TEXTURE_RELEASED: references='+refs);}
  for(var p of owned.reverse())free(p);free(page);free(info);window.__moonlightNativeTextureTest=false;
 }
 await log('MOONLIGHT_NATIVE_TEXTURE_TEST_END');
})();
