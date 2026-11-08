#include "video-queue-fixture.h"

static void quiet_log(const char* format, ...) { (void)format; }
static uint32_t random_step(uint32_t* state) {
    *state^=*state<<13;*state^=*state>>17;*state^=*state<<5;return *state;
}
static int same_queue(RTP_VIDEO_QUEUE* a,RTP_VIDEO_QUEUE* b) {
    if(a->nextContiguousSequenceNumber!=b->nextContiguousSequenceNumber ||
       a->useFastQueuePath!=b->useFastQueuePath || a->receivedOosData!=b->receivedOosData ||
       a->lastOosFramePresentationTimestamp!=b->lastOosFramePresentationTimestamp ||
       a->pendingFecBlockList.count!=b->pendingFecBlockList.count)return 0;
    PRTPV_QUEUE_ENTRY x=a->pendingFecBlockList.head,y=b->pendingFecBlockList.head;
    while(x&&y){
        if(x->packet->sequenceNumber!=y->packet->sequenceNumber ||
           x->presentationTimeUs!=y->presentationTimeUs || x->isParity!=y->isParity ||
           x->length!=y->length || (!!x->prev)!=(!!y->prev))return 0;
        x=x->next;y=y->next;
    }
    return !x&&!y;
}
int ml_test_video_queue(void) {
    RTP_VIDEO_QUEUE queues[2];RTPV_QUEUE_ENTRY entries[2][256];RTP_PACKET packets[2][256];
    uint32_t seed=1979;int result=0;
    void (*saved_log)(const char*,...)=ListenerCallbacks.logMessage;ListenerCallbacks.logMessage=quiet_log;
    for(unsigned round=0;round<128&&!result;round++){
        memset(queues,0,sizeof(queues));memset(entries,0,sizeof(entries));memset(packets,0,sizeof(packets));
        unsigned base=round%2?65500:round*31;
        for(unsigned side=0;side<2;side++){queues[side].nextContiguousSequenceNumber=U16(base);queues[side].useFastQueuePath=true;}
        for(unsigned i=0;i<256;i++){
            // Ordered packets after a gap, duplicates, arbitrary reordering,
            // wraparound, parity, then locally reconstructed missing packets.
            unsigned offset=i<96?(i<2?i:i+3):(random_step(&seed)%128);
            unsigned seq=U16(base+offset);bool recovered=i>=224;
            if(isBefore16(seq,queues[0].nextContiguousSequenceNumber))continue;
            int accepted[2];
            for(unsigned side=0;side<2;side++){
                RTP_VIDEO_QUEUE* q=&queues[side];RTP_PACKET* p=&packets[side][i];
                p->sequenceNumber=seq;p->timestamp=round*4000000U;
                accepted[side]=(side?optimizedQueuePacket:referenceQueuePacket)(q,&entries[side][i],p,1408,!recovered&&offset>=100,recovered);
                if(accepted[side]&&!recovered&&(q->pendingFecBlockList.count==1||isBefore16(q->receivedHighestSequenceNumber,seq)))q->receivedHighestSequenceNumber=seq;
            }
            if(accepted[0]!=accepted[1]||!same_queue(&queues[0],&queues[1])){result=1;break;}
        }
    }
    ListenerCallbacks.logMessage=saved_log;return result;
}
int ml_video_queue_benchmark(int optimized,int rounds) {
    if(rounds<1||rounds>256)return -1;
    RTP_VIDEO_QUEUE q;RTPV_QUEUE_ENTRY entries[128];RTP_PACKET packets[128];unsigned checksum=0;
    for(int turn=0;turn<rounds;turn++){
        memset(&q,0,sizeof(q));memset(entries,0,sizeof(entries));memset(packets,0,sizeof(packets));q.useFastQueuePath=true;
        for(unsigned i=0;i<128;i++){
            unsigned seq=i?i+3:0;packets[i].sequenceNumber=seq;packets[i].timestamp=12345;
            if(!(optimized?optimizedQueuePacket:referenceQueuePacket)(&q,&entries[i],&packets[i],1408,false,false))return -2;
            q.receivedHighestSequenceNumber=seq;checksum+=q.pendingFecBlockList.count;
        }
    }
    return checksum;
}
