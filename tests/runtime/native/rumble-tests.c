/* Compile the production session unit, replacing only its platform/core peers. */
#include "../../../app/native/session.c"
#undef NDEBUG
#include <assert.h>

static CONNECTION_LISTENER_CALLBACKS captured_listener;
static int task_count,arrival_count,controller_events,received_rumble[3];
static uint32_t arrival_buttons;
static uint16_t arrival_capabilities;

int ml_runtime_tasks(void) { return task_count; }
void ml_runtime_checkpoint(void) {}
int ml_spawn_input_task(ML_TASK_ENTRY entry,void* context) { return 0; }
void ml_log(const char* text) {}
void ml_event(int event,int a,int b) {}
void ml_rumble(int controller,int low,int high) { received_rumble[0]=controller;received_rumble[1]=low;received_rumble[2]=high; }
bool isReferenceFrameInvalidationEnabled(void) { return false; }
uint64_t PltGetMicroseconds(void) { return 0; }
void PltSleepMs(int ms) { state=0; }
void LiInitializeConnectionCallbacks(PCONNECTION_LISTENER_CALLBACKS callbacks) { memset(callbacks,0,sizeof(*callbacks)); }
void LiInitializeVideoCallbacks(PDECODER_RENDERER_CALLBACKS callbacks) { memset(callbacks,0,sizeof(*callbacks)); }
void LiInitializeAudioCallbacks(PAUDIO_RENDERER_CALLBACKS callbacks) { memset(callbacks,0,sizeof(*callbacks)); }
int LiStartConnection(PSERVER_INFORMATION server,PSTREAM_CONFIGURATION config,PCONNECTION_LISTENER_CALLBACKS listener,
    PDECODER_RENDERER_CALLBACKS video,PAUDIO_RENDERER_CALLBACKS audio,void* render_context,int render_flags,void* audio_context,int audio_flags) {
    captured_listener=*listener;return 0;
}
int ml_video_setup(int format,int width,int height,int fps) { return 0; }
int ml_video_frame(const void* bytes,int length,int kind,double pts,const void* sps,int sps_length,const void* pps,int pps_length) { return 0; }
int ml_audio_setup(int rate,int channels,int streams,int coupled,int samples) { return 0; }
void ml_audio_frame(const void* data,int length) {}
int LiSendControllerArrivalEvent(uint8_t controller,uint16_t mask,uint8_t type,uint32_t buttons,uint16_t capabilities) {
    assert(controller==0&&mask==1&&type==LI_CTYPE_XBOX);
    arrival_count++;arrival_buttons=buttons;arrival_capabilities=capabilities;return 0;
}
int LiSendMultiControllerEvent(short controller,short mask,int buttons,unsigned char lt,unsigned char rt,short lx,short ly,short rx,short ry) {
    controller_events++;return 0;
}
int LiSendKeyboardEvent(short key,char action,char modifiers) { return 0; }

int main(void) {
    /* Existing callers provide no rumble configuration. */
    start_task(NULL);assert(captured_listener.rumble==NULL);
    state=2;input_task(NULL);
    assert(arrival_count==1&&controller_events==0);
    assert(arrival_buttons==0xf3ff&&arrival_capabilities==LI_CCAP_ANALOG_TRIGGERS);
    assert(ml_session_set_rumble(-1)==-1&&ml_session_set_rumble(2)==-1);
    task_count=1;assert(ml_session_set_rumble(1)==-1);task_count=0;
    assert(ml_session_set_rumble(1)==0);start_task(NULL);
    assert(captured_listener.rumble!=NULL);
    captured_listener.rumble(0,1,65535);
    assert(received_rumble[0]==0&&received_rumble[1]==1&&received_rumble[2]==65535);
    captured_listener.rumble(15,65535,0);
    assert(received_rumble[0]==15&&received_rumble[1]==65535&&received_rumble[2]==0);
    state=2;input_task(NULL);
    assert(arrival_count==2&&controller_events==0);
    assert(arrival_buttons==0xf3ff&&arrival_capabilities==(LI_CCAP_ANALOG_TRIGGERS|LI_CCAP_RUMBLE));
    assert(ml_session_set_rumble(0)==0);start_task(NULL);assert(captured_listener.rumble==NULL);
    return 0;
}
