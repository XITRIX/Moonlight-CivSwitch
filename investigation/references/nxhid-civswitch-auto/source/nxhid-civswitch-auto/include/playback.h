#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef bool (*PlaybackWriter)(const uint8_t report[8]);
typedef uint8_t (*PlaybackLeds)(void);
typedef uint64_t (*PlaybackClock)(void);
typedef enum { PLAYBACK_IDLE, PLAYBACK_RUNNING, PLAYBACK_DONE, PLAYBACK_STOPPED, PLAYBACK_ERROR } PlaybackState;

typedef struct {
    char *data;
    char **lines;
    size_t count, line, character;
    unsigned stage, preamble;
    uint64_t deadline;
    PlaybackState state;
    PlaybackWriter keyboard, gamepad;
    PlaybackLeds leds;
    PlaybackClock clock;
    char message[128];
} Playback;

bool playback_payload_path(char *out, size_t capacity, const char *nro_path);
bool playback_load(Playback *p, const char *path);
bool playback_start(Playback *p, PlaybackWriter keyboard, PlaybackWriter gamepad,
                    PlaybackLeds leds, PlaybackClock clock, uint64_t now);
void playback_tick(Playback *p, uint64_t now, bool enabled);
void playback_stop(Playback *p);
void playback_free(Playback *p);
bool playback_ascii(uint8_t character, uint8_t leds, uint8_t report[8]);

bool playback_holding(const Playback *p);
