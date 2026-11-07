/* Single-threaded cooperative implementation of Moonlight's platform contract. */
#include "Limelight-internal.h"
#include "runtime.h"
#include <emscripten/fiber.h>
#include <emscripten/emscripten.h>
#include <errno.h>

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
    int state, detached, index, saved_errno;
} Task;
typedef struct { Task* owner; } Mutex;
static Task* tasks[TASK_LIMIT];
static Task* current;
static emscripten_fiber_t root;
static unsigned char root_async_stack[STACK_BYTES];
static int cursor, pumping;

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
int ml_runtime_current_task(void) { return current != NULL; }
int ml_runtime_tasks(void) { int count=0; for(int i=0;i<TASK_LIMIT;i++)if(tasks[i])count++; return count; }
void ml_yield_ms(int milliseconds) {
    current->wake_time = emscripten_get_now() + (milliseconds > 0 ? milliseconds : 0);
    current->state = SLEEPING; suspend_task();
}
int ml_runtime_pump(int budget_ms) {
    if (pumping) return -1;
    pumping = 1;
    emscripten_fiber_init_from_current_context(&root, root_async_stack, sizeof(root_async_stack));
    double deadline = emscripten_get_now() + (budget_ms > 0 ? budget_ms : 1);
    int steps = 0;
    for (int scanned = 0; scanned < TASK_LIMIT * 8 && steps < 128; scanned++) {
        Task* task = tasks[cursor]; cursor = (cursor + 1) % TASK_LIMIT;
        if (!task) continue;
        if (task->state == FINISHED) { if (task->detached) destroy_task(task); continue; }
        int runnable = task->state == READY || (task->state == SLEEPING && emscripten_get_now() >= task->wake_time) ||
            (task->state == WAIT_COND && *(uint32_t*)task->wait_object != task->generation) ||
            (task->state == WAIT_MUTEX && ((Mutex*)task->wait_object)->owner == NULL) ||
            (task->state == WAIT_JOIN && ((Task*)task->wait_object)->state == FINISHED);
        if (!runnable) continue;
        current = task; task->state = READY;
        emscripten_fiber_swap(&root, &task->fiber);
        current = NULL; steps++;
        if (emscripten_get_now() >= deadline) break;
    }
    pumping = 0;
    return steps;
}

void PltSleepMs(int ms) { ml_yield_ms(ms); }
void PltSleepMsInterruptible(PLT_THREAD* thread, int ms) { while(ms>0&&!thread->cancelled){int step=ms<50?ms:50;PltSleepMs(step);ms-=step;} }
int PltCreateThread(const char* name, ThreadEntry entry, void* context, PLT_THREAD* thread) {
    (void)name; Task* task; int result=create_task(entry,context,0,&task);
    if(!result){thread->thread=(pthread_t)task;thread->cancelled=false;}return result;
}
void PltInterruptThread(PLT_THREAD* thread) { thread->cancelled=true; }
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
