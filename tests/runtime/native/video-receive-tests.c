#include "Limelight-internal.h"
#include "runtime.h"
extern int ml_video_batch_configure(int);
extern int ml_video_batch_receive(int,char**,int,int,bool);
extern void ml_video_batch_reset(void);
static int test_result,test_count;
static void receive_test(void* ignored) {
    (void)ignored;
    char* held[65]={0};char* buffer=NULL;int result=0;
    if(test_count<0){
        result=ml_video_batch_receive(7,&buffer,1456,1408,false)<0?0:1;
    }else for(int i=0;i<test_count;i++){
        int n=ml_video_batch_receive(7,&buffer,1456,1408,false);
        if(n!=12+i%100){result=2;break;}
        for(int j=0;j<n;j++)if((unsigned char)buffer[j]!=(unsigned char)(i*7+j)){result=3;break;}
        if(result)break;
        held[i]=buffer;buffer=NULL;
    }
    // Retained packets must survive subsequent native batch refills unchanged.
    for(int i=0;i<65;i++)if(held[i]){
        for(int j=0;j<12+i%100;j++)if((unsigned char)held[i][j]!=(unsigned char)(i*7+j))result=4;
        free(held[i]);
    }
    free(buffer);ml_video_batch_reset();test_result=result? -result:1;
}
int ml_video_batch_test_start(int count) {
    if(count>65||!count||ml_runtime_tasks()||ml_video_batch_configure(1))return -1;
    test_count=count;test_result=0;return ml_spawn_task(receive_test,NULL);
}
int ml_video_batch_test_result(void) {return test_result;}
