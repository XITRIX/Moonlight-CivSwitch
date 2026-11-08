#include "Limelight-internal.h"
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
extern int ml_packet_pool_configure(int);
extern const double* ml_packet_pool_metrics(void);
int ml_test_packet_pool(void) {
    enum {COUNT=1026};void* pointers[COUNT]={0};int result=1;
    size_t bytes=1392+MAX_RTP_HEADER_SIZE+sizeof(RTPV_QUEUE_ENTRY);
    if(ml_packet_pool_configure(1))return 1;
    for(unsigned i=0;i<COUNT;i++){
        pointers[i]=malloc(bytes);if(!pointers[i])goto done;
        memset(pointers[i],i%251,bytes);
    }
    if(ml_packet_pool_metrics()[3]!=1024||ml_packet_pool_metrics()[6]!=2||ml_packet_pool_configure(0)!=-1){result=2;goto done;}
    for(unsigned i=0;i<COUNT;i++){
        unsigned char* p=pointers[i];for(unsigned j=0;j<bytes;j++)if(p[j]!=i%251){result=3;goto done;}
    }
    unsigned char* larger=realloc(pointers[7],bytes+128);if(!larger){result=4;goto done;}pointers[7]=larger;
    for(unsigned i=0;i<bytes;i++)if(larger[i]!=7){result=5;goto done;}
    void* same=realloc(pointers[1],32);if(same!=pointers[1]){pointers[1]=same;result=6;goto done;}
    result=0;
done:
    for(unsigned i=0;i<COUNT;i++)free(pointers[i]);
    if(ml_packet_pool_configure(0))return 7;return result;
}
int ml_packet_pool_benchmark(int enabled) {
    volatile unsigned char* slots[128]={0};unsigned char tags[128]={0};int result=0;
    size_t bytes=1392+MAX_RTP_HEADER_SIZE+sizeof(RTPV_QUEUE_ENTRY);
    if(ml_packet_pool_configure(enabled))return -1;
    for(unsigned i=0;i<4096;i++){
        unsigned slot=i%128;
        if(slots[slot]){if(slots[slot][0]!=tags[slot]||slots[slot][bytes-1]!=tags[slot]){result=-2;break;}free((void*)slots[slot]);slots[slot]=NULL;}
        slots[slot]=malloc(bytes);if(!slots[slot]){result=-3;break;}
        tags[slot]=i%251;slots[slot][0]=slots[slot][bytes-1]=tags[slot];
    }
    for(unsigned i=0;i<128;i++)free((void*)slots[i]);
    if(enabled&&ml_packet_pool_metrics()[5]!=4096)result=-4;
    if(ml_packet_pool_configure(0))result=-5;return result;
}
