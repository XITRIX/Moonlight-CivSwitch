#include "Limelight-internal.h"
#include "runtime.h"
#include <stdarg.h>
#include <math.h>

extern void ml_log(const char* text);
extern void ml_event(int event,int a,int b);
extern void ml_rumble(int controller,int low,int high);
extern int ml_video_setup(int format,int width,int height,int fps);
extern int ml_video_frame(const void* bytes,int length,int kind,double pts,const void* sps,int sps_length,const void* pps,int pps_length);
extern int ml_audio_setup(int rate,int channels,int streams,int coupled,int samples);
extern void ml_audio_frame(const void* data,int length);
static SERVER_INFORMATION server;
static STREAM_CONFIGURATION config;
static char address[64],version[64],url[1024];
static int state,error_code,video_frames,audio_frames;
static unsigned char* video_bytes;
static size_t video_capacity;
static int scheduler_test_result;
static double frame_samples,receive_ms,receive_max_ms,queue_ms,queue_max_ms,host_samples,host_ms,host_max_ms;
static double frame_gaps,decoder_rejected;
static uint32_t last_frame;
static bool have_last_frame;
static int reference_recovery;
static int rumble_enabled;
static int requested_video_format=VIDEO_FORMAT_H264;
int ml_session_set_video_format(int format) {
    if(ml_runtime_tasks()||(format!=VIDEO_FORMAT_H264&&format!=VIDEO_FORMAT_AV1_MAIN8))return -1;
    requested_video_format=format;return 0;
}
int ml_session_set_rumble(int enabled) {
    if(ml_runtime_tasks()||(enabled!=0&&enabled!=1))return -1;
    rumble_enabled=enabled;return 0;
}
int ml_session_reference_recovery(void) {return isReferenceFrameInvalidationEnabled();}
int ml_session_set_reference_recovery(int enabled) {
    if(ml_runtime_tasks()||(enabled!=0&&enabled!=1))return -1;
    reference_recovery=enabled;return 0;
}
static void input_task(void* ignored);
static int input_pending,input_buttons,input_lt,input_rt,input_lx,input_ly,input_rx,input_ry;
static struct { short code;char action,modifiers; } keys[64];
static unsigned int keys_read,keys_write;
static unsigned char keys_down[256];
static int keys_reset;
static int modifier_key(int code) {return code==16||code==17||code==18||code==91||code==92||(code>=160&&code<=165);}
static int release_keys(void) {
    int pending=0;
    for(int pass=0;pass<2;pass++)for(int code=0;code<256;code++)if(keys_down[code]&&modifier_key(code)==pass){
        int modifiers=keys_down[code]&MODIFIER_EXTENDED;
        if(!LiSendKeyboardEvent(code,KEY_ACTION_UP,modifiers))keys_down[code]=0;
        else pending=1;
    }
    return pending;
}
static void dispatch_keys(void) {
    if(keys_reset){keys_reset=release_keys();if(keys_reset)return;}
    for(unsigned count=0;state==2&&count<64&&keys_read!=keys_write;count++){
        typeof(keys[0]) key=keys[keys_read++%64];
        int result=LiSendKeyboardEvent(key.code,key.action,key.modifiers);
        if(!result)keys_down[key.code]=key.action==KEY_ACTION_DOWN?1|(key.modifiers&MODIFIER_EXTENDED):0;
        ml_runtime_checkpoint();if(keys_reset)break;
    }
}
enum { POINTER_MOVE=1, POINTER_BUTTON, POINTER_TOUCH, POINTER_SCROLL, POINTER_QUEUE=256 };
typedef struct { int kind,action;uint32_t id;int dx,dy;float x,y; } PointerInput;
static PointerInput pointer_queue[POINTER_QUEUE];
static unsigned pointer_read,pointer_write;
static int pointer_reset,mouse_buttons,touch_dirty;
static void release_pointer(void) {
    int buttons=mouse_buttons,dirty=touch_dirty;mouse_buttons=touch_dirty=0;
    if(buttons&1)LiSendMouseButtonEvent(BUTTON_ACTION_RELEASE,BUTTON_LEFT);
    if(buttons&2)LiSendMouseButtonEvent(BUTTON_ACTION_RELEASE,BUTTON_RIGHT);
    if(dirty)LiSendTouchEvent(LI_TOUCH_EVENT_CANCEL_ALL,0,0,0,0,0,0,LI_ROT_UNKNOWN);
}
static int queue_pointer(PointerInput event) {
    if(state!=2)return -1;
    if(pointer_reset)return -2;
    if(pointer_write!=pointer_read){
        PointerInput* last=&pointer_queue[(pointer_write-1)%POINTER_QUEUE];
        if(event.kind==POINTER_MOVE&&last->kind==POINTER_MOVE&&
           last->dx+event.dx>=-32768&&last->dx+event.dx<=32767&&last->dy+event.dy>=-32768&&last->dy+event.dy<=32767){last->dx+=event.dx;last->dy+=event.dy;ml_runtime_wake_input();return 0;}
        if(event.kind==POINTER_TOUCH&&event.action==LI_TOUCH_EVENT_MOVE&&last->kind==POINTER_TOUCH&&last->action==event.action&&last->id==event.id){*last=event;ml_runtime_wake_input();return 0;}
        if(event.kind==POINTER_SCROLL&&last->kind==POINTER_SCROLL&&last->dx*event.dx>=0&&last->dy*event.dy>=0&&
           last->dx+event.dx>=-32768&&last->dx+event.dx<=32767&&last->dy+event.dy>=-32768&&last->dy+event.dy<=32767){last->dx+=event.dx;last->dy+=event.dy;ml_runtime_wake_input();return 0;}
    }
    if(pointer_write-pointer_read>=POINTER_QUEUE)return -2;
    pointer_queue[pointer_write++%POINTER_QUEUE]=event;ml_runtime_wake_input();return 0;
}
static void dispatch_pointer(void) {
    if(pointer_reset){pointer_reset=0;release_pointer();}
    for(unsigned count=0;state==2&&count<32&&pointer_read!=pointer_write;count++){
        PointerInput e=pointer_queue[pointer_read++%POINTER_QUEUE];int result;
        if(e.kind==POINTER_MOVE)LiSendMouseMoveEvent(e.dx,e.dy);
        else if(e.kind==POINTER_SCROLL){if(e.dy)LiSendHighResScrollEvent(e.dy);if(e.dx)LiSendHighResHScrollEvent(e.dx);}
        else if(e.kind==POINTER_BUTTON){
            result=LiSendMouseButtonEvent(e.action?BUTTON_ACTION_PRESS:BUTTON_ACTION_RELEASE,e.id);
            if(!result){int bit=e.id==BUTTON_LEFT?1:2;if(e.action)mouse_buttons|=bit;else mouse_buttons&=~bit;}
        }else {result=LiSendTouchEvent(e.action,e.id,e.x,e.y,0,0,0,LI_ROT_UNKNOWN);if(!result&&e.action==LI_TOUCH_EVENT_DOWN)touch_dirty=1;}
        ml_runtime_checkpoint();if(pointer_reset)break;
    }
}

static void logger(const char* format,...) { char text[1024];va_list args;va_start(args,format);vsnprintf(text,sizeof(text),format,args);va_end(args);ml_log(text); }
static void stage_start(int stage) { ml_event(1,stage,0); }
static void stage_complete(int stage) { ml_event(2,stage,0); }
static void stage_failed(int stage,int code) { error_code=code;ml_event(3,stage,code); }
static void connected(void) { state=2;logger("Reference recovery negotiated: %d\n",isReferenceFrameInvalidationEnabled());ml_spawn_input_task(input_task,NULL);ml_event(4,0,0); }
static void terminated(int code) { if(state==4)return;error_code=code;state=3;ml_event(5,code,0); }
static void rumble(unsigned short controller,unsigned short low,unsigned short high) { ml_rumble(controller,low,high); }
static int video_setup(int format,int width,int height,int fps,void* context,int flags) { (void)context;(void)flags;return ml_video_setup(format,width,height,fps); }
static int video_submit(PDECODE_UNIT unit) {
    ml_runtime_checkpoint();
    if(unit->fullLength<=0||unit->fullLength>2097152)return DR_NEED_IDR;
    uint32_t frame=(uint32_t)unit->frameNumber,advance=frame-last_frame;
    if(have_last_frame&&advance>0&&advance<0x80000000u){if(advance>1)frame_gaps+=advance-1;last_frame=frame;}
    if(!have_last_frame){last_frame=frame;have_last_frame=true;}
    uint64_t now=PltGetMicroseconds();
    double receive=unit->enqueueTimeUs>=unit->receiveTimeUs?(unit->enqueueTimeUs-unit->receiveTimeUs)/1000.0:0;
    double queued=now>=unit->enqueueTimeUs?(now-unit->enqueueTimeUs)/1000.0:0;
    frame_samples++;receive_ms+=receive;if(receive>receive_max_ms)receive_max_ms=receive;
    queue_ms+=queued;if(queued>queue_max_ms)queue_max_ms=queued;
    if(unit->frameHostProcessingLatency){double host=unit->frameHostProcessingLatency/10.0;host_samples++;host_ms+=host;if(host>host_max_ms)host_max_ms=host;}
    if((size_t)unit->fullLength>video_capacity){void* p=realloc(video_bytes,unit->fullLength);if(!p)return DR_NEED_IDR;video_bytes=p;video_capacity=unit->fullLength;}
    const void* sps=NULL;const void* pps=NULL;int sps_size=0,pps_size=0,total=0,entries=0;
    for(PLENTRY entry=unit->bufferList;entry;entry=entry->next){
        if(++entries>4096||entry->length<1||entry->length>unit->fullLength-total)return DR_NEED_IDR;
        memcpy(video_bytes+total,entry->data,entry->length);
        if(entry->bufferType==BUFFER_TYPE_SPS){sps=video_bytes+total;sps_size=entry->length;}
        if(entry->bufferType==BUFFER_TYPE_PPS){pps=video_bytes+total;pps_size=entry->length;}
        total+=entry->length;
    }
    if(total!=unit->fullLength)return DR_NEED_IDR;
    int result=ml_video_frame(video_bytes,total,unit->frameType,(double)unit->presentationTimeUs,sps,sps_size,pps,pps_size);
    if(!result)video_frames++;else decoder_rejected++;
    return result==0?DR_OK:DR_NEED_IDR;
}
static int audio_setup(int audio_configuration,OPUS_MULTISTREAM_CONFIGURATION* opus,void* context,int flags) {
    (void)audio_configuration;(void)context;(void)flags;
    return ml_audio_setup(opus->sampleRate,opus->channelCount,opus->streams,opus->coupledStreams,opus->samplesPerFrame);
}
static void audio_submit(char* data,int length) { if(length>0&&length<65536){ml_runtime_checkpoint();ml_audio_frame(data,length);audio_frames++;} }
static void start_task(void* ignored) {
    (void)ignored;
    CONNECTION_LISTENER_CALLBACKS listener;DECODER_RENDERER_CALLBACKS video;AUDIO_RENDERER_CALLBACKS audio;
    LiInitializeConnectionCallbacks(&listener);LiInitializeVideoCallbacks(&video);LiInitializeAudioCallbacks(&audio);
    listener.stageStarting=stage_start;listener.stageComplete=stage_complete;listener.stageFailed=stage_failed;
    listener.connectionStarted=connected;listener.connectionTerminated=terminated;listener.logMessage=logger;
    if(rumble_enabled)listener.rumble=rumble;
    video.setup=video_setup;video.submitDecodeUnit=video_submit;video.capabilities=CAPABILITY_DIRECT_SUBMIT;
    if(reference_recovery&&requested_video_format==VIDEO_FORMAT_H264)video.capabilities|=CAPABILITY_REFERENCE_FRAME_INVALIDATION_AVC;
    audio.init=audio_setup;audio.decodeAndPlaySample=audio_submit;
    audio.capabilities=CAPABILITY_DIRECT_SUBMIT|CAPABILITY_SUPPORTS_ARBITRARY_AUDIO_DURATION;
    int result=LiStartConnection(&server,&config,&listener,&video,&audio,NULL,0,NULL,0);
    if(result){error_code=result;state=3;ml_event(6,result,0);}
}
int ml_session_start(const char* host,const char* app_version,const char* rtsp_url,const unsigned char* key,unsigned int key_id,
                     int width,int height,int fps,int bitrate,int codec_support) {
    if(state==1||state==2||ml_runtime_tasks())return -1;
    int av1=requested_video_format==VIDEO_FORMAT_AV1_MAIN8;
    if(width<64||height<64||width>(av1?3840:1920)||height>(av1?2160:1080)||fps<1||fps>120||(width>2560&&fps>60))return -2;
    if(!PltSafeStrcpy(address,sizeof(address),host)||!PltSafeStrcpy(version,sizeof(version),app_version)||!PltSafeStrcpy(url,sizeof(url),rtsp_url))return -3;
    LiInitializeServerInformation(&server);server.address=address;server.serverInfoAppVersion=version;server.rtspSessionUrl=url;server.serverCodecModeSupport=codec_support;
    LiInitializeStreamConfiguration(&config);config.width=width;config.height=height;config.fps=fps;config.bitrate=bitrate;
    // Keep 1392-byte payloads on LAN. The core detects public destinations and
    // caps remote IPv4 payloads at 1024 bytes to avoid Internet fragmentation.
    config.packetSize=1392;config.streamingRemotely=STREAM_CFG_AUTO;config.audioConfiguration=AUDIO_CONFIGURATION_STEREO;
    config.supportedVideoFormats=requested_video_format;config.encryptionFlags=0;config.clientRefreshRateX100=fps*100;
    memcpy(config.remoteInputAesKey,key,16);config.remoteInputAesIv[0]=key_id>>24;config.remoteInputAesIv[1]=key_id>>16;config.remoteInputAesIv[2]=key_id>>8;config.remoteInputAesIv[3]=key_id;
    state=1;error_code=video_frames=audio_frames=0;input_pending=0;keys_read=keys_write=0;keys_reset=0;memset(keys_down,0,sizeof(keys_down));
    pointer_read=pointer_write=0;pointer_reset=mouse_buttons=touch_dirty=0;
    frame_samples=receive_ms=receive_max_ms=queue_ms=queue_max_ms=host_samples=host_ms=host_max_ms=0;
    frame_gaps=decoder_rejected=0;have_last_frame=false;
    int result=ml_spawn_task(start_task,NULL);if(result)state=3;return result;
}
static void stop_task(void* ignored) {
    (void)ignored;
    // Only releases may pass during the short shutdown grace; pending presses
    // are discarded. The JS socket adapter bounds the time available to send.
    LiSendMultiControllerEvent(0,1,0,0,0,0,0,0,0);
    pointer_read=pointer_write;pointer_reset=0;release_pointer();
    keys_read=keys_write;keys_reset=0;release_keys();
    input_pending=0;LiStopConnection();state=0;free(video_bytes);video_bytes=NULL;video_capacity=0;ml_event(7,0,0);
}
void ml_session_stop(void) {
    if(state==1||state==2||state==3)LiInterruptConnection();
    if(state==1)return;
    if(state==2||state==3){state=4;ml_spawn_input_task(stop_task,NULL);}
}
int ml_session_state(void) { return state; }
int ml_session_error(void) { return error_code; }
int ml_session_video_frames(void) { return video_frames; }
int ml_session_audio_frames(void) { return audio_frames; }

/* Versioned, read-only snapshot; only call between pumps while connected.
   Queue APIs are deliberately omitted: both renderers use DIRECT_SUBMIT. */
const double* ml_session_metrics(void) {
    static double values[22];
    if(state!=2)return NULL;
    uint32_t rtt=0,variation=0;
    const RTP_VIDEO_STATS* video=LiGetRTPVideoStats();const RTP_AUDIO_STATS* audio=LiGetRTPAudioStats();
    values[0]=1;values[1]=frame_samples;values[2]=receive_ms;values[3]=receive_max_ms;
    values[4]=queue_ms;values[5]=queue_max_ms;values[6]=host_samples;values[7]=host_ms;values[8]=host_max_ms;
    values[9]=LiGetEstimatedRttInfo(&rtt,&variation);values[10]=rtt;values[11]=variation;
    values[12]=video->packetCountVideo;values[13]=video->packetCountFec;
    // This pinned core declares video recovery counters but never updates them.
    values[14]=values[15]=-1;
    values[16]=audio->packetCountAudio;values[17]=audio->packetCountFec;values[18]=audio->packetCountFecRecovered;values[19]=audio->packetCountFecFailed;
    values[20]=frame_gaps;values[21]=decoder_rejected;
    return values;
}

/* JS only queues state; upstream input APIs run on a cooperative C stack. */
int ml_session_gamepad(int buttons,int lt,int rt,int lx,int ly,int rx,int ry) {
    if(state!=2)return -1;
    if(lt<0||lt>255||rt<0||rt>255||lx<-32768||lx>32767||ly<-32768||ly>32767||rx<-32768||rx>32767||ry<-32768||ry>32767)return -2;
    input_buttons=buttons;input_lt=lt;input_rt=rt;input_lx=lx;input_ly=ly;input_rx=rx;input_ry=ry;input_pending=1;ml_runtime_wake_input();return 0;
}
int ml_session_key(int code,int down,int modifiers) {
    if(state!=2)return -1;if(code<0||code>255||modifiers<0||modifiers>31)return -3;if(keys_reset||keys_write-keys_read>=64)return -2;
    keys[keys_write++%64]=(typeof(keys[0])){code,down?KEY_ACTION_DOWN:KEY_ACTION_UP,modifiers};ml_runtime_wake_input();return 0;
}
int ml_session_keys_reset(void) {
    if(state!=2)return -1;
    keys_read=keys_write;keys_reset=1;ml_runtime_wake_input();return 0;
}
int ml_session_mouse_move(int dx,int dy) {
    if(dx<-32768||dx>32767||dy<-32768||dy>32767)return -3;
    return queue_pointer((PointerInput){.kind=POINTER_MOVE,.dx=dx,.dy=dy});
}
int ml_session_mouse_button(int button,int down) {
    if((button!=BUTTON_LEFT&&button!=BUTTON_RIGHT)||(down!=0&&down!=1))return -3;
    return queue_pointer((PointerInput){.kind=POINTER_BUTTON,.id=button,.action=down});
}
int ml_session_mouse_scroll(int horizontal,int vertical) {
    if(horizontal<-32768||horizontal>32767||vertical<-32768||vertical>32767)return -3;
    return queue_pointer((PointerInput){.kind=POINTER_SCROLL,.dx=horizontal,.dy=vertical});
}
int ml_session_touch_supported(void) { return state==2&&(LiGetHostFeatureFlags()&LI_FF_PEN_TOUCH_EVENTS)!=0; }
int ml_session_touch(int action,uint32_t id,float x,float y) {
    if(state!=2)return -1;
    if(!ml_session_touch_supported())return LI_ERR_UNSUPPORTED;
    if((action!=LI_TOUCH_EVENT_DOWN&&action!=LI_TOUCH_EVENT_UP&&action!=LI_TOUCH_EVENT_MOVE)||!isfinite(x)||!isfinite(y)||x<0||x>1||y<0||y>1)return -3;
    return queue_pointer((PointerInput){.kind=POINTER_TOUCH,.action=action,.id=id,.x=x,.y=y});
}
int ml_session_pointer_reset(void) {
    if(state!=2)return -1;
    pointer_read=pointer_write;pointer_reset=1;ml_runtime_wake_input();return 0;
}
static void input_task(void* ignored) {
    (void)ignored;
    // Our input adapter exposes the Xbox layout, with no guide or extra buttons.
    // Upstream falls back to an empty multi-controller event for older hosts.
    LiSendControllerArrivalEvent(0,1,LI_CTYPE_XBOX,
        A_FLAG|B_FLAG|X_FLAG|Y_FLAG|UP_FLAG|DOWN_FLAG|LEFT_FLAG|RIGHT_FLAG|
        LB_FLAG|RB_FLAG|PLAY_FLAG|BACK_FLAG|LS_CLK_FLAG|RS_CLK_FLAG,
        LI_CCAP_ANALOG_TRIGGERS|(rumble_enabled?LI_CCAP_RUMBLE:0));
    while(state==2){
        if(input_pending){input_pending=0;LiSendMultiControllerEvent(0,1,input_buttons,input_lt,input_rt,input_lx,input_ly,input_rx,input_ry);}
        dispatch_keys();
        dispatch_pointer();
        PltSleepMs(4);
    }
}

static PLT_EVENT test_event;
static PLT_MUTEX test_mutex;
static int test_counter;
static void test_worker(void* index) { PltWaitForEvent(&test_event);for(int i=0;i<5;i++){PltLockMutex(&test_mutex);test_counter++;PltUnlockMutex(&test_mutex);PltSleepMs(1);} }
static void test_scheduler(void* ignored) {
    (void)ignored;PLT_THREAD a,b;
    if(PltCreateEvent(&test_event)||PltCreateMutex(&test_mutex)){scheduler_test_result=-1;return;}
    int first=PltCreateThread("test-a",test_worker,NULL,&a),second=PltCreateThread("test-b",test_worker,NULL,&b);
    if(first||second){scheduler_test_result=-2;return;}
    PltSleepMs(2);PltSetEvent(&test_event);PltJoinThread(&a);PltJoinThread(&b);
    PltCloseEvent(&test_event);PltDeleteMutex(&test_mutex);scheduler_test_result=test_counter==10?42:-3;
}
int ml_scheduler_test_start(void) { if(ml_runtime_tasks())return -1;scheduler_test_result=test_counter=0;return ml_spawn_task(test_scheduler,NULL); }
int ml_scheduler_test_result(void) { return scheduler_test_result; }

static int budget_test_result;
static void budget_test_worker(void* ignored) {
    double until=LiGetMillis()+12;
    while(LiGetMillis()<until)ml_runtime_checkpoint();
    budget_test_result++;
}
int ml_budget_test_start(void) { if(ml_runtime_tasks())return -1;budget_test_result=0;return ml_spawn_task(budget_test_worker,NULL); }
int ml_budget_test_result(void) { return budget_test_result; }

static int input_priority_result;
static PLT_EVENT input_priority_event;
static PLT_THREAD input_priority_sender;
static PLT_THREAD input_priority_audio;
static void test_priority_dispatch(void* ignored) { input_priority_result=1;PltSetEvent(&input_priority_event); }
static void test_priority_send(void* ignored) { PltWaitForEvent(&input_priority_event);input_priority_result=input_priority_result*10+2; }
static void test_priority_audio(void* ignored) { input_priority_result=input_priority_result*10+3; }
static void test_priority_busy(void* ignored) {
    double until=LiGetMillis()+12;
    while(LiGetMillis()<until)ml_runtime_checkpoint();
    PltJoinThread(&input_priority_sender);PltCloseEvent(&input_priority_event);
    PltJoinThread(&input_priority_audio);
    input_priority_result=input_priority_result*10+4;
}
int ml_input_priority_test_start(void) {
    if(ml_runtime_tasks())return -1;input_priority_result=0;
    if(PltCreateEvent(&input_priority_event))return -2;
    if(ml_spawn_task(test_priority_busy,NULL)||PltCreateThread("InputSend",test_priority_send,NULL,&input_priority_sender)||PltCreateThread("AudioRecv",test_priority_audio,NULL,&input_priority_audio)||ml_spawn_input_task(test_priority_dispatch,NULL))return -3;
    return 0;
}
int ml_input_priority_test_result(void) { return input_priority_result; }

static int fairness_result;
static void test_priority_hog(void* ignored) {
    while(!fairness_result)ml_runtime_checkpoint();
}
static void test_normal_progress(void* ignored) {fairness_result=42;}
int ml_scheduler_fairness_test_start(void) {
    if(ml_runtime_tasks())return -1;fairness_result=0;
    return ml_spawn_input_task(test_priority_hog,NULL)||ml_spawn_task(test_normal_progress,NULL);
}
int ml_scheduler_fairness_test_result(void) {return fairness_result;}

static int input_wake_result;
static void test_input_sleeper(void* ignored) { (void)ignored;input_wake_result=1;PltSleepMs(60000);input_wake_result=2; }
static void test_input_waker(void* ignored) {
    (void)ignored;while(input_wake_result!=1)PltSleepMs(1);
    ml_runtime_wake_input();while(input_wake_result!=2)PltSleepMs(1);input_wake_result=42;
}
int ml_input_wake_test_start(void) {
    if(ml_runtime_tasks())return -1;input_wake_result=0;
    return ml_spawn_input_task(test_input_sleeper,NULL)||ml_spawn_task(test_input_waker,NULL);
}
int ml_input_wake_test_result(void) { return input_wake_result; }

static int interrupt_test_result;
static void test_sleeping_thread(void* ignored) { PltSleepMs(60000);interrupt_test_result=1; }
static void test_interrupt_driver(void* ignored) {
    PLT_THREAD sleeper;
    if(PltCreateThread("CancelTest",test_sleeping_thread,NULL,&sleeper)){interrupt_test_result=-1;return;}
    PltSleepMs(1);PltInterruptThread(&sleeper);PltJoinThread(&sleeper);
    interrupt_test_result=interrupt_test_result==1?42:-2;
}
int ml_interrupt_test_start(void) { if(ml_runtime_tasks())return -1;interrupt_test_result=0;return ml_spawn_task(test_interrupt_driver,NULL); }
int ml_interrupt_test_result(void) { return interrupt_test_result; }

static int network_result,network_port;
static char network_host[64];
static void network_test(void* ignored) {
    (void)ignored;struct sockaddr_storage remote;SOCKADDR_LEN remote_size=sizeof(remote);
    if(resolveHostName(network_host,AF_INET,0,&remote,&remote_size)){network_result=-1;return;}
    SOCKET fd=connectTcpSocket(&remote,remote_size,network_port,3);
    if(fd<0){network_result=-1000-LastSocketError();return;}
    setNonFatalRecvTimeoutMs(fd,1000);
    const char request[]="GET /serverinfo?uniqueid=moonlight-experiment HTTP/1.1\r\nHost: 192.168.1.4\r\nConnection: close\r\n\r\n";
    if(sendMtuSafe(fd,(char*)request,sizeof(request)-1)<0){network_result=-2000-LastSocketError();closeSocket(fd);return;}
    char reply[1024];int length=recv(fd,reply,sizeof(reply)-1,0);closeSocket(fd);
    if(length<12){network_result=-3000-LastSocketError();return;}reply[length]=0;
    int prefix=strncmp(reply,"HTTP/1.",7),status=strncmp(reply+9,"200",3);
    volatile const unsigned char* expected=(const unsigned char*)"200";
    logger("Native HTTP check: prefix=%d status=%d bytes=%u,%u,%u expected=%u,%u,%u length=%d",prefix,status,(unsigned char)reply[9],(unsigned char)reply[10],(unsigned char)reply[11],expected[0],expected[1],expected[2],length);
    if(prefix||status){char* end=strstr(reply,"\r\n");if(end)*end=0;ml_log(reply);network_result=-4;return;}
    SOCKET sender=socket(AF_INET,SOCK_DGRAM,0),receiver=socket(AF_INET,SOCK_DGRAM,0);
    if(sender<0||receiver<0){if(sender>=0)closeSocket(sender);if(receiver>=0)closeSocket(receiver);network_result=-5;return;}
    struct sockaddr_in loop={.sin_family=AF_INET};inet_pton(AF_INET,"127.0.0.1",&loop.sin_addr);socklen_t loop_size=sizeof(loop);
    setNonFatalRecvTimeoutMs(receiver,500);
    const char message[]="moonlight-generated-core-udp";char received[128];
    int result=bind(receiver,(struct sockaddr*)&loop,sizeof(loop));
    if(!result)result=getsockname(receiver,(struct sockaddr*)&loop,&loop_size);
    if(!result)result=sendto(sender,message,sizeof(message),0,(struct sockaddr*)&loop,loop_size)==sizeof(message)?0:-1;
    if(!result){length=recv(receiver,received,sizeof(received),0);result=length==sizeof(message)&&!memcmp(received,message,sizeof(message))?0:-1;}
    closeSocket(sender);closeSocket(receiver);network_result=result?-6000-LastSocketError():42;
}
int ml_network_test_start(const char* host,int port) { if(ml_runtime_tasks())return -1;if(!PltSafeStrcpy(network_host,sizeof(network_host),host))return -2;network_port=port;network_result=0;return ml_spawn_task(network_test,NULL); }
int ml_network_test_result(void) { return network_result; }
