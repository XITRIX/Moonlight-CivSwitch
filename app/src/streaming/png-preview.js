/* Typed-array operations avoid wasm2js's byte-by-byte copies in the UI renderer. */
(function(global){
 "use strict";
 var table=new Uint32Array(256),luma=new Int32Array(256),red=new Int32Array(256),blue=new Int32Array(256),greenU=new Int32Array(256),greenV=new Int32Array(256);
 for(var i=0;i<256;i++){var c=i;for(var j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);table[i]=c;luma[i]=298*(i-16)+128;red[i]=409*(i-128);blue[i]=516*(i-128);greenU[i]=-100*(i-128);greenV[i]=-208*(i-128);}
 function clamp(n){return n<0?0:n>255?255:n;}
 function crc(bytes,start,end){var c=0xffffffff;for(var i=start;i<end;i++)c=(c>>>8)^table[(c^bytes[i])&255];return (c^0xffffffff)>>>0;}
 function be(bytes,at,n){bytes[at]=n>>>24;bytes[at+1]=n>>>16;bytes[at+2]=n>>>8;bytes[at+3]=n;}
 function chunk(png,at,name,data){be(png,at,data.length);for(var j=0;j<4;j++)png[at+4+j]=name.charCodeAt(j);png.set(data,at+8);be(png,at+8+data.length,crc(png,at+4,at+8+data.length));return at+data.length+12;}
 var palette=null,lookup=null;
 function indexed(){
  if(lookup)return;palette=new Uint8Array(768);lookup=new Uint8Array(32768);
  for(var i=0;i<256;i++){palette[i*3]=Math.round((i>>5)*255/7);palette[i*3+1]=Math.round(((i>>2)&7)*255/7);palette[i*3+2]=(i&3)*85;}
  for(var y=0;y<32;y++)for(var u=0;u<32;u++)for(var v=0;v<32;v++){
   var Y=luma[y*8+4],U=u*8+4,V=v*8+4,r=clamp((Y+red[V])>>8),g=clamp((Y+greenU[U]+greenV[V])>>8),b=clamp((Y+blue[U])>>8);
   lookup[(y<<10)|(u<<5)|v]=(Math.round(r*7/255)<<5)|(Math.round(g*7/255)<<2)|Math.round(b*3/255);
  }
 }
 function encode(heap,pointer,length,width,height,ys,uvs,yo,uvo,rgb){
  if(![pointer,length,width,height,ys,uvs,yo,uvo].every(Number.isInteger)||pointer<0||length<0||pointer+length>heap.length||width<1||height<1||width>640||height>360||ys<width||uvs<((width+1)&~1)||yo<0||uvo<0||yo+(height-1)*ys+width>length||uvo+((height-1)>>1)*uvs+((width+1)&~1)>length)throw Error("Invalid preview NV12 bounds");
  if(!rgb)indexed();
  var row=width*(rgb?3:1)+1,raw=new Uint8Array(row*height),position=0;
  for(var y=0;y<height;y++){
   raw[position++]=0;var yp=pointer+yo+y*ys,uv=pointer+uvo+(y>>1)*uvs;
   for(var x=0;x<width;x+=2){
    if(!rgb){var chroma=((heap[uv+x]>>3)<<5)|(heap[uv+x+1]>>3);raw[position++]=lookup[((heap[yp+x]>>3)<<10)|chroma];if(x+1<width)raw[position++]=lookup[((heap[yp+x+1]>>3)<<10)|chroma];continue;}
    var U=heap[uv+x],V=heap[uv+x+1],r=red[V],b=blue[U],g=greenU[U]+greenV[V],Y=luma[heap[yp+x]];
    raw[position++]=clamp((Y+r)>>8);raw[position++]=clamp((Y+g)>>8);raw[position++]=clamp((Y+b)>>8);
    if(x+1<width){Y=luma[heap[yp+x+1]];raw[position++]=clamp((Y+r)>>8);raw[position++]=clamp((Y+g)>>8);raw[position++]=clamp((Y+b)>>8);}
   }
  }
  var z=new Uint8Array(raw.length+Math.ceil(raw.length/65535)*5+6),a=1,b=0;z[0]=0x78;z[1]=1;
  for(var start=0;start<raw.length;){var end=Math.min(start+5552,raw.length);for(;start<end;start++){a+=raw[start];b+=a;}a%=65521;b%=65521;}
  var at=2;for(var start=0;start<raw.length;start+=65535){var n=Math.min(65535,raw.length-start);z[at++]=start+n===raw.length?1:0;z[at++]=n;z[at++]=n>>>8;z[at++]=~n;z[at++]=(~n)>>>8;z.set(raw.subarray(start,start+n),at);at+=n;}be(z,at,((b<<16)|a)>>>0);
  var png=new Uint8Array(z.length+57+(rgb?0:780)),header=new Uint8Array(13);png.set([137,80,78,71,13,10,26,10]);be(header,0,width);be(header,4,height);header[8]=8;header[9]=rgb?2:3;
  at=chunk(png,8,"IHDR",header);if(!rgb)at=chunk(png,at,"PLTE",palette);at=chunk(png,at,"IDAT",z);chunk(png,at,"IEND",new Uint8Array(0));
  var parts=[];for(var i=0;i<png.length;i+=8192)parts.push(String.fromCharCode.apply(null,png.subarray(i,i+8192)));var binary=parts.join("");
  return "data:image/png;base64,"+(typeof global.btoa==="function"?global.btoa(binary):global.forge.util.encode64(binary));
 }
 global.MoonlightPreview={encode:encode};
})(typeof window!=="undefined"?window:globalThis);
