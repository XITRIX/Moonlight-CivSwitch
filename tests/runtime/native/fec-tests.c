#include "rs.h"
#include "oblas_lite.h"
#include "runtime.h"
#include <stdlib.h>
#include <string.h>
extern void __real_oblas_get_impl(struct oblas_impl*);
static int recovery_test_result;
int ml_test_fec_vectors(void) {
    struct oblas_impl impl;oblas_get_impl(&impl);struct oblas_impl original;__real_oblas_get_impl(&original);
    unsigned char a[1424], b[1424], expected[1424];
    const unsigned lengths[]={0,1,7,8,31,255,1408};
    const unsigned offsets[][2]={{1,3},{0,0},{1,1}};
    for(unsigned offset=0;offset<3;offset++) for (unsigned u=0;u<256;u++) for(unsigned n=0;n<sizeof(lengths)/sizeof(lengths[0]);n++) {
        unsigned k=lengths[n];
        unsigned x=offsets[offset][0],y=offsets[offset][1];
        for(unsigned i=0;i<sizeof(a);i++){a[i]=expected[i]=(unsigned char)(i*17+u);b[i]=(unsigned char)(i*61+3);}
        original.axpy(expected+x,b+y,u,k);impl.axpy(a+x,b+y,u,k);
        if(memcmp(a,expected,sizeof(a)))return 1;
        original.axiy(expected+x,b+y,u,k);impl.axiy(a+x,b+y,u,k);
        if(memcmp(a,expected,sizeof(a)))return 2;
        original.scal(expected+x,u,k);impl.scal(a+x,u,k);
        if(memcmp(a,expected,sizeof(a)))return 3;
    }
    return 0;
}

int ml_test_fec_large(void) {
    enum {DATA=64,PARITY=16,BYTES=1408};
    unsigned char* storage=malloc((DATA+PARITY)*BYTES);
    unsigned char* expected=malloc((DATA+PARITY)*BYTES);
    unsigned char* shards[DATA+PARITY];unsigned char marks[DATA+PARITY]={0};
    struct oblas_impl original,fast;__real_oblas_get_impl(&original);oblas_get_impl(&fast);
    reed_solomon* rs=reed_solomon_new(DATA,PARITY);int result=1;
    if(!storage||!expected||!rs)goto done;
    for(unsigned i=0;i<(DATA+PARITY)*BYTES;i++)storage[i]=(unsigned char)(i*17+i/BYTES*61);
    for(unsigned i=0;i<DATA+PARITY;i++)shards[i]=storage+i*BYTES;
    rs->axpy=original.axpy;rs->axiy=original.axiy;rs->scal=original.scal;
    if(reed_solomon_encode(rs,shards,DATA+PARITY,BYTES))goto done;
    memcpy(expected,storage,(DATA+PARITY)*BYTES);
    rs->axpy=fast.axpy;rs->axiy=fast.axiy;rs->scal=fast.scal;
    memset(storage+DATA*BYTES,0,PARITY*BYTES);
    if(reed_solomon_encode(rs,shards,DATA+PARITY,BYTES)||memcmp(expected,storage,(DATA+PARITY)*BYTES)){result=2;goto done;}
    for(unsigned i=0;i<16;i++){unsigned missing=(i*7)%DATA;marks[missing]=1;memset(shards[missing],0,BYTES);}
    if(reed_solomon_decode(rs,shards,marks,DATA+PARITY,BYTES)||memcmp(storage,expected,DATA*BYTES)){result=3;goto done;}
    result=0;
done:
    if(rs)reed_solomon_release(rs);free(storage);free(expected);return result;
}
static unsigned char* test_storage;
static unsigned char* test_expected;
static reed_solomon* test_codec;
static int test_rounds;
static void recovery_test(void* ignored) {
    (void)ignored;
    unsigned char* shards[80];unsigned char marks[80]={0};
    for(int i=0;i<80;i++)shards[i]=test_storage+i*1408;
    int result=1;
    for(int round=0;round<test_rounds;round++) {
        for(int i=0;i<16;i++){int missing=(i*7)%64;marks[missing]=1;memset(shards[missing],0,1408);}
        if(reed_solomon_decode(test_codec,shards,marks,80,1408)||memcmp(test_storage,test_expected,64*1408)){result=-1;break;}
    }
    reed_solomon_release(test_codec);test_codec=NULL;free(test_storage);test_storage=NULL;free(test_expected);test_expected=NULL;
    recovery_test_result=result;
}
int ml_fec_budget_test_start(int rounds) {
    if(test_codec||rounds<1||rounds>128)return -1;
    test_rounds=rounds;
    recovery_test_result=0;test_storage=malloc(80*1408);test_expected=malloc(64*1408);test_codec=reed_solomon_new(64,16);
    if(!test_storage||!test_expected||!test_codec){if(test_codec)reed_solomon_release(test_codec);test_codec=NULL;free(test_storage);free(test_expected);test_storage=test_expected=NULL;return -1;}
    unsigned char* shards[80];for(int i=0;i<80*1408;i++)test_storage[i]=(unsigned char)(i*17+i/1408*61);
    for(int i=0;i<80;i++)shards[i]=test_storage+i*1408;
    reed_solomon_encode(test_codec,shards,80,1408);memcpy(test_expected,test_storage,64*1408);
    int result=ml_spawn_task(recovery_test,NULL);
    if(result){reed_solomon_release(test_codec);test_codec=NULL;free(test_storage);free(test_expected);test_storage=test_expected=NULL;}
    return result;
}
int ml_fec_budget_test_result(void) { return recovery_test_result; }
int ml_fec_kernel_benchmark(int fast) {
    unsigned char a[1408],b[1408];struct oblas_impl impl;oblas_get_impl(&impl);struct oblas_impl original;__real_oblas_get_impl(&original);
    for(unsigned i=0;i<sizeof(a);i++){a[i]=i*17;b[i]=i*61;}
    for(unsigned j=0;j<4;j++)for(unsigned u=0;u<256;u++)
        (fast?impl.axpy:original.axpy)(a,b,u,sizeof(a));
    return a[0];
}

