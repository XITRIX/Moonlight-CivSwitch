#include "rs.h"
#include <emscripten.h>
#include "oblas_lite.h"
#include "runtime.h"

extern void __real_oblas_get_impl(struct oblas_impl*);
extern void ml_fec_vector(unsigned char*, const unsigned char*, const unsigned char*, unsigned, int);
static unsigned char products[65536];
static struct oblas_impl original;
static int initialized;
static unsigned operations;
static unsigned work_limit;
/* Wall time includes suspension; policy skips are distinct from decoder errors. */
static double metrics[9] = {3, 0, 0, 0, 0, 0, 0, 0, 0};
int ml_fec_set_work_limit(int bytes) {
    if(bytes<0||bytes>4194304||ml_runtime_tasks())return -1;
    work_limit=(unsigned)bytes;metrics[8]=bytes;return 0;
}
int ml_fec_recovery_allowed(int data,int missing,int bytes) {
    /* Always preserve audio and single-erasure video recovery. */
    if(!work_limit||data<=4||missing<=1||bytes<1024)return 1;
    return (uint64_t)(unsigned)data*(unsigned)missing*(unsigned)bytes<=work_limit;
}
static int known_delta_frame(unsigned char** shards,unsigned char* marks,int bytes) {
    /* Rejecting a keyframe can prevent every following P-frame from decoding.
       Apply the limit only when a present first shard proves a normal P-frame. */
    if(!shards||!marks||marks[0]||!shards[0]||bytes<40)return 0;
    const unsigned char* first=shards[0];
    if((first[0]&0xe0)!=0x80||(first[0]&0x0f)!=0)return 0;
    unsigned nv=12+((first[0]&0x10)?4:0),header=nv+16;
    if(bytes<(int)header+4||!(first[nv+8]&4)||((first[nv+11]>>4)&3)!=0)return 0;
    return (first[header]==1||first[header]==0x81)&&first[header+3]==1;
}
static void vector(unsigned char* a, unsigned char* b, unsigned char u, unsigned k, int add) {
    /* A row is small, but a recovery may need thousands of row operations. */
    if (!(operations++ & 3)) ml_runtime_checkpoint();
    ml_fec_vector(a, b, products + ((unsigned)u << 8), k, add);
}
static void fast_axpy(unsigned char* a, unsigned char* b, unsigned char u, unsigned k) { vector(a,b,u,k,1); }
static void fast_axiy(unsigned char* a, unsigned char* b, unsigned char u, unsigned k) { vector(a,b,u,k,0); }
static void fast_scal(unsigned char* a, unsigned char u, unsigned k) { vector(a,a,u,k,0); }
void __wrap_oblas_get_impl(struct oblas_impl* impl) {
    if (!initialized) {
        __real_oblas_get_impl(&original);
        unsigned char bytes[256];
        for (unsigned i=0;i<256;i++) bytes[i]=i;
        /* Derive the exact field from nanors rather than duplicating its polynomial. */
        for (unsigned u=0;u<256;u++) original.axiy(products+(u<<8),bytes,u,256);
        initialized=1;
    }
    *impl=original;
    impl->axpy=fast_axpy;impl->axiy=fast_axiy;impl->scal=fast_scal;
}

/* Kept outside upstream nanors so the pinned recovery implementation stays intact. */
extern int __real_reed_solomon_decode(reed_solomon*, unsigned char**, unsigned char*, int, int);
int __wrap_reed_solomon_decode(reed_solomon* rs, unsigned char** shards,
                             unsigned char* marks, int count, int bytes) {
    double begin = emscripten_get_now();
    int yields = ml_runtime_budget_yields();
    int missing=0,result;
    if(work_limit&&rs&&shards&&marks&&count>=rs->ts&&bytes>0) {
        for(int i=0;i<rs->ds;i++)if(marks[i])missing++;
    }
    if(work_limit&&rs&&!ml_fec_recovery_allowed(rs->ds,missing,bytes)&&known_delta_frame(shards,marks,bytes)) {
        /* Upstream discards incomplete data on a recovery failure. Never submit
           partially reconstructed packets, and leave their ownership upstream. */
        metrics[7]++;result=-1;
    } else {
        result=__real_reed_solomon_decode(rs,shards,marks,count,bytes);
        if(result)metrics[4]++;
    }
    double elapsed = emscripten_get_now() - begin;
    metrics[1]++;
    metrics[2] += elapsed;
    if (elapsed > metrics[3]) metrics[3] = elapsed;
    metrics[5] += count * (double)bytes;
    metrics[6] += ml_runtime_budget_yields() - yields;
    return result;
}
const double* ml_fec_metrics(void) { return metrics; }
