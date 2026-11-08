#pragma once
#include <stdint.h>
typedef void (*ML_TASK_ENTRY)(void*);
int ml_spawn_task(ML_TASK_ENTRY entry, void* argument);
int ml_spawn_input_task(ML_TASK_ENTRY entry, void* argument);
void ml_yield_ms(int milliseconds);
int ml_runtime_pump(double budget_ms);
int ml_runtime_tasks(void);
int ml_runtime_current_task(void);
void ml_runtime_checkpoint(void);
void ml_runtime_wake_input(void);
int ml_runtime_budget_yields(void);
