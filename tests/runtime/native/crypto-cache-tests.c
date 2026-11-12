#include "Limelight-internal.h"
#include "runtime.h"
#include <emscripten.h>
extern int ml_gcm_cache_mode(int);
extern int ml_gcm_cache_count(void);
static unsigned char fixture[528];

const unsigned char* ml_crypto_cache_fixture(int length,int seed) {
    if(ml_runtime_tasks()||length<0||length>512||seed<0)return NULL;
    unsigned char key[16],iv[12],input[512],decoded[512],tag[16];
    for(int i=0;i<16;i++)key[i]=i;
    PPLT_CRYPTO_CONTEXT enc=PltCreateCryptoContext(0),dec=PltCreateCryptoContext(1);
    int before=ml_gcm_cache_count(),ok=0;
    if(!enc||!dec)goto done;
    for(unsigned turn=0;turn<8;turn++){
        unsigned nonce=(unsigned)seed*8+turn;int out=0;
        for(int i=0;i<12;i++)iv[i]=i;
        memcpy(iv,&nonce,sizeof(nonce));
        for(int i=0;i<length;i++)input[i]=(unsigned char)(i*17+nonce);
        /* Control packets encrypt in place. Exercise that exact aliasing as
           well as separate buffers against the independent host oracle. */
        if(turn==7)memcpy(fixture,input,length);
        if(!PltEncryptMessage(enc,ALGORITHM_AES_GCM,0,key,16,iv,12,tag,16,turn==7?fixture:input,length,fixture,&out)||out!=length)goto done;
        tag[0]^=1;
        if(PltDecryptMessage(dec,ALGORITHM_AES_GCM,0,0,turn,key,16,iv,12,tag,16,fixture,length,decoded,&out))goto done;
        tag[0]^=1;
        if(turn==7)memcpy(decoded,fixture,length);
        if(!PltDecryptMessage(dec,ALGORITHM_AES_GCM,0,0,turn,key,16,iv,12,tag,16,turn==7?decoded:fixture,length,decoded,&out)||out!=length||memcmp(input,decoded,length))goto done;
        if(PltDecryptMessage(dec,ALGORITHM_AES_GCM,0,0,turn,key,16,iv,12,tag,16,fixture,length,decoded,&out))goto done;
        memcpy(fixture+length,tag,16);
    }
    ok=1;
done:
    PltDestroyCryptoContext(enc);PltDestroyCryptoContext(dec);
    return ok&&ml_gcm_cache_count()==before?fixture:NULL;
}

double ml_crypto_cache_benchmark(int count,int cached) {
    if(ml_runtime_tasks()||count<1||count>2000||(cached!=0&&cached!=1))return -1;
    unsigned char key[16]={0},iv[12]={0},input[64]={0},output[64],tag[16];
    int before=ml_gcm_cache_count(),previous=ml_gcm_cache_mode(cached),ok=1;
    PPLT_CRYPTO_CONTEXT enc=PltCreateCryptoContext(0);
    double begin=emscripten_get_now();
    if(!enc)ok=0;
    for(unsigned i=0;ok&&i<(unsigned)count;i++){
        int length=0;memcpy(iv,&i,sizeof(i));
        if(!PltEncryptMessage(enc,ALGORITHM_AES_GCM,0,key,16,iv,12,tag,16,input,sizeof(input),output,&length)||length!=sizeof(input))ok=0;
    }
    double elapsed=emscripten_get_now()-begin;
    PltDestroyCryptoContext(enc);ml_gcm_cache_mode(previous);
    return ok&&ml_gcm_cache_count()==before?elapsed:-2;
}
