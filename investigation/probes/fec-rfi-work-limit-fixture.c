extern int ml_fec_set_work_limit(int);
extern int ml_fec_policy_should_skip(int,reed_solomon*,unsigned char**,unsigned char*,int,int);
int ml_test_fec_rfi_policy(void) {
    unsigned char first[1408]={0},marks[20]={0};unsigned char* shards[20]={first};
    reed_solomon* rs=reed_solomon_new(16,4);if(!rs)return 1;
    first[0]=0x90;first[24]=5;first[27]=0;first[32]=1;first[35]=1;
    for(int i=4;i<8;i++)marks[i]=1;
    int result=2;
    if(ml_fec_set_work_limit(32768)||!ml_fec_policy_should_skip(1,rs,shards,marks,20,1408))goto done;
    if(ml_fec_policy_should_skip(0,rs,shards,marks,20,1408))goto done;
    first[35]=2;if(ml_fec_policy_should_skip(1,rs,shards,marks,20,1408))goto done;first[35]=1;
    marks[0]=1;if(ml_fec_policy_should_skip(1,rs,shards,marks,20,1408))goto done;marks[0]=0;
    first[27]=16;if(ml_fec_policy_should_skip(1,rs,shards,marks,20,1408))goto done;first[27]=0;
    first[32]=0;if(ml_fec_policy_should_skip(1,rs,shards,marks,20,1408))goto done;first[32]=1;
    memset(marks,0,sizeof(marks));marks[4]=1;
    if(ml_fec_set_work_limit(1)||ml_fec_policy_should_skip(1,rs,shards,marks,20,1408))goto done;
    result=0;
done:ml_fec_set_work_limit(0);reed_solomon_release(rs);return result;
}
