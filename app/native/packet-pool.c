/* Keep upstream packet ownership while avoiding general-allocator work per RTP shard. */
#include "Limelight-internal.h"
#include "runtime.h"
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

extern void* __real_malloc(size_t);
extern void __real_free(void*);
extern void* __real_realloc(void*,size_t);
enum { PACKETS=1024 };
static unsigned char* slab;
static void* available;
static size_t packet_bytes,stride;
static unsigned char live[PACKETS];
static unsigned used;
static double metrics[8]={1,0,0,0,0,0,0,0};

static int pool_index(void* pointer) {
    uintptr_t p=(uintptr_t)pointer,base=(uintptr_t)slab;
    if(!slab||p<base||p>=base+PACKETS*stride)return -1;
    unsigned index=(unsigned)((p-base)/stride);
    if(index*stride!=p-base||!live[index])abort();
    return (int)index;
}
int ml_packet_pool_configure(int enabled) {
    if(ml_runtime_tasks()||used)return -1;
    if(enabled!=0&&enabled!=1)return -1;
    if(!enabled){__real_free(slab);slab=NULL;available=NULL;metrics[2]=0;return 0;}
    if(slab)return 0;
    packet_bytes=1392+MAX_RTP_HEADER_SIZE+sizeof(RTPV_QUEUE_ENTRY);
    stride=(packet_bytes+15)&~(size_t)15;
    slab=__real_malloc(PACKETS*stride);if(!slab)return -1;
    memset(live,0,sizeof(live));used=0;
    for(unsigned i=0;i<PACKETS;i++){
        void* next=i+1<PACKETS?slab+(i+1)*stride:NULL;
        *(void**)(slab+i*stride)=next;
    }
    available=slab;
    metrics[1]=packet_bytes;metrics[2]=PACKETS;for(unsigned i=3;i<8;i++)metrics[i]=0;
    return 0;
}
void* __wrap_malloc(size_t bytes) {
    if(slab&&bytes==packet_bytes){
        if(available){
            void* pointer=available;available=*(void**)pointer;
            unsigned index=((unsigned char*)pointer-slab)/stride;
            if(live[index])abort();live[index]=1;used++;metrics[3]=used;
            if(used>metrics[4])metrics[4]=used;metrics[5]++;return pointer;
        }
        metrics[6]++;
    }
    return __real_malloc(bytes);
}
void __wrap_free(void* pointer) {
    int index=pool_index(pointer);
    if(index<0){__real_free(pointer);return;}
    live[index]=0;used--;metrics[3]=used;
    *(void**)pointer=available;available=pointer;
}
void* __wrap_realloc(void* pointer,size_t bytes) {
    if(!pointer)return __wrap_malloc(bytes);
    if(pool_index(pointer)<0)return __real_realloc(pointer,bytes);
    if(!bytes){__wrap_free(pointer);return NULL;}
    if(bytes<=packet_bytes)return pointer;
    void* larger=__real_malloc(bytes);if(!larger)return NULL;
    memcpy(larger,pointer,packet_bytes);__wrap_free(pointer);metrics[7]++;return larger;
}
const double* ml_packet_pool_metrics(void) { return metrics; }
