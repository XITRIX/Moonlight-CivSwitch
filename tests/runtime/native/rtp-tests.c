#include <stdint.h>
/* Exercise the same expression as upstream's packet queue in the actual artifact. */
double ml_test_rtp_timestamp(uint32_t timestamp) {
    return (double)(((uint64_t)timestamp * 1000) / 90);
}
