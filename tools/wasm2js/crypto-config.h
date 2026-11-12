/* Real Mbed TLS/PSA cryptography; entropy must come from a secure host provider. */
#define MBEDTLS_NO_PLATFORM_ENTROPY
#define MBEDTLS_ENTROPY_HARDWARE_ALT
/* Reused GCM contexts amortize the 4 KiB table over control/input packets. */
#define MBEDTLS_GCM_LARGE_TABLE
/* A direct volatile wipe avoids an indirect call that falsely makes pure
   crypto kernels appear capable of suspending the cooperative C stack. */
#define MBEDTLS_PLATFORM_ZEROIZE_ALT
/* Select the pinned library's direct block-cipher dispatch for GCM/CCM.
   The generic cipher API remains enabled for the original PSA/CBC paths. */
#define MBEDTLS_BLOCK_CIPHER_C
#undef MBEDTLS_FS_IO
#undef MBEDTLS_ENTROPY_NV_SEED
#undef MBEDTLS_PSA_ITS_FILE_C
#undef MBEDTLS_PSA_CRYPTO_STORAGE_C
