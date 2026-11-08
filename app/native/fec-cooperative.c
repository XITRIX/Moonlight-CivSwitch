#include "rs.h"
#include <emscripten.h>
#include "oblas_lite.h"
#include "runtime.h"
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
    int result = __real_reed_solomon_decode(rs, shards, marks, count, bytes);
    double elapsed = emscripten_get_now() - begin;
    metrics[1]++;
    metrics[2] += elapsed;
    if (elapsed > metrics[3]) metrics[3] = elapsed;
    if (result) metrics[4]++;
    metrics[5] += count * (double)bytes;
    metrics[6] += ml_runtime_budget_yields() - yields;
    return result;
}
const double* ml_fec_metrics(void) { return metrics; }
