/* Diagnostics execute the upstream algorithms, not JS replacements for them. */
#include "Limelight-internal.h"
#include "Rtsp.h"
#include "rs.h"
#include <mbedtls/entropy.h>
#include <errno.h>

void mbedtls_platform_zeroize(void* buffer,size_t length) {
    volatile unsigned char* bytes=buffer;
    while(length--)*bytes++=0;
}
int ml_test_zeroize(void) {
    unsigned char bytes[4098];
    const size_t sizes[]={0,1,15,16,17,256,4096};
    for(size_t i=0;i<sizeof(sizes)/sizeof(sizes[0]);i++){
        memset(bytes,0xa5,sizeof(bytes));mbedtls_platform_zeroize(bytes+1,sizes[i]);
        for(size_t j=0;j<sizeof(bytes);j++)if(bytes[j]!=(j>=1&&j<=sizes[i]?0:0xa5))return 1;
    }
    mbedtls_platform_zeroize(NULL,0);return 0;
}

extern int ml_random_fill(unsigned char* output, size_t length);

int mbedtls_hardware_poll(void* context, unsigned char* output, size_t length, size_t* written) {
    (void)context;
    *written = 0;
    if (ml_random_fill(output, length) != 0) return MBEDTLS_ERR_ENTROPY_SOURCE_FAILED;
    *written = length;
    return 0;
}

int ml_test_rtsp(void) {
    const char source[] = "RTSP/1.0 200 OK\r\nCSeq: 7\r\nSession: 12345678\r\nContent-Length: 4\r\n\r\ntest";
    RTSP_MESSAGE message;
    int result = parseRtspMessage(&message, (char*)source, sizeof(source) - 1);
    if (result) return 1;
    bool correct = message.type == TYPE_RESPONSE && message.message.response.statusCode == 200 &&
        message.sequenceNumber == 7 && message.payloadLength == 4 &&
        memcmp(message.payload, "test", 4) == 0 &&
        strcmp(getOptionContent(message.options, "Session"), "12345678") == 0;
    int serialized_length = 0;
    char* serialized = serializeRtspMessage(&message, &serialized_length);
    freeMessage(&message);
    if (!correct || !serialized) { free(serialized); return 2; }
    result = parseRtspMessage(&message, serialized, serialized_length);
    free(serialized);
    if (result) return 3;
    correct = message.sequenceNumber == 7 && message.payloadLength == 4;
    freeMessage(&message);
    if (!correct) return 4;
    const char malformed[] = "not RTSP\r\n\r\n";
    result = parseRtspMessage(&message, (char*)malformed, sizeof(malformed) - 1);
    if (result == 0) { freeMessage(&message); return 5; }
    return 0;
}

int ml_test_unaligned(void) {
    char bytes[64];
    for(int offset=0;offset<8;offset++){
        memset(bytes,0,sizeof(bytes));memcpy(bytes+offset,"HTTP/1.1 200 OK",15);
        if(strncmp(bytes+offset+9,"200",3))return offset+1;
        struct __attribute__((packed)) { unsigned char pad;uint32_t value; } value;
        value.pad=0;unsigned char expected[]={0x12,0x34,0x56,0x78};memcpy((char*)&value+1,expected,4);
        if(value.value!=0x78563412)return 20;
    }
    return 0;
}
int ml_compare_runtime(const char* a,const char* b,int n) { return strncmp(a,b,n); }

int ml_test_fec(void) {
    enum { DATA = 3, PARITY = 2, BYTES = 1024 };
    unsigned char storage[DATA + PARITY][BYTES];
    unsigned char original[DATA][BYTES];
    unsigned char* shards[DATA + PARITY];
    unsigned char missing[DATA + PARITY] = {0};
    for (int i = 0; i < DATA + PARITY; ++i) {
        shards[i] = storage[i];
        for (int j = 0; j < BYTES; ++j) storage[i][j] = (unsigned char)(i * 61 + j * 17);
    }
    memcpy(original, storage, sizeof(original));
    reed_solomon* codec = reed_solomon_new(DATA, PARITY);
    if (!codec) return 1;
    int result = reed_solomon_encode(codec, shards, DATA + PARITY, BYTES);
    if (result) { reed_solomon_release(codec); return 2; }
    memset(storage[0], 0, BYTES); missing[0] = 1;
    memset(storage[2], 0, BYTES); missing[2] = 1;
    result = reed_solomon_decode(codec, shards, missing, DATA + PARITY, BYTES);
    reed_solomon_release(codec);
    if (result) return 3;
    return memcmp(storage, original, sizeof(original)) == 0 ? 0 : 4;
}

int ml_test_crypto(void) {
    unsigned char key[16] = {0}, iv[12] = {0}, plaintext[16] = {0};
    const unsigned char expected_cipher[16] = {0x03,0x88,0xda,0xce,0x60,0xb6,0xa3,0x92,0xf3,0x28,0xc2,0xb9,0x71,0xb2,0xfe,0x78};
    const unsigned char expected_tag[16] = {0xab,0x6e,0x47,0xd4,0x2c,0xec,0x13,0xbd,0xf5,0x3a,0x67,0xb2,0x12,0x57,0xbd,0xdf};
    unsigned char ciphertext[32], tag[16], decoded[32];
    int length = 0, result = 0;
    PPLT_CRYPTO_CONTEXT encrypt = PltCreateCryptoContext(0), decrypt = PltCreateCryptoContext(1);
    if (!encrypt || !decrypt) { result = 1; goto cleanup; }
    if (!PltEncryptMessage(encrypt, ALGORITHM_AES_GCM, 0, key, 16, iv, 12, tag, 16,
                          plaintext, 16, ciphertext, &length)) { result = 2; goto cleanup; }
    if (length != 16 || memcmp(ciphertext, expected_cipher, 16) || memcmp(tag, expected_tag, 16)) { result = 3; goto cleanup; }
    if (!PltDecryptMessage(decrypt, ALGORITHM_AES_GCM, 0, 0, 7, key, 16, iv, 12, tag, 16,
                          ciphertext, 16, decoded, &length) || length != 16 || memcmp(decoded, plaintext, 16)) { result = 4; goto cleanup; }
    if (PltDecryptMessage(decrypt, ALGORITHM_AES_GCM, 0, 0, 7, key, 16, iv, 12, tag, 16,
                         ciphertext, 16, decoded, &length)) { result = 5; goto cleanup; }
    tag[0] ^= 1;
    if (PltDecryptMessage(decrypt, ALGORITHM_AES_GCM, 0, 0, 8, key, 16, iv, 12, tag, 16,
                         ciphertext, 16, decoded, &length)) result = 6;
cleanup:
    PltDestroyCryptoContext(encrypt); PltDestroyCryptoContext(decrypt);
    return result;
}

static void thread_probe(void* value) { ++*(int*)value; }
int ml_probe_threads(void) {
    PLT_THREAD thread;
    int executed = 0;
    int result = PltCreateThread("wasm2js-probe", thread_probe, &executed, &thread);
    if (result) return result;
    PltJoinThread(&thread);
    return executed == 1 ? 0 : -1;
}

int ml_random_probe(unsigned char* output, int length) {
    if (length < 1 || length > 4096) return -1;
    return ml_random_fill(output, (size_t)length);
}
