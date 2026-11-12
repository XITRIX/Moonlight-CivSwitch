"""Retain keyed Mbed TLS GCM state in a checked copy of upstream crypto.

The PSA fallback, CBC implementation and replay-window code remain unchanged.
Only the protocol's AES-128 / 12-byte nonce / 16-byte tag path is accelerated.
"""
import hashlib
SOURCE_SHA256='ac368e4ccf336d091d9d43de9cebe5826c902b48d3f753a6ff3fae8ab39ac044'
MARKER='#ifdef USE_PSA_CRYPTO\n    if (algorithm == ALGORITHM_AES_GCM) {'
ENCRYPT='''#ifdef USE_PSA_CRYPTO
    if (algorithm == ALGORITHM_AES_GCM && gcm_cache_enabled && keyLength == 16 && ivLength == 12 && tagLength == 16) {
        if(inputDataLength<0)return false;
        mbedtls_gcm_context* cipher=cachedGcm(ctx,key);
        if(!cipher||mbedtls_gcm_crypt_and_tag(cipher,MBEDTLS_GCM_ENCRYPT,inputDataLength,iv,ivLength,NULL,0,inputData,outputData,tagLength,tag))return false;
        *outputDataLength=inputDataLength;return true;
    }
    if (algorithm == ALGORITHM_AES_GCM) {'''
DECRYPT='''#ifdef USE_PSA_CRYPTO
    if (algorithm == ALGORITHM_AES_GCM && gcm_cache_enabled && keyLength == 16 && ivLength == 12 && tagLength == 16) {
        if(inputDataLength<0)return false;
        mbedtls_gcm_context* cipher=cachedGcm(ctx,key);
        if(!cipher||mbedtls_gcm_auth_decrypt(cipher,inputDataLength,iv,ivLength,NULL,0,tag,tagLength,inputData,outputData))return false;
        recordSuccessfulAuthenticatedDecryption(ctx,flags,replayWindowIndex,sequenceNumber);
        *outputDataLength=inputDataLength;return true;
    }
    if (algorithm == ALGORITHM_AES_GCM) {'''
def specialize(source):
    if hashlib.sha256(source.encode()).hexdigest()!=SOURCE_SHA256 or source.count(MARKER)!=2:
        raise ValueError('Pinned PlatformCrypto.c changed; review cache and replay semantics')
    source=source.replace('#include "Limelight-internal.h"','#include "Limelight-internal.h"\n#include "gcm-cache.h"',1)
    source=source.replace(MARKER,ENCRYPT,1)
    # The replacement itself contains a shorter matching marker; partition at
    # the decrypt function so the original encrypt fallback is never rewritten.
    begin=source.index('bool PltDecryptMessage(')
    source=source[:begin]+source[begin:].replace(MARKER,DECRYPT,1)
    begin=source.index('void PltDestroyCryptoContext(')
    source=source[:begin]+source[begin:].replace('    free(ctx);','    releaseCachedGcm(ctx);\n    free(ctx);',1)
    return source
