/* Per-session keyed GCM state; the pinned upstream replay policy stays intact.
   The low-level Mbed TLS API resets message state for each supplied nonce. */
#include <mbedtls/gcm.h>
typedef struct CachedGcm {
    PPLT_CRYPTO_CONTEXT owner;
    mbedtls_gcm_context cipher;
    struct CachedGcm* next;
} CachedGcm;
static CachedGcm* cached_gcm;
static int gcm_cache_enabled=1;
int ml_gcm_cache_mode(int enabled) {int before=gcm_cache_enabled;gcm_cache_enabled=enabled;return before;}
int ml_gcm_cache_count(void) {int count=0;for(CachedGcm* p=cached_gcm;p;p=p->next)count++;return count;}
static mbedtls_gcm_context* cachedGcm(PPLT_CRYPTO_CONTEXT owner,const unsigned char* key) {
    for(CachedGcm* p=cached_gcm;p;p=p->next)if(p->owner==owner)return &p->cipher;
    CachedGcm* p=calloc(1,sizeof(*p));if(!p)return NULL;
    mbedtls_gcm_init(&p->cipher);
    if(mbedtls_gcm_setkey(&p->cipher,MBEDTLS_CIPHER_ID_AES,key,128)){
        mbedtls_gcm_free(&p->cipher);free(p);return NULL;
    }
    p->owner=owner;p->next=cached_gcm;cached_gcm=p;return &p->cipher;
}
static void releaseCachedGcm(PPLT_CRYPTO_CONTEXT owner) {
    CachedGcm** link=&cached_gcm;
    while(*link){CachedGcm* p=*link;if(p->owner==owner){*link=p->next;mbedtls_gcm_free(&p->cipher);free(p);return;}link=&p->next;}
}
