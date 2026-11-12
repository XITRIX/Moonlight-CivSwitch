/* Single-threaded cooperative implementation of Moonlight's platform contract. */
#include "Limelight-internal.h"
#include "runtime.h"
#include <emscripten/fiber.h>
#include <emscripten/emscripten.h>
#include <errno.h>
#include <math.h>

enum { READY, SLEEPING, WAIT_COND, WAIT_MUTEX, WAIT_JOIN, FINISHED };
enum { TASK_LIMIT = 32, STACK_BYTES = 131072 };
typedef struct Task {
    emscripten_fiber_t fiber;
    void* stack;
    void* async_stack;
    ML_TASK_ENTRY entry;
    void* argument;
    void* wait_object;
    uint32_t generation;
    double wake_time;
    int state, detached, index, saved_errno, priority, profile_id;
} Task;
typedef struct { Task* owner; } Mutex;
static Task* tasks[TASK_LIMIT];
static Task* current;
static emscripten_fiber_t root;
static unsigned char root_async_stack[STACK_BYTES];
static int cursor, pumping, budget_yields;
static double pump_deadline;
/* Opt-in RAM-only service attribution. Disabled in ordinary app sessions.
   Each row: calls, active ms, maximum turn ms, turns >20 ms, turns >100 ms.
   Time suspended in another task or the JS event loop is excluded. */
static int profile_enabled;
static double profile[13 * 5];
int ml_runtime_profile_enable(int enabled) {
    if(enabled!=0&&enabled!=1)return -1;
    memset(profile,0,sizeof(profile));profile_enabled=enabled;return 0;
}
const double* ml_runtime_profile(void) {return profile;}
static int profile_id(const char* name) {
    const char* names[]={"Other","InputDispatch","InputSend","AudioRecv","AudioDec",
        "VideoRecv","VideoDec","ControlRecv","LossStats","ReqIdrFrame","CtrlAsyncCb","InvRefFrames","Ping"};
    if(!name)return 0;
    if(!strcmp(name,"AudioPing")||!strcmp(name,"VideoPing"))return 12;
    for(int i=2;i<12;i++)if(!strcmp(name,names[i]))return i;
    return 0;
}

static void* load_pointer(void* storage) { void* p; memcpy(&p, storage, sizeof(p)); return p; }
static void store_pointer(void* storage, void* p) { memcpy(storage, &p, sizeof(p)); }
static void suspend_task(void) {
    if (!current || !pumping) abort();
    current->saved_errno=errno;
    emscripten_fiber_swap(&current->fiber, &root);
    errno=current->saved_errno;
}
static void task_entry(void* value) {
    Task* task = value;
    task->entry(task->argument);
    task->state = FINISHED;
    suspend_task();
    abort();
}
static int create_task(ML_TASK_ENTRY entry, void* argument, int detached, Task** output) {
    int slot;
    if(!ml_runtime_tasks())cursor=0;
    for (slot = 0; slot < TASK_LIMIT && tasks[slot]; slot++);
    if (slot == TASK_LIMIT) return EAGAIN;
    Task* task = calloc(1, sizeof(*task));
    if (!task) return ENOMEM;
    // Emscripten's C stack ABI requires 16-byte alignment; malloc may give 8.
    // LLVM may replace stack-pointer additions with OR based on that contract.
    task->stack = aligned_alloc(16,STACK_BYTES); task->async_stack = malloc(STACK_BYTES);
    if (!task->stack || !task->async_stack) { free(task->stack); free(task->async_stack); free(task); return ENOMEM; }
    task->entry = entry; task->argument = argument; task->detached = detached; task->index = slot;
    emscripten_fiber_init(&task->fiber, task_entry, task, task->stack, STACK_BYTES, task->async_stack, STACK_BYTES);
    tasks[slot] = task; *output = task;
    return 0;
}
static void destroy_task(Task* task) {
    tasks[task->index] = NULL;
    free(task->stack); free(task->async_stack); free(task);
}
int ml_spawn_task(ML_TASK_ENTRY entry, void* argument) { Task* task; return create_task(entry, argument, 1, &task); }
int ml_spawn_input_task(ML_TASK_ENTRY entry, void* argument) {
    Task* task;int result=create_task(entry,argument,1,&task);if(!result){task->priority=2;task->profile_id=1;}return result;
}
int ml_runtime_current_task(void) { return current != NULL; }
int ml_runtime_tasks(void) { int count=0; for(int i=0;i<TASK_LIMIT;i++)if(tasks[i])count++; return count; }
void ml_yield_ms(int milliseconds) {
    current->wake_time = emscripten_get_now() + (milliseconds > 0 ? milliseconds : 0);
    current->state = SLEEPING; suspend_task();
}
void ml_runtime_checkpoint(void) {
    if(current&&pumping&&emscripten_get_now()>=pump_deadline){budget_yields++;ml_yield_ms(0);}
}
int ml_runtime_budget_yields(void) { return budget_yields; }
void ml_runtime_wake_input(void) {
    for(int i=0;i<TASK_LIMIT;i++)if(tasks[i]&&tasks[i]->priority==2&&tasks[i]->state==SLEEPING)tasks[i]->wake_time=0;
}
static int runnable(Task* task) {
    return task->state == READY || (task->state == SLEEPING && emscripten_get_now() >= task->wake_time) ||
        (task->state == WAIT_COND && *(uint32_t*)task->wait_object != task->generation) ||
        (task->state == WAIT_MUTEX && ((Mutex*)task->wait_object)->owner == NULL) ||
        (task->state == WAIT_JOIN && ((Task*)task->wait_object)->state == FINISHED);
}
static void run_task(Task* task) {
    double begin=profile_enabled?emscripten_get_now():0;
    current=task;task->state=READY;emscripten_fiber_swap(&root,&task->fiber);current=NULL;
    if(profile_enabled){double elapsed=emscripten_get_now()-begin,*row=profile+task->profile_id*5;
        row[0]++;row[1]+=elapsed;if(elapsed>row[2])row[2]=elapsed;if(elapsed>20)row[3]++;if(elapsed>100)row[4]++;
    }
}
int ml_runtime_pump(double budget_ms) {
    if (pumping) return -1;
    if(!isfinite(budget_ms)||budget_ms<=0||budget_ms>50)return -2;
    pumping = 1;
    emscripten_fiber_init_from_current_context(&root, root_async_stack, sizeof(root_async_stack));
    pump_deadline = emscripten_get_now() + budget_ms;
    int steps = 0;
    // Preserve the position across pump budgets. Restarting the priority pass
    // on every call lets input/audio repeatedly consume a short slice before
    // video/control can run. Each runnable task gets one turn per cycle, with
    // dispatch, send and audio first; interrupted cycles resume where they left.
    const int priorities[]={2,1,3};
    for (int scanned = 0; scanned < TASK_LIMIT * 8 && steps < 128; scanned++) {
        int position=cursor;cursor=(cursor+1)%(TASK_LIMIT*4);
        Task* task=tasks[position%TASK_LIMIT];
        if (!task) continue;
        if (task->state == FINISHED) { if (task->detached) destroy_task(task); continue; }
        int priority=position<TASK_LIMIT*3?priorities[position/TASK_LIMIT]:0;
        if(task->priority!=priority)continue;
        if (!runnable(task)) continue;
        run_task(task);steps++;
        if (emscripten_get_now() >= pump_deadline) break;
    }
    pumping = 0;
    return steps;
}

void PltSleepMs(int ms) { ml_yield_ms(ms); }
void PltSleepMsInterruptible(PLT_THREAD* thread, int ms) { while(ms>0&&!thread->cancelled){int step=ms<50?ms:50;PltSleepMs(step);ms-=step;} }
int PltCreateThread(const char* name, ThreadEntry entry, void* context, PLT_THREAD* thread) {
    Task* task; int result=create_task(entry,context,0,&task);
    if(!result){task->profile_id=profile_id(name);task->priority=name&&!strcmp(name,"InputSend")?1:name&&(!strcmp(name,"AudioRecv")||!strcmp(name,"AudioDec"))?3:0;thread->thread=(pthread_t)task;thread->cancelled=false;}return result;
}
void PltInterruptThread(PLT_THREAD* thread) {
    thread->cancelled=true;Task* task=(Task*)thread->thread;
    if(task&&task->state==SLEEPING)task->wake_time=0;
}
bool PltIsThreadInterrupted(PLT_THREAD* thread) { return thread->cancelled; }
void PltJoinThread(PLT_THREAD* thread) {
    Task* task=(Task*)thread->thread;
    while(task->state!=FINISHED){current->wait_object=task;current->state=WAIT_JOIN;suspend_task();}
    destroy_task(task);thread->thread=0;
}
void PltDetachThread(PLT_THREAD* thread) { ((Task*)thread->thread)->detached=1;thread->thread=0; }
int PltCreateMutex(PLT_MUTEX* mutex) { _Static_assert(sizeof(*mutex)>=sizeof(void*),"mutex pointer fits");Mutex* p=calloc(1,sizeof(*p));store_pointer(mutex,p);return p?0:ENOMEM; }
void PltDeleteMutex(PLT_MUTEX* mutex) { free(load_pointer(mutex));store_pointer(mutex,NULL); }
void PltLockMutex(PLT_MUTEX* mutex) {
    Mutex* p=load_pointer(mutex);
    while(p->owner){if(p->owner==current)abort();current->wait_object=p;current->state=WAIT_MUTEX;suspend_task();}
    p->owner=current;
}
void PltUnlockMutex(PLT_MUTEX* mutex) { ((Mutex*)load_pointer(mutex))->owner=NULL; }
int PltCreateConditionVariable(PLT_COND* cond, PLT_MUTEX* mutex) { (void)mutex;memset(cond,0,sizeof(*cond));return 0; }
void PltDeleteConditionVariable(PLT_COND* cond) { (void)cond; }
void PltSignalConditionVariable(PLT_COND* cond) { ++*(uint32_t*)cond; }
void PltWaitForConditionVariable(PLT_COND* cond, PLT_MUTEX* mutex) {
    current->wait_object=cond;current->generation=*(uint32_t*)cond;current->state=WAIT_COND;
    PltUnlockMutex(mutex);suspend_task();PltLockMutex(mutex);
}
int PltCreateEvent(PLT_EVENT* event) { int result=PltCreateMutex(&event->mutex);if(result)return result;PltCreateConditionVariable(&event->cond,&event->mutex);event->signalled=false;return 0; }
void PltCloseEvent(PLT_EVENT* event) { PltDeleteConditionVariable(&event->cond);PltDeleteMutex(&event->mutex); }
void PltSetEvent(PLT_EVENT* event) { event->signalled=true;PltSignalConditionVariable(&event->cond); }
void PltClearEvent(PLT_EVENT* event) { event->signalled=false; }
void PltWaitForEvent(PLT_EVENT* event) { PltLockMutex(&event->mutex);while(!event->signalled)PltWaitForConditionVariable(&event->cond,&event->mutex);PltUnlockMutex(&event->mutex); }
void PltTicksInit(void) {}
uint64_t PltGetMicroseconds(void) { return (uint64_t)(emscripten_get_now()*1000.0); }
uint64_t PltGetMillis(void) { return (uint64_t)emscripten_get_now(); }
bool PltSafeStrcpy(char* dest,size_t size,const char* source) { if(!size)return false;size_t n=strlen(source);if(n>=size){dest[0]=0;return false;}memcpy(dest,source,n+1);return true; }
int initializePlatform(void) { int result=initializePlatformSockets();return result?result:enet_initialize(); }
void cleanupPlatform(void) { cleanupPlatformSockets();enet_deinitialize(); }
