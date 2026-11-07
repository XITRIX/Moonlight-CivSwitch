/* CPU presentation fallback for the first low-resolution streaming prototype. */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
static char* encoded;
static uint32_t crc_table[256];
static int crc_ready;
static uint32_t crc(const unsigned char* bytes,size_t length) {
    if(!crc_ready){for(uint32_t i=0;i<256;i++){uint32_t c=i;for(int j=0;j<8;j++)c=(c>>1)^((c&1)?0xedb88320:0);crc_table[i]=c;}crc_ready=1;}
    uint32_t c=0xffffffff;for(size_t i=0;i<length;i++)c=(c>>8)^crc_table[(c^bytes[i])&255];return c^0xffffffff;
}
static void be(unsigned char* p,uint32_t v) { p[0]=v>>24;p[1]=v>>16;p[2]=v>>8;p[3]=v; }
static unsigned char* chunk(unsigned char* output,const char* name,const unsigned char* bytes,size_t length) {
    be(output,length);memcpy(output+4,name,4);memcpy(output+8,bytes,length);be(output+8+length,crc(output+4,length+4));return output+length+12;
}
static unsigned char clamp(int value) { return value<0?0:value>255?255:value; }
const char* ml_png_nv12(const unsigned char* pixels,int length,int width,int height,int y_stride,int uv_stride,int y_offset,int uv_offset) {
    if(width<1||height<1||width>640||height>360||y_stride<width||uv_stride<width||y_offset<0||uv_offset<0||
       y_offset+(height-1)*y_stride+width>length||uv_offset+((height-1)/2)*uv_stride+((width+1)&~1)>length)return NULL;
    size_t row=width*3+1,raw_size=row*height,blocks=(raw_size+65534)/65535,z_size=raw_size+blocks*5+6;
    unsigned char* raw=malloc(raw_size),*z=malloc(z_size),*png=malloc(z_size+57);if(!raw||!z||!png){free(raw);free(z);free(png);return NULL;}
    for(int y=0;y<height;y++){
        unsigned char* target=raw+y*row;*target++=0;
        for(int x=0;x<width;x++){int Y=pixels[y_offset+y*y_stride+x]-16,uv=uv_offset+(y/2)*uv_stride+(x&~1),U=pixels[uv]-128,V=pixels[uv+1]-128;
            *target++=clamp((298*Y+409*V+128)>>8);*target++=clamp((298*Y-100*U-208*V+128)>>8);*target++=clamp((298*Y+516*U+128)>>8);
        }
    }
    uint32_t a=1,b=0;for(size_t start=0;start<raw_size;){size_t end=start+5552;if(end>raw_size)end=raw_size;for(;start<end;start++){a+=raw[start];b+=a;}a%=65521;b%=65521;}
    z[0]=0x78;z[1]=1;size_t at=2;
    for(size_t start=0;start<raw_size;){size_t n=raw_size-start;if(n>65535)n=65535;z[at++]=start+n==raw_size?1:0;z[at++]=n;z[at++]=n>>8;z[at++]=~n;z[at++]=(~n)>>8;memcpy(z+at,raw+start,n);at+=n;start+=n;}
    be(z+at,(b<<16)|a);at+=4;
    const unsigned char signature[]={137,80,78,71,13,10,26,10};memcpy(png,signature,8);
    unsigned char header[13]={0};be(header,width);be(header+4,height);header[8]=8;header[9]=2;
    unsigned char* end=chunk(png+8,"IHDR",header,13);end=chunk(end,"IDAT",z,at);end=chunk(end,"IEND",z,0);
    size_t size=end-png,output_size=4*((size+2)/3);char* replacement=realloc(encoded,output_size+1);
    if(!replacement){free(raw);free(z);free(png);return NULL;}encoded=replacement;
    const char* alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";size_t position=0;
    for(size_t i=0;i<size;i+=3){uint32_t v=(png[i]<<16)|((i+1<size?png[i+1]:0)<<8)|(i+2<size?png[i+2]:0);encoded[position++]=alphabet[(v>>18)&63];encoded[position++]=alphabet[(v>>12)&63];encoded[position++]=i+1<size?alphabet[(v>>6)&63]:'=';encoded[position++]=i+2<size?alphabet[v&63]:'=';}
    encoded[position]=0;free(raw);free(z);free(png);return encoded;
}
void ml_png_release(void) { free(encoded);encoded=NULL; }
