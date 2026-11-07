/* Establish wasm2js + Asyncify stack switching before adapting core threads. */
#include <emscripten/fiber.h>
#include <stdlib.h>
#include <stdint.h>

typedef struct {
    emscripten_fiber_t fiber;
    unsigned char* c_stack;
    unsigned char* async_stack;
    int value, done;
} Context;
static Context root, children[2];
static int last_result;
int ml_fiber_result(void) { return last_result; }
static void worker(void* arg) {
    Context* child = arg;
    for (int i = 0; i < 4; i++) {
        child->value = child->value * 10 + i + 1;
        emscripten_fiber_swap(&child->fiber, &root.fiber);
    }
    child->done = 1;
    emscripten_fiber_swap(&child->fiber, &root.fiber);
    abort();
}
int ml_fiber_proof(void) {
    last_result = 0;
    root.async_stack = malloc(16384);
    emscripten_fiber_init_from_current_context(&root.fiber, root.async_stack, 16384);
    for (int i = 0; i < 2; i++) {
        children[i].c_stack = aligned_alloc(16,16384);
        children[i].async_stack = malloc(16384);
        children[i].value = children[i].done = 0;
        emscripten_fiber_init(&children[i].fiber, worker, &children[i],
                            children[i].c_stack, 16384, children[i].async_stack, 16384);
    }
    for (int round = 0; round < 5; round++)
        for (int i = 0; i < 2; i++) emscripten_fiber_swap(&root.fiber, &children[i].fiber);
    int result = children[0].done && children[1].done &&
                 children[0].value == 1234 && children[1].value == 1234;
    for (int i = 0; i < 2; i++) { free(children[i].c_stack); free(children[i].async_stack); }
    free(root.async_stack);
    last_result = result ? 42 : -1;
    return last_result;
}
