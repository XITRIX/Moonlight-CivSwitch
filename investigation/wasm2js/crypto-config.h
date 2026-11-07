/* Real Mbed TLS/PSA cryptography; entropy must come from a secure host provider. */
#define MBEDTLS_NO_PLATFORM_ENTROPY
#define MBEDTLS_ENTROPY_HARDWARE_ALT
#undef MBEDTLS_FS_IO
#undef MBEDTLS_ENTROPY_NV_SEED
#undef MBEDTLS_PSA_ITS_FILE_C
#undef MBEDTLS_PSA_CRYPTO_STORAGE_C
