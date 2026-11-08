extern int ml_fec_set_work_limit(int);
extern int ml_fec_recovery_allowed(int,int,int);
int ml_test_fec_policy(void) {
    enum {DATA=16,PARITY=4,BYTES=1408};
    unsigned char* storage=malloc((DATA+PARITY)*BYTES);
    unsigned char* expected=malloc((DATA+PARITY)*BYTES);
    unsigned char* erased=malloc((DATA+PARITY)*BYTES);
    unsigned char* shards[DATA+PARITY];unsigned char marks[DATA+PARITY]={0};
    reed_solomon* rs=reed_solomon_new(DATA,PARITY);int result=1;
    if(!storage||!expected||!erased||!rs)goto done;
    for(unsigned i=0;i<(DATA+PARITY)*BYTES;i++)storage[i]=(unsigned char)(i*17+i/BYTES*61);
    for(unsigned i=0;i<DATA+PARITY;i++)shards[i]=storage+i*BYTES;
    storage[0]=0x90;storage[24]=5;storage[27]=0;storage[32]=1;storage[35]=1;
    if(reed_solomon_encode(rs,shards,DATA+PARITY,BYTES))goto done;
    memcpy(expected,storage,(DATA+PARITY)*BYTES);
    for(unsigned i=4;i<8;i++){marks[i]=1;memset(shards[i],0,BYTES);}
    memcpy(erased,storage,(DATA+PARITY)*BYTES);
    if(ml_fec_set_work_limit(32768)||reed_solomon_decode(rs,shards,marks,DATA+PARITY,BYTES)!=-1||memcmp(storage,erased,(DATA+PARITY)*BYTES)){result=2;goto done;}
    if(ml_fec_set_work_limit(1)||!ml_fec_recovery_allowed(255,1,1408)||!ml_fec_recovery_allowed(4,2,2048)||ml_fec_recovery_allowed(255,2,1408)){result=3;goto done;}
    if(ml_fec_set_work_limit(0)||reed_solomon_decode(rs,shards,marks,DATA+PARITY,BYTES)||memcmp(storage,expected,DATA*BYTES)){result=4;goto done;}
    storage[35]=2;
    if(reed_solomon_encode(rs,shards,DATA+PARITY,BYTES)){result=5;goto done;}
    memcpy(expected,storage,(DATA+PARITY)*BYTES);
    for(unsigned i=4;i<8;i++)memset(shards[i],0,BYTES);
    if(ml_fec_set_work_limit(1)||reed_solomon_decode(rs,shards,marks,DATA+PARITY,BYTES)||memcmp(storage,expected,DATA*BYTES)){result=6;goto done;}
    result=0;
done:
    ml_fec_set_work_limit(0);if(rs)reed_solomon_release(rs);free(storage);free(expected);free(erased);return result;
}

