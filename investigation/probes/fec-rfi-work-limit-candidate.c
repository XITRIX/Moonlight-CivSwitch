#include "rs.h"
#include <emscripten.h>
#include "oblas_lite.h"
#include "runtime.h"
#include <stdbool.h>
extern bool isReferenceFrameInvalidationEnabled(void);
static double policy_metrics[3]={1,0,0};
int ml_fec_set_work_limit(int bytes) {
    if(bytes<0||bytes>4194304||ml_runtime_tasks())return -1;
    policy_metrics[1]=bytes;return 0;
}
const double* ml_fec_policy_metrics(void) {return policy_metrics;}
int ml_fec_policy_should_skip(int active,reed_solomon* rs,unsigned char** shards,unsigned char* marks,int count,int bytes) {
    if(!active||!policy_metrics[1]||!rs||!shards||!marks||count<rs->ts||rs->ds<=4||bytes<1024||marks[0]||!shards[0])return 0;
    /* Only a present first shard proving an ordinary P-frame may use RFI.
       Preserve audio, keyframes, unknown headers and later multi-FEC blocks. */
    const unsigned char* first=shards[0];
    if((first[0]&0xe0)!=0x80||(first[0]&0x0f)!=0)return 0;
    unsigned nv=12+((first[0]&0x10)?4:0),header=nv+16;
    if(!(first[nv+8]&4)||((first[nv+11]>>4)&3)!=0)return 0;
    if((first[header]!=1&&first[header]!=0x81)||first[header+3]!=1)return 0;
    unsigned missing=0;for(int i=0;i<rs->ds;i++)if(marks[i])missing++;
    return missing>1&&(double)rs->ds*missing*bytes>policy_metrics[1];
}

extern void __real_oblas_get_impl(struct oblas_impl*);
extern void ml_fec_vector(unsigned char*, const unsigned char*, const unsigned char*, unsigned, int);
extern void ml_fec_pair_table(const unsigned char*, int);
static unsigned char products[65536];
static struct oblas_impl original;
static int initialized;
static unsigned operations;
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

/* Prepare one 128 KiB table per call so JS can yield between coefficients.
   This optional 32 MiB accelerator retains upstream field products exactly. */
int ml_fec_prepare_pair(int coefficient) {
    if(ml_runtime_tasks()||coefficient < -1||coefficient>255)return -1;
    if(coefficient>=0){struct oblas_impl impl;__wrap_oblas_get_impl(&impl);}
    ml_fec_pair_table(products,coefficient);return 0;
}

/* Kept outside upstream nanors so the pinned recovery implementation stays intact. */
extern int __real_reed_solomon_decode(reed_solomon*, unsigned char**, unsigned char*, int, int);
/* Recovery wall time includes suspension; yields distinguish it from a single stall. */
static double metrics[7] = {2, 0, 0, 0, 0, 0, 0};
int __wrap_reed_solomon_decode(reed_solomon* rs, unsigned char** shards,
                             unsigned char* marks, int count, int bytes) {
    double begin = emscripten_get_now();
    int yields = ml_runtime_budget_yields();
    int skipped=ml_fec_policy_should_skip(isReferenceFrameInvalidationEnabled(),rs,shards,marks,count,bytes);
    int result;
    if(skipped){policy_metrics[2]++;result=-1;}
    else result=__real_reed_solomon_decode(rs, shards, marks, count, bytes);
    double elapsed = emscripten_get_now() - begin;
    metrics[1]++;
    metrics[2] += elapsed;
    if (elapsed > metrics[3]) metrics[3] = elapsed;
    if (result&&!skipped) metrics[4]++;
    metrics[5] += count * (double)bytes;
    metrics[6] += ml_runtime_budget_yields() - yields;
    return result;
}
const double* ml_fec_metrics(void) { return metrics; }
