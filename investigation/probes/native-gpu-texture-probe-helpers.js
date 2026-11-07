/* Private 64x64 renderer texture used only by the bounded decoder probe. */
(function(){
 var N=window.MoonlightProbeNative;
 N.createOutputTexture=function(){
  var owned=[],handle=0n,registered=false,root=null,info=malloc(64),page=malloc(8);
  function alloc(n){var p=malloc(n);owned.push(p);return p;}
  function range(p,n,permissions){
   if(call_rop(sdk_base+0x168b0cn,info,page,p)&0x3fffffn)throw Error('Query failed');
   if((Number(read32(info+24n))&permissions)!==permissions||p<read64(info)||p+BigInt(n)>read64(info)+read64(info+8n))throw Error('Texture range rejected');
  }
  function ptr(p){range(p,8,1);return read64(p);}
  function call(offset,args){return call_rop.apply(null,[main_base+offset].concat(args));}
  var provider=ptr(main_base+0x5e7bba0n+0x180n),device=ptr(ptr(main_base+0x4db9ed8n));range(device,8,1);
  for(var sig of [[0x781a10n,0x92403c08n],[0x771750n,0xa9ba7bfdn]]){range(main_base+sig[0],8,5);if(read32(main_base+sig[0])!==sig[1])throw Error('Renderer build mismatch');}
  var name=alloc(128);write_string(name,'moonlight-experiment/gpu-probe');
  if(call(0x4bca00n,[provider,name])&0xffffn)throw Error('Probe image already registered');
  var pixels=alloc(64*64*4),description=alloc(0x448),black=new Uint8Array(64*64*4);
  for(var i=3;i<black.length;i+=4)black[i]=255;write_buffer(pixels,black);
  write32(description,28n);write32(description+8n,1n);write32(description+0x10n,64n);write32(description+0x14n,64n);write32(description+0x18n,1n);write64(description+0x20n,pixels);
  handle=call(0x771750n,[description,name,1n,0x4an,0n])&0xffffn;if(handle<22n)throw Error('Invalid owned texture handle');
  var texture=call(0x781a10n,[handle]);range(texture,216,3);
  return {texture:texture,device:device,
   show:async function(){
    call(0x4bbb90n,[provider,handle,name]);registered=true;call(0x4bc7a0n,[provider,handle]);call(0x4bc570n,[provider,handle]);
    root=document.createElement('div');root.style.cssText='position:fixed;inset:0;z-index:999999;background:#101d2b;color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:26px;';
    root.textContent='Moonlight — GPU decoded frame (expected blue)';
    var image=document.createElement('div');image.style.cssText='width:512px;height:512px;background-size:100% 100%;background-image:url("live:/moonlight-experiment/gpu-probe");';root.appendChild(image);document.body.appendChild(root);
    await new Promise(function(resolve){setTimeout(resolve,10000);});
   },
   close:async function(){
    if(root){root.remove();await new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});}
    if(registered)call(0x4bc160n,[provider,name]);if(handle>=22n)call(0x7817c0n,[handle]);
    for(var p of owned.reverse())free(p);free(page);free(info);
   }
  };
 };
})();
