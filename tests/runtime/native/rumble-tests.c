/* Compile the production session unit, replacing only its platform/core peers. */
#include "../../../app/native/session.c"
#undef NDEBUG
#include <assert.h>

static CONNECTION_LISTENER_CALLBACKS captured_listener;
static int task_count,arrival_count,controller_events,received_rumble[3];
static uint32_t arrival_buttons;
static uint16_t arrival_capabilities;
static uint32_t host_features=LI_FF_PEN_TOUCH_EVENTS;
static PointerInput delivered[1024];
static unsigned delivered_count;

int ml_runtime_tasks(void) { return task_count; }
void ml_runtime_checkpoint(void) {}
void ml_runtime_wake_input(void) {}
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
uint32_t LiGetHostFeatureFlags(void) { return host_features; }
int LiSendMouseMoveEvent(short x,short y) { delivered[delivered_count++]=(PointerInput){.kind=POINTER_MOVE,.dx=x,.dy=y};return 0; }
int LiSendHighResScrollEvent(short y) { delivered[delivered_count++]=(PointerInput){.kind=POINTER_SCROLL,.dy=y};return 0; }
int LiSendHighResHScrollEvent(short x) { delivered[delivered_count++]=(PointerInput){.kind=POINTER_SCROLL,.dx=x};return 0; }
int LiSendMouseButtonEvent(char action,int button) { delivered[delivered_count++]=(PointerInput){.kind=POINTER_BUTTON,.action=action,.id=button};return 0; }
int LiSendTouchEvent(uint8_t action,uint32_t id,float x,float y,float pressure,float major,float minor,uint16_t rotation) {
    assert(pressure==0&&major==0&&minor==0&&rotation==LI_ROT_UNKNOWN);
    delivered[delivered_count++]=(PointerInput){.kind=POINTER_TOUCH,.action=action,.id=id,.x=x,.y=y};return 0;
}
void LiStopConnection(void) {}
static void pointer_tests(void) {
    assert(ml_session_mouse_move(1,2)==-1);state=2;
    state=0;assert(ml_session_mouse_scroll(0,120)==-1);state=2;
    assert(ml_session_mouse_scroll(32768,0)==-3&&ml_session_mouse_scroll(0,-32769)==-3);
    assert(ml_session_mouse_move(32768,0)==-3&&ml_session_mouse_button(2,1)==-3);
    assert(ml_session_touch(1,7,NAN,0)==-3&&ml_session_touch(1,7,0,1.1f)==-3);
    host_features=0;assert(!ml_session_touch_supported()&&ml_session_touch(1,7,0,0)==LI_ERR_UNSUPPORTED);host_features=1;
    assert(ml_session_mouse_move(2,3)==0&&ml_session_mouse_move(4,-1)==0);
    assert(ml_session_mouse_button(BUTTON_LEFT,1)==0&&ml_session_mouse_move(5,6)==0);
    assert(ml_session_mouse_button(BUTTON_LEFT,0)==0);
    assert(ml_session_touch(1,7,.25f,.5f)==0&&ml_session_touch(3,7,.3f,.6f)==0&&ml_session_touch(3,7,.4f,.7f)==0&&ml_session_touch(2,7,.4f,.7f)==0);
    assert(delivered_count==0);dispatch_pointer();assert(delivered_count==7);
    assert(delivered[0].dx==6&&delivered[0].dy==2);
    assert(delivered[1].action==BUTTON_ACTION_PRESS&&delivered[2].dx==5&&delivered[3].action==BUTTON_ACTION_RELEASE);
    assert(delivered[4].action==1&&delivered[4].id==7&&delivered[5].x==.4f&&delivered[6].action==2);
    assert(ml_session_mouse_scroll(0,20)==0&&ml_session_mouse_scroll(0,100)==0);
    assert(ml_session_mouse_scroll(0,-120)==0&&ml_session_mouse_scroll(45,0)==0);
    assert(delivered_count==7);dispatch_pointer();assert(delivered_count==10);
    assert(delivered[7].kind==POINTER_SCROLL&&delivered[7].dy==120&&delivered[8].dy==-120&&delivered[9].dx==45);
    assert(ml_session_mouse_scroll(32767,0)==0&&ml_session_mouse_scroll(1,0)==0);dispatch_pointer();
    assert(delivered_count==12&&delivered[10].dx==32767&&delivered[11].dx==1);
    assert(ml_session_mouse_button(BUTTON_LEFT,1)==0);dispatch_pointer();assert(mouse_buttons==1);
    for(unsigned i=0;i<POINTER_QUEUE;i++)assert(ml_session_mouse_button(BUTTON_RIGHT,i%2)==0);
    assert(ml_session_mouse_button(BUTTON_LEFT,0)==-2);
    unsigned before=delivered_count;assert(ml_session_pointer_reset()==0&&ml_session_mouse_move(1,0)==-2&&ml_session_mouse_scroll(0,120)==-2);dispatch_pointer();
    assert(delivered_count==before+2&&delivered[before].action==BUTTON_ACTION_RELEASE&&delivered[before+1].action==LI_TOUCH_EVENT_CANCEL_ALL);
    assert(ml_session_mouse_button(BUTTON_RIGHT,1)==0&&ml_session_touch(1,12,1,0)==0);dispatch_pointer();
    assert(ml_session_mouse_scroll(0,120)==0&&ml_session_mouse_button(BUTTON_LEFT,1)==0);before=delivered_count;stop_task(NULL);
    assert(state==0&&delivered_count==before+2&&delivered[before].id==BUTTON_RIGHT&&delivered[before+1].action==LI_TOUCH_EVENT_CANCEL_ALL);
}

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
    pointer_tests();
    return 0;
}
