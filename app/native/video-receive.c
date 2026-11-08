/* Borrow 32 packet buffers directly for one nonblocking native receive call.
 * Delivered buffers retain upstream ownership; only unused slots belong here. */
#include "Limelight-internal.h"
#include "runtime.h"
#include <emscripten.h>

extern int ml_io_video_batch(int, char**, int*, void*, int, int);
enum { BATCH_COUNT=32 };
static char* packets[BATCH_COUNT];
static int lengths[BATCH_COUNT], count, next, enabled;
static unsigned char metadata[BATCH_COUNT*(56+16)] __attribute__((aligned(16)));

void ml_video_batch_reset(void) {
    for(int i=0;i<BATCH_COUNT;i++){free(packets[i]);packets[i]=NULL;}
    count=next=0;
}
int ml_video_batch_configure(int value) {
    if(ml_runtime_tasks()||(value!=0&&value!=1))return -1;
    ml_video_batch_reset();enabled=value;return 0;
}
int ml_video_batch_enabled(void) {return enabled;}
int ml_video_batch_receive(int fd,char** buffer,int buffer_size,int receive_size,bool use_select) {
    ml_runtime_checkpoint();
    double deadline=emscripten_get_now()+UDP_RECV_POLL_TIMEOUT_MS;
    while(next>=count){
        for(int i=0;i<BATCH_COUNT;i++)if(!packets[i]){
            packets[i]=malloc(buffer_size);
            if(!packets[i]){errno=ENOMEM;return -1;}
        }
        int result=ml_io_video_batch(fd,packets,lengths,metadata,BATCH_COUNT,receive_size);
        if(result==-38){
            ml_video_batch_reset();enabled=0;
            if(!*buffer)*buffer=malloc(buffer_size);
            if(!*buffer){errno=ENOMEM;return -1;}
            return recvUdpSocket(fd,*buffer,receive_size,use_select,NULL,NULL);
        }
        if(result>0){
            if(result>BATCH_COUNT){errno=EIO;return -1;}
            count=result;next=0;break;
        }
        if(result<0&&result!=-11){errno=result==-104?ECONNRESET:EIO;return -1;}
        if(emscripten_get_now()>=deadline)return 0;
        ml_yield_ms(2);
        ml_runtime_checkpoint();
    }
    if(lengths[next]<0||lengths[next]>receive_size){errno=EIO;return -1;}
    free(*buffer);*buffer=packets[next];packets[next]=NULL;
    return lengths[next++];
}
