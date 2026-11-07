#pragma once
#include <stdint.h>
typedef void (*ML_TASK_ENTRY)(void*);
int ml_spawn_task(ML_TASK_ENTRY entry, void* argument);
void ml_yield_ms(int milliseconds);
int ml_runtime_pump(int budget_ms);
int ml_runtime_tasks(void);
int ml_runtime_current_task(void);
