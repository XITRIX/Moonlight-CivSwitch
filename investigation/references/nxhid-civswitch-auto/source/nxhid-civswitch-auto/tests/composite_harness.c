#include "usb_keyboard.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static UsbDsInterface interfaces[2];
static UsbDsEndpoint endpoints[4];
static UsbState state;
static u64 now;
static bool active, owned[4], timeout_pad;
static u8 *dma[4], snapshot[4][64];
static size_t sizes[4];
static u32 ids[4], next_id;
static UsbDsReportData control_in_reports[2], control_out_reports[2];
static struct usb_control_setup setups[2];
static u8 configs[2][5][128], control_data[2][256], output[64];
static size_t config_sizes[2][5], control_sizes[2], output_size;
static struct usb_device_descriptor device[5];
static unsigned stalls, exits;
static Result fail_out_queue, fail_control_in;
static bool only_primary_control, suppress_control_in, suppress_control_out_status;
static unsigned control_in_posts, control_out_posts, cancels;
static bool receive_keyboard_led, receive_pad_echo;

static unsigned ii(UsbDsInterface *i) { assert(i >= interfaces && i < interfaces+2); return (unsigned)(i-interfaces); }
static unsigned ei(UsbDsEndpoint *e) { assert(e >= endpoints && e < endpoints+4); return (unsigned)(e-endpoints); }
bool hosversionBefore(int a,int b,int c) { (void)a;(void)b;(void)c;return false; }
u64 armGetSystemTick(void) { return now; }
u64 armTicksToNs(u64 ticks) { return ticks; }
void armDCacheFlush(void *p,size_t n) { assert((uintptr_t)p%4096==0 && n<=64); }
Result eventClear(Event *e) { bool set=e->signaled;e->signaled=false;return set?0:KERNELRESULT(InvalidState); }
Result eventWait(Event *e,u64 ns) {
    for(unsigned i=0;i<4;i++) if(owned[i]) assert(!memcmp(dma[i],snapshot[i],sizes[i]));
    if(e->error) return e->error;
    if(e->signaled) return 0;
    now+=ns;
    return KERNELRESULT(TimedOut);
}
Result usbDsInitialize(void) { assert(!active);active=true;return 0; }
void usbDsExit(void) { assert(active);active=false;memset(owned,0,sizeof(owned));exits++; }
Result usbDsClearDeviceData(void) { memset(config_sizes,0,sizeof(config_sizes));return 0; }
Result usbDsAddUsbLanguageStringDescriptor(u8 *i,const u16 *v,u16 n) { assert(n==1&&v[0]==0x409);*i=0;return 0; }
Result usbDsAddUsbStringDescriptor(u8 *i,const char *s) { assert(*s);*i=1;return 0; }
Result usbDsSetUsbDeviceDescriptor(UsbDeviceSpeed s,struct usb_device_descriptor *d) { device[s]=*d;return 0; }
Result usbDsSetBinaryObjectStore(const void *p,size_t n) { (void)p;assert(n==22);return 0; }
Result usbDsRegisterInterfaceEx(UsbDsInterface **p,u8 i) { assert(i<2);memset(&interfaces[i],0,sizeof(interfaces[i]));interfaces[i].interface_index=i;*p=&interfaces[i];return 0; }
Result usbDsInterface_AppendConfigurationData(UsbDsInterface *p,UsbDeviceSpeed s,const void *d,size_t n) {
    unsigned i=ii(p);assert(config_sizes[i][s]+n<=128);memcpy(configs[i][s]+config_sizes[i][s],d,n);config_sizes[i][s]+=n;return 0;
}
Result usbDsInterface_RegisterEndpoint(UsbDsInterface *p,UsbDsEndpoint **e,u8 address) {
    unsigned i=ii(p),x=99;
    if(i==0&&address==0x81)x=0;
    if(i==0&&address==0x02)x=1;
    if(i==1&&address==0x83)x=2;
    if(i==1&&address==0x03)x=3;
    assert(x<4);memset(&endpoints[x],0,sizeof(endpoints[x]));*e=&endpoints[x];return 0;
}
Result usbDsInterface_EnableInterface(UsbDsInterface *p) { ii(p);return 0; }
Result usbDsEnable(void) { assert(active);return 0; }
Result usbDsGetState(UsbState *p) { *p=state;return 0; }
static void control_post(Event *e,size_t n,u32 *id,UsbDsReportData *r) {
    *id=++next_id;*r=(UsbDsReportData){.report_count=1,.report={{*id,n,n,3}}};e->signaled=true;
}
Result usbDsInterface_CtrlInPostBufferAsync(UsbDsInterface *p,void *d,size_t n,u32 *id) {
    if(fail_control_in) return fail_control_in;
    unsigned i=ii(p);
    if(only_primary_control && i!=0) return 0x25c8c;
    control_in_posts++;
    assert(n<=256&&(uintptr_t)d%4096==0);
    if(n){memcpy(control_data[i],d,n);control_sizes[i]=n;}
    control_post(&p->CtrlInCompletionEvent,n,id,&control_in_reports[i]);
    if(suppress_control_in)p->CtrlInCompletionEvent.signaled=false;
    return 0;
}
Result usbDsInterface_CtrlOutPostBufferAsync(UsbDsInterface *p,void *d,size_t n,u32 *id) {
    control_out_posts++;
    unsigned i=ii(p);assert(n<=64&&(uintptr_t)d%4096==0);if(n){assert(n==output_size);memcpy(d,output,n);}
    control_post(&p->CtrlOutCompletionEvent,n,id,&control_out_reports[i]);
    if(!n && suppress_control_out_status)p->CtrlOutCompletionEvent.signaled=false;
    return 0;
}
Result usbDsInterface_GetCtrlInReportData(UsbDsInterface *p,UsbDsReportData *r) { *r=control_in_reports[ii(p)];return 0; }
Result usbDsInterface_GetCtrlOutReportData(UsbDsInterface *p,UsbDsReportData *r) { *r=control_out_reports[ii(p)];return 0; }
Result usbDsParseReportData(UsbDsReportData *r,u32 id,u32 *requested,u32 *transferred) {
    for(u32 i=0;i<r->report_count;i++)if(r->report[i].id==id){if(requested)*requested=r->report[i].requestedSize;if(transferred)*transferred=r->report[i].transferredSize;return 0;}
    return MAKERESULT(Module_Libnx,LibnxError_NotFound);
}
Result usbDsInterface_StallCtrl(UsbDsInterface *p) { ii(p);stalls++;return 0; }
Result usbDsInterface_GetSetupPacket(UsbDsInterface *p,void *d,size_t n) { assert(n==sizeof(setups[0]));memcpy(d,&setups[ii(p)],n);return 0; }
Result usbDsEndpoint_PostBufferAsync(UsbDsEndpoint *e,void *d,size_t n,u32 *id) {
    unsigned x=ei(e);
    if(x==1 && fail_out_queue) return fail_out_queue;
    assert(!owned[x]&&(uintptr_t)d%4096==0);assert(n==(x==1?64:8));
    for(unsigned i=0;i<4;i++)if(owned[i])assert(dma[i]!=d);
    dma[x]=d;memcpy(snapshot[x],d,n);sizes[x]=n;owned[x]=true;ids[x]=*id=++next_id;
    e->CompletionEvent.signaled=x!=1&&x!=3&&!(x==0&&timeout_pad);return 0;
}
Result usbDsEndpoint_Cancel(UsbDsEndpoint *ep) {
    unsigned x=ei(ep);
    cancels++;
    if(owned[x])assert(!memcmp(dma[x],snapshot[x],sizes[x]));
    owned[x]=false;
    ep->CompletionEvent.signaled=false;
    return 0;
}
Result usbDsEndpoint_GetReportData(UsbDsEndpoint *e,UsbDsReportData *r) {
    unsigned x=ei(e);
    if(!owned[x]){*r=(UsbDsReportData){0};return 0;}
    assert(!memcmp(dma[x],snapshot[x],sizes[x]));
    size_t transferred=sizes[x];
    if(x==3 && receive_keyboard_led){dma[x][0]=7;transferred=1;receive_keyboard_led=false;}
    if(x==1 && receive_pad_echo){memcpy(dma[x],(u8[8]){1,2,3,4,5,6,7,8},8);transferred=8;receive_pad_echo=false;}
    *r=(UsbDsReportData){.report_count=1,.report={{ids[x],sizes[x],transferred,3}}};owned[x]=false;return 0;
}
static void request(unsigned i,u8 type,u8 code,u16 value,u16 length) {
    setups[i]=(struct usb_control_setup){type,code,value,i,length};interfaces[i].SetupEvent.signaled=true;
    assert(usb_keyboard_tick()==0);
}
static void connect_host(void) {
    state=UsbState_Configured;
    assert(usb_keyboard_tick()==0&&!usb_keyboard_ready());
    assert(usb_keyboard_tick()==0&&usb_keyboard_ready());
}
static void descriptors(void) {
    for(unsigned speed=2;speed<=4;speed++) {
        assert(device[speed].idVendor==0x0f0d&&device[speed].idProduct==0x0092);
        for(unsigned i=0;i<2;i++) {
            unsigned ep_count=0;
            for(size_t at=0;at<config_sizes[i][speed];) {
                const u8 *d=&configs[i][speed][at];assert(d[0]>=2&&at+d[0]<=config_sizes[i][speed]);
                if(d[1]==USB_DT_INTERFACE)assert(d[2]==i&&d[4]==2);
                if(d[1]==USB_DT_ENDPOINT){ep_count++;assert(i==0?(d[2]==(ep_count==1?2:0x81)):d[2]==(ep_count==1?0x83:3));}
                at+=d[0];
            }
            assert(ep_count==2);
        }
    }
    request(0,0x81,6,USB_DT_REPORT<<8,255);
    assert(control_sizes[0]==86&&control_data[0][3]==5);
    request(1,0x81,6,USB_DT_REPORT<<8,255);
    assert(control_sizes[1]>8&&control_data[1][3]==6);
}
static void transfers(void) {
    const u8 neutral[8]={0,0,8,128,128,128,128,0},a[8]={4,0,8,128,128,128,128,0};
    assert(!memcmp(snapshot[0],neutral,8)&&!memcmp(snapshot[2],(u8[8]){0},8));
    assert(usb_gamepad_write(a)==0&&!memcmp(snapshot[0],a,8));
    assert(usb_keyboard_write((u8[8]){2,0,4})==0&&snapshot[2][2]==4);
    assert(usb_gamepad_write(neutral)==0&&!memcmp(snapshot[0],neutral,8));
    request(0,0xa1,1,0x0100,8);assert(!memcmp(control_data[0],neutral,8));
    request(1,0xa1,1,0x0100,8);assert(control_data[1][0]==2&&control_data[1][2]==4);
    output[0]=2;output_size=1;
    request(1,0x21,9,0x0200,1);assert(usb_keyboard_leds()==2);
    memset(output,0x55,8);output_size=8;request(0,0x21,9,0x0200,8);assert(usb_keyboard_leds()==2);
    assert(owned[1]);endpoints[1].CompletionEvent.signaled=true;
    assert(usb_keyboard_tick()==0&&owned[1]); // OUT pipe rearmed after draining.
    now+=20000000;assert(usb_keyboard_tick()==0);assert(usb_keyboard_tick()==0);
    assert(!memcmp(snapshot[0],neutral,8)); // Continuous gamepad polling retains neutral state.
    unsigned before=exits;
    state=UsbState_Suspended;assert(usb_keyboard_tick()==0&&!usb_keyboard_ready());
    assert(usb_gamepad_write(neutral)==0&&usb_keyboard_write((u8[8]){0})==0);
    state=UsbState_Configured;assert(usb_keyboard_tick()==0);assert(usb_keyboard_tick()==0&&usb_keyboard_ready());
    assert(exits==before&&usb_keyboard_leds()==2);
    assert(!memcmp(snapshot[0],neutral,8)&&!memcmp(snapshot[2],(u8[8]){0},8));
    // A gamepad timeout services pending requests on the keyboard interface,
    // then latches the fault across both interfaces without reusing DMA memory.
    output[0]=0;output_size=1;
    setups[1]=(struct usb_control_setup){0x21,9,0x0200,1,1};interfaces[1].SetupEvent.signaled=true;
    timeout_pad=true;
    assert(usb_gamepad_write(a)==KERNELRESULT(TimedOut));
    assert(usb_keyboard_leds()==0);
    assert(usb_keyboard_write((u8[8]){0})==KERNELRESULT(TimedOut));
    assert(usb_keyboard_tick()==KERNELRESULT(TimedOut));
}
int main(int argc, char **argv) {
    assert(usb_keyboard_init()==0&&!usb_keyboard_ready());
    if(argc>1 && !strcmp(argv[1], "readiness-reason")) {
        state=UsbState_Configured;timeout_pad=true;
        request(1,0x81,6,USB_DT_REPORT<<8,63);
        assert(usb_keyboard_tick()==0 && !usb_keyboard_ready());
        assert(!strcmp(usb_keyboard_wait_reason(),"Waiting for controller input polling"));
        assert(strstr(usb_keyboard_readiness_detail(),"desc=yes key=ok pad=wait"));
        timeout_pad=false;endpoints[0].CompletionEvent.signaled=true;
        assert(usb_keyboard_tick()==0 && usb_keyboard_ready());
        usb_keyboard_exit();puts("readiness distinguishes keyboard and controller polling: PASS");return 0;
    }
    if(argc>1 && (!strcmp(argv[1], "descriptor-led-race") || !strcmp(argv[1], "descriptor-data-led-race"))) {
        const bool data_race=!strcmp(argv[1], "descriptor-data-led-race");
        state=UsbState_Configured;
        suppress_control_in=data_race;suppress_control_out_status=!data_race;
        setups[1]=(struct usb_control_setup){0x81,6,USB_DT_REPORT<<8,1,63};
        interfaces[1].SetupEvent.signaled=true;
        assert(usb_keyboard_tick()==0);
        // Host has received the descriptor and starts its LED request before
        // the application processes the preceding transfer's completion.
        output[0]=1;output_size=1;
        suppress_control_in=suppress_control_out_status=false;
        setups[1]=(struct usb_control_setup){0x21,9,0x0200,1,1};
        interfaces[1].SetupEvent.signaled=true;
        if(data_race)interfaces[1].CtrlInCompletionEvent.signaled=true;
        else interfaces[1].CtrlOutCompletionEvent.signaled=true;
        assert(usb_keyboard_tick()==0 && usb_keyboard_leds()==1);
        const bool ready=usb_keyboard_ready();
        printf("configured=%d num=%u ready=%d\n",state==UsbState_Configured,usb_keyboard_leds()&1,ready);
        usb_keyboard_exit();return ready?0:13;
    }
    if(argc>1 && !strcmp(argv[1], "bus-reconfigure")) {
        descriptors();connect_host();
        const unsigned original_exits=exits;
        now+=20000000;timeout_pad=true;
        assert(usb_keyboard_tick()==0 && owned[0]);
        state=UsbState_Default;
        assert(usb_keyboard_tick()==0 && !usb_keyboard_ready() && exits==original_exits && cancels>=3);
        assert(!owned[0]&&!owned[1]&&!owned[2]&&!owned[3]);
        assert(strstr(usb_keyboard_bus_status(),"Configured -> Default"));
        assert(usb_gamepad_write((u8[8]){4,0,8,128,128,128,128,0})==KERNELRESULT(InvalidState));
        assert(usb_keyboard_write((u8[8]){0})==0 && usb_keyboard_tick()==0);
        state=UsbState_Address;assert(usb_keyboard_tick()==0 && exits==original_exits);
        state=UsbState_Configured;timeout_pad=false;
        assert(usb_keyboard_tick()==0 && !usb_keyboard_ready());
        assert(usb_keyboard_tick()==0 && usb_keyboard_ready() && exits==original_exits);
        assert(!memcmp(snapshot[0],(u8[8]){0,0,8,128,128,128,128,0},8));
        assert(!memcmp(snapshot[2],(u8[8]){0},8));
        usb_keyboard_exit();puts("host reconfiguration without software USB teardown: PASS");return 0;
    }
    if(argc>1 && !strcmp(argv[1], "reset-during-control")) {
        descriptors();connect_host();
        const unsigned before_out=control_out_posts;
        setups[1]=(struct usb_control_setup){0x81,6,USB_DT_REPORT<<8,1,63};
        interfaces[1].SetupEvent.signaled=true;suppress_control_in=true;
        assert(usb_keyboard_tick()==0);
        state=UsbState_Default;
        interfaces[1].CtrlInCompletionEvent.signaled=true;suppress_control_in=false;
        assert(usb_keyboard_tick()==0 && control_out_posts==before_out && !usb_keyboard_ready());
        state=UsbState_Configured;
        assert(usb_keyboard_tick()==0 && usb_keyboard_tick()==0 && usb_keyboard_ready());
        usb_keyboard_exit();puts("host reset retires interrupted EP0 transfer: PASS");return 0;
    }
    if(argc>1 && !strcmp(argv[1], "keyboard-out-and-echo")) {
        descriptors();connect_host();
        receive_keyboard_led=true;endpoints[3].CompletionEvent.signaled=true;
        assert(usb_keyboard_tick()==0 && usb_keyboard_leds()==7 && owned[3]);
        receive_pad_echo=true;endpoints[1].CompletionEvent.signaled=true;
        assert(usb_keyboard_tick()==0 && !memcmp(snapshot[0],(u8[8]){1,2,3,4,5,6,7,8},8));
        assert(usb_keyboard_tick()==0);
        memset(output,0x44,8);output_size=8;
        request(0,0x21,9,0x0200,8);
        assert(!memcmp(snapshot[0],output,8));
        assert(usb_keyboard_tick()==0);
        usb_keyboard_exit();puts("keyboard interrupt LEDs and gamepad output echo: PASS");return 0;
    }
    if(argc>1 && (!strcmp(argv[1], "shared-setup") || !strcmp(argv[1], "primary-control"))) {
        setups[0]=setups[1]=(struct usb_control_setup){0x81,6,USB_DT_REPORT<<8,1,63};
        interfaces[1].SetupEvent.signaled=true;
        if(!strcmp(argv[1], "shared-setup"))interfaces[0].SetupEvent.signaled=true;
        else only_primary_control=true;
        assert(usb_keyboard_tick()==0);
        assert(stalls==0 && control_in_posts==1 && control_out_posts==1);
        assert(control_sizes[0]==63 && control_data[0][3]==6); // keyboard, sent via shared EP0 owner 0.
        connect_host();
        usb_keyboard_exit();puts("shared EP0 keyboard descriptor routing: PASS");return 0;
    }
    if(argc>1 && !strcmp(argv[1], "delayed-shared-setup")) {
        setups[0]=setups[1]=(struct usb_control_setup){0x81,6,USB_DT_REPORT<<8,1,63};
        interfaces[0].SetupEvent.signaled=true;suppress_control_in=true;
        assert(usb_keyboard_tick()==0 && control_in_posts==1);
        interfaces[1].SetupEvent.signaled=true;
        assert(usb_keyboard_tick()==0 && control_in_posts==1 && control_out_posts==0);
        interfaces[0].CtrlInCompletionEvent.signaled=true;suppress_control_in=false;
        assert(usb_keyboard_tick()==0 && control_in_posts==1 && control_out_posts==1);
        connect_host();
        // An actual later request with identical contents still gets its own reply.
        request(1,0x81,6,USB_DT_REPORT<<8,63);
        assert(control_in_posts==2 && control_out_posts==2);
        usb_keyboard_exit();puts("delayed shared notification and genuine repeated SETUP: PASS");return 0;
    }
    if(argc>1 && !strcmp(argv[1], "readiness-waits")) {
        state=UsbState_Configured;
        assert(usb_keyboard_tick()==0 && usb_keyboard_tick()==0 && !usb_keyboard_ready());
        setups[1]=(struct usb_control_setup){0x81,6,USB_DT_REPORT<<8,1,63};
        interfaces[1].SetupEvent.signaled=true;suppress_control_in=true;
        assert(usb_keyboard_tick()==0 && !usb_keyboard_ready());
        interfaces[1].CtrlInCompletionEvent.signaled=true;suppress_control_in=false;
        assert(usb_keyboard_tick()==0 && usb_keyboard_ready());
        usb_keyboard_exit();puts("readiness waits for descriptor acknowledgement: PASS");return 0;
    }
    if(argc>1 && !strcmp(argv[1], "superseded-setup")) {
        setups[1]=(struct usb_control_setup){0x81,6,USB_DT_REPORT<<8,1,63};
        interfaces[1].SetupEvent.signaled=true;suppress_control_in=true;
        assert(usb_keyboard_tick()==0 && now==0 && control_out_posts==0);
        // A new SETUP aborts the old descriptor read. Retire the IN completion,
        // then answer GET_IDLE without queueing the old OUT status stage.
        setups[1]=(struct usb_control_setup){0xa1,2,0,1,1};
        interfaces[1].SetupEvent.signaled=true;
        interfaces[1].CtrlInCompletionEvent.signaled=true;suppress_control_in=false;
        assert(usb_keyboard_tick()==0);
        assert(control_in_posts==2 && control_out_posts==1);
        assert(control_sizes[1]==1 && control_data[1][0]==0);
        usb_keyboard_exit();puts("nonblocking superseded SETUP handling: PASS");return 0;
    }
    if(argc>1) {
        state=UsbState_Configured;
        if(!strcmp(argv[1], "out-error")) fail_out_queue=0x25c8c;
        else {
            fail_control_in=0x25c8c;
            setups[1]=(struct usb_control_setup){0x81,6,USB_DT_REPORT<<8,1,255};
            interfaces[1].SetupEvent.signaled=true;
        }
        assert(usb_keyboard_tick()==0x25c8c);
        const char *stage=usb_keyboard_error_stage();
        assert(strstr(stage,fail_out_queue?"if0 OUT ep02 queue":"if0 control IN primary queue"));
        if(fail_control_in) assert(strstr(stage,"req=81/06") && strstr(stage,"v=2200"));
        char captured[128];snprintf(captured,sizeof(captured),"%s",stage);
        usb_keyboard_exit();assert(!strcmp(captured,usb_keyboard_error_stage()));
        puts(captured);return 0;
    }
    descriptors();connect_host();transfers();
    usb_keyboard_exit();assert(!active&&!usb_keyboard_ready());
    puts("composite USB descriptors, controls, transfers, suspend, timeout: PASS");
    return 0;
}
