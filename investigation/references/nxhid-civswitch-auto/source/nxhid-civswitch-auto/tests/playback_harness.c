#include "playback.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static uint64_t now;
static unsigned events, failure_at;
static uint8_t caps;
static uint64_t clock_ms(void) { return now; }
static uint8_t leds(void) { return caps; }
static bool emit(char type,const uint8_t report[8]) {
    printf("%c %llu ",type,(unsigned long long)now);
    for(unsigned i=0;i<8;i++)printf("%02x",report[i]);
    putchar('\n');
    now+=5; // USB delivery takes time; the hold must start after it.
    return ++events!=failure_at;
}
static bool keyboard(const uint8_t r[8]) { return emit('K',r); }
static bool gamepad(const uint8_t r[8]) { return emit('P',r); }
int main(int argc,char **argv) {
    assert(argc>=2);
    if(!strcmp(argv[1],"ascii")) {
        for(unsigned lock=0;lock<=2;lock+=2)for(unsigned c=32;c<=126;c++) {
            uint8_t report[8];assert(playback_ascii((uint8_t)c,(uint8_t)lock,report));
            printf("%u %u %u %u\n",lock,c,report[0],report[2]);
        }
        uint8_t report[8];assert(!playback_ascii(0,0,report));assert(!playback_ascii(127,0,report));
        return 0;
    }
    if(!strcmp(argv[1],"path")) {
        char path[1024];assert(playback_payload_path(path,sizeof(path),argc>2?argv[2]:NULL));puts(path);
        char small[3];assert(!playback_payload_path(small,sizeof(small),NULL));return 0;
    }
    assert(argc>=3);
    Playback p={0};
    if(!playback_load(&p,argv[2])) { puts(p.message);return 2; }
    if(!strcmp(argv[1],"validate")) { printf("%zu\n",p.count);playback_free(&p);return 0; }
    const bool cancel=!strcmp(argv[1],"cancel"), unavailable=!strcmp(argv[1],"unavailable");
    if(!strcmp(argv[1],"caps"))caps=2;
    if(!strcmp(argv[1],"failure"))failure_at=20;
    assert(playback_start(&p,keyboard,gamepad,leds,clock_ms,now));
    unsigned ticks=0;
    while(p.state==PLAYBACK_RUNNING) {
        assert(++ticks<1000000);
        if(now<p.deadline)now=p.deadline;
        playback_tick(&p,now,!(unavailable&&events>=20));
        if(cancel&&events>=20)playback_stop(&p);
    }
    if(cancel)assert(p.state==PLAYBACK_STOPPED);
    else if(unavailable||failure_at)assert(p.state==PLAYBACK_ERROR);
    else assert(p.state==PLAYBACK_DONE&&p.line+1==p.count);
    assert(!playback_holding(&p));
    printf("END %u %zu %zu\n",p.state,p.line,p.count);
    playback_free(&p);assert(!p.data&&!p.lines&&!p.count);
    return 0;
}
