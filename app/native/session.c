#include "Limelight-internal.h"
#include "runtime.h"
#include <stdarg.h>

extern void ml_log(const char* text);
extern void ml_event(int event,int a,int b);
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
static void input_task(void* ignored);
static int input_pending,input_buttons,input_lt,input_rt,input_lx,input_ly,input_rx,input_ry;
static struct { short code;char action,modifiers; } keys[64];
static unsigned int keys_read,keys_write;

static void logger(const char* format,...) { char text[1024];va_list args;va_start(args,format);vsnprintf(text,sizeof(text),format,args);va_end(args);ml_log(text); }
static void stage_start(int stage) { ml_event(1,stage,0); }
static void stage_complete(int stage) { ml_event(2,stage,0); }
static void stage_failed(int stage,int code) { error_code=code;ml_event(3,stage,code); }
static void connected(void) { state=2;ml_spawn_task(input_task,NULL);ml_event(4,0,0); }
static void terminated(int code) { if(state==4)return;error_code=code;state=3;ml_event(5,code,0); }
static int video_setup(int format,int width,int height,int fps,void* context,int flags) { (void)context;(void)flags;return ml_video_setup(format,width,height,fps); }
static int video_submit(PDECODE_UNIT unit) {
    if(unit->fullLength<=0||unit->fullLength>2097152)return DR_NEED_IDR;
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
    if(!result)video_frames++;
    return result==0?DR_OK:DR_NEED_IDR;
}
static int audio_setup(int audio_configuration,OPUS_MULTISTREAM_CONFIGURATION* opus,void* context,int flags) {
    (void)audio_configuration;(void)context;(void)flags;
    return ml_audio_setup(opus->sampleRate,opus->channelCount,opus->streams,opus->coupledStreams,opus->samplesPerFrame);
}
static void audio_submit(char* data,int length) { if(length>0&&length<65536){ml_audio_frame(data,length);audio_frames++;} }
static void start_task(void* ignored) {
    (void)ignored;
    CONNECTION_LISTENER_CALLBACKS listener;DECODER_RENDERER_CALLBACKS video;AUDIO_RENDERER_CALLBACKS audio;
    LiInitializeConnectionCallbacks(&listener);LiInitializeVideoCallbacks(&video);LiInitializeAudioCallbacks(&audio);
    listener.stageStarting=stage_start;listener.stageComplete=stage_complete;listener.stageFailed=stage_failed;
    listener.connectionStarted=connected;listener.connectionTerminated=terminated;listener.logMessage=logger;
    video.setup=video_setup;video.submitDecodeUnit=video_submit;video.capabilities=CAPABILITY_DIRECT_SUBMIT;
    audio.init=audio_setup;audio.decodeAndPlaySample=audio_submit;audio.capabilities=CAPABILITY_DIRECT_SUBMIT;
    int result=LiStartConnection(&server,&config,&listener,&video,&audio,NULL,0,NULL,0);
    if(result){error_code=result;state=3;ml_event(6,result,0);}
}
int ml_session_start(const char* host,const char* app_version,const char* rtsp_url,const unsigned char* key,unsigned int key_id,
                     int width,int height,int fps,int bitrate,int codec_support) {
    if(state==1||state==2||ml_runtime_tasks())return -1;
    if(width<64||height<64||width>1920||height>1080||fps<1||fps>60)return -2;
    if(!PltSafeStrcpy(address,sizeof(address),host)||!PltSafeStrcpy(version,sizeof(version),app_version)||!PltSafeStrcpy(url,sizeof(url),rtsp_url))return -3;
    LiInitializeServerInformation(&server);server.address=address;server.serverInfoAppVersion=version;server.rtspSessionUrl=url;server.serverCodecModeSupport=codec_support;
    LiInitializeStreamConfiguration(&config);config.width=width;config.height=height;config.fps=fps;config.bitrate=bitrate;
    config.packetSize=1024;config.streamingRemotely=STREAM_CFG_LOCAL;config.audioConfiguration=AUDIO_CONFIGURATION_STEREO;
    config.supportedVideoFormats=VIDEO_FORMAT_H264;config.encryptionFlags=0;config.clientRefreshRateX100=fps*100;
    memcpy(config.remoteInputAesKey,key,16);config.remoteInputAesIv[0]=key_id>>24;config.remoteInputAesIv[1]=key_id>>16;config.remoteInputAesIv[2]=key_id>>8;config.remoteInputAesIv[3]=key_id;
    state=1;error_code=video_frames=audio_frames=0;input_pending=0;keys_read=keys_write=0;
    int result=ml_spawn_task(start_task,NULL);if(result)state=3;return result;
}
static void stop_task(void* ignored) { (void)ignored;LiStopConnection();state=0;free(video_bytes);video_bytes=NULL;video_capacity=0;ml_event(7,0,0); }
void ml_session_stop(void) {
    if(state==1){LiInterruptConnection();return;}
    if(state==2||state==3){state=4;ml_spawn_task(stop_task,NULL);}
}
int ml_session_state(void) { return state; }
int ml_session_error(void) { return error_code; }
int ml_session_video_frames(void) { return video_frames; }
int ml_session_audio_frames(void) { return audio_frames; }

/* JS only queues state; upstream input APIs run on a cooperative C stack. */
int ml_session_gamepad(int buttons,int lt,int rt,int lx,int ly,int rx,int ry) {
    if(state!=2)return -1;
    if(lt<0||lt>255||rt<0||rt>255||lx<-32768||lx>32767||ly<-32768||ly>32767||rx<-32768||rx>32767||ry<-32768||ry>32767)return -2;
    input_buttons=buttons;input_lt=lt;input_rt=rt;input_lx=lx;input_ly=ly;input_rx=rx;input_ry=ry;input_pending=1;return 0;
}
int ml_session_key(int code,int down,int modifiers) {
    if(state!=2)return -1;if(code<0||code>255||modifiers<0||modifiers>31)return -3;if(keys_write-keys_read>=64)return -2;
    keys[keys_write++%64]=(typeof(keys[0])){code,down?KEY_ACTION_DOWN:KEY_ACTION_UP,modifiers};return 0;
}
static void input_task(void* ignored) {
    (void)ignored;LiSendMultiControllerEvent(0,1,0,0,0,0,0,0,0);
    while(state==2){
        if(input_pending){input_pending=0;LiSendMultiControllerEvent(0,1,input_buttons,input_lt,input_rt,input_lx,input_ly,input_rx,input_ry);}
        while(keys_read!=keys_write){typeof(keys[0]) key=keys[keys_read++%64];LiSendKeyboardEvent(key.code,key.action,key.modifiers);}
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
