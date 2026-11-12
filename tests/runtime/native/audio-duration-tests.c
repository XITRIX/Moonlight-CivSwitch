/* Execute the exact adapted SDP duration block, including legacy/HQ branches. */
#include "Limelight-internal.h"
static int durationAttribute(int* head,const char* key,const char* value) {return 0;}
#define addAttributeString durationAttribute
#include "audio-duration-fixture.h"
#undef addAttributeString
int ml_test_audio_duration(void) {
    int arbitrary=CAPABILITY_SUPPORTS_ARBITRARY_AUDIO_DURATION;
    if(durationPolicy(7,120,40000,arbitrary,2,1)!=10)return 1;
    if(durationPolicy(7,60,40000,arbitrary,2,1)!=5)return 2;
    if(durationPolicy(7,120,40000,0,2,1)!=5)return 3;
    if(durationPolicy(6,120,40000,arbitrary,2,1)!=5)return 4;
    if(durationPolicy(7,120,40000,arbitrary,6,1)!=5)return 5;
    if(durationPolicy(7,60,2000,arbitrary,2,1)!=10)return 6;
    if(durationPolicy(7,60,40000,CAPABILITY_SLOW_OPUS_DECODER,2,1)!=10)return 7;
    return 0;
}
