#include "playback.h"
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_PAYLOAD (1024 * 1024)
#define MAX_LINES 4096
static const uint8_t neutral_key[8] = {0};
static const uint8_t neutral_pad[8] = {0,0,8,128,128,128,128,0};
static const uint8_t pad_a[8] = {4,0,8,128,128,128,128,0};
static const uint8_t escape_key[8] = {0,0,41};
static const uint8_t enter_key[8] = {0,0,40};
enum { PRE_DOWN, PRE_UP, ESC_DOWN, ESC_UP, OPEN_DOWN, OPEN_UP,
       CHAR_DOWN, CHAR_UP, ENTER1_DOWN, ENTER1_UP, ENTER2_DOWN, ENTER2_UP,
       SEPARATOR_DOWN, SEPARATOR_UP };

bool playback_payload_path(char *out, size_t capacity, const char *nro_path) {
    const char *slash = nro_path ? strrchr(nro_path, '/') : NULL;
    int n;
    if (slash) {
        const size_t directory = (size_t)(slash - nro_path + 1);
        if (directory >= capacity || directory > 4096) return false;
        n = snprintf(out, capacity, "%.*spayload.txt", (int)directory, nro_path);
    } else n = snprintf(out, capacity, "sdmc:/switch/nxhid/payload.txt");
    return n >= 0 && (size_t)n < capacity;
}

void playback_free(Playback *p) {
    free(p->lines);
    free(p->data);
    p->lines = NULL;
    p->data = NULL;
    p->count = 0;
}

static bool load_error(Playback *p, const char *text) {
    playback_free(p);
    p->state = PLAYBACK_ERROR;
    snprintf(p->message, sizeof(p->message), "%s", text);
    return false;
}

bool playback_load(Playback *p, const char *path) {
    if (p->state == PLAYBACK_RUNNING) return false;
    playback_free(p);
    p->line = p->character = 0;
    FILE *file = fopen(path, "rb");
    if (!file) {
        char error[128];
        snprintf(error, sizeof(error), "Cannot open payload.txt: %.85s", strerror(errno));
        return load_error(p, error);
    }
    if (fseek(file, 0, SEEK_END)) { fclose(file); return load_error(p, "Cannot measure payload.txt"); }
    const long size = ftell(file);
    if (size <= 0 || size > MAX_PAYLOAD || fseek(file, 0, SEEK_SET)) {
        fclose(file); return load_error(p, "Payload must contain 1 byte to 1 MiB");
    }
    p->data = malloc((size_t)size + 1);
    p->lines = malloc(MAX_LINES * sizeof(*p->lines));
    if (!p->data || !p->lines) { fclose(file); return load_error(p, "Not enough memory for payload"); }
    const size_t got = fread(p->data, 1, (size_t)size, file);
    const bool read_error = ferror(file);
    fclose(file);
    if (got != (size_t)size || read_error) return load_error(p, "Cannot read all of payload.txt");
    p->data[size] = 0;
    for (long i = 0; i < size; i++) {
        const unsigned char c = (unsigned char)p->data[i];
        if (c != '\n' && c != '\r' && (c < 32 || c > 126))
            return load_error(p, "Payload must be printable US ASCII with CRLF or LF line endings");
    }
    char *start = p->data;
    for (long i = 0; i <= size; i++) {
        if (i != size && p->data[i] != '\n') continue;
        if (i == size && start == p->data + size) break; // Final newline is not a blank message.
        char *end = p->data + i;
        if (end > start && end[-1] == '\r') end--;
        const size_t length = (size_t)(end - start);
        if (!length || length > 253 || p->count >= MAX_LINES)
            return load_error(p, "Payload has a blank/oversized line or more than 4096 lines");
        *end = 0;
        for (size_t j = 0; j < length; j++)
            if ((unsigned char)start[j] < 32) return load_error(p, "Unexpected control character inside a payload line");
        p->lines[p->count++] = start;
        start = p->data + i + 1;
    }
    for (size_t i = 0; i < p->count; i++) {
        char prefix[64];
        snprintf(prefix, sizeof(prefix), "%zu/%zu\"", i+1, p->count);
        if (strncmp(p->lines[i], prefix, strlen(prefix)))
            return load_error(p, "Payload indices invalid; use CivSwitch's generated payload.txt");
    }
    p->state = PLAYBACK_IDLE;
    snprintf(p->message, sizeof(p->message), "Payload loaded: %zu lines", p->count);
    return true;
}

bool playback_ascii(uint8_t c, uint8_t leds, uint8_t report[8]) {
    memset(report, 0, 8);
    uint8_t mod = 0, key = 0;
    if (c >= 'a' && c <= 'z') key = c - 'a' + 4;
    else if (c >= 'A' && c <= 'Z') { key = c - 'A' + 4; mod = 2; }
    else if (c >= '1' && c <= '9') key = c - '1' + 30;
    else if (c == '0') key = 39;
    else {
        static const char plain[] = " -=[]\\;'`,./";
        static const char shift[] = "!@#$%^&*()_+{}|:\"~<>?";
        static const uint8_t plain_keys[] = {44,45,46,47,48,49,51,52,53,54,55,56};
        static const uint8_t shift_keys[] = {30,31,32,33,34,35,36,37,38,39,45,46,47,48,49,51,52,53,54,55,56};
        const char *found = c ? strchr(plain, c) : NULL;
        if (found) key = plain_keys[found - plain];
        else if (c && (found = strchr(shift, c))) { mod = 2; key = shift_keys[found - shift]; }
        else return false;
    }
    if (key >= 4 && key <= 29 && (leds & 2)) mod ^= 2;
    report[0] = mod;
    report[2] = key;
    return true;
}

static uint64_t current_time(Playback *p, uint64_t fallback) { return p->clock ? p->clock() : fallback; }
static void release_all(Playback *p) {
    if (p->keyboard) p->keyboard(neutral_key);
    if (p->gamepad) p->gamepad(neutral_pad);
}
void playback_stop(Playback *p) {
    if (p->state != PLAYBACK_RUNNING) return;
    release_all(p);
    p->state = PLAYBACK_STOPPED;
    snprintf(p->message, sizeof(p->message), "Stopped at line %zu/%zu. Press - to restart from line 1.", p->line+1, p->count);
}

bool playback_start(Playback *p, PlaybackWriter keyboard, PlaybackWriter gamepad,
                    PlaybackLeds leds, PlaybackClock clock, uint64_t now) {
    if (!p->count || !keyboard || !gamepad || p->state == PLAYBACK_RUNNING) return false;
    p->keyboard = keyboard;
    p->gamepad = gamepad;
    p->leds = leds;
    p->clock = clock;
    if (!keyboard(neutral_key) || !gamepad(neutral_pad)) {
        p->state = PLAYBACK_ERROR;
        snprintf(p->message, sizeof(p->message), "Cannot release input before playback");
        release_all(p);
        return false;
    }
    p->line = p->character = 0;
    p->preamble = 0;
    p->stage = PRE_DOWN;
    p->deadline = current_time(p, now) + 5000;
    p->state = PLAYBACK_RUNNING;
    snprintf(p->message, sizeof(p->message), "Starting in 5 seconds. B stops playback.");
    return true;
}

static bool send_report(Playback *p, bool pad, const uint8_t report[8], unsigned stage,
                        unsigned delay, uint64_t now) {
    if (!(pad ? p->gamepad : p->keyboard)(report)) {
        p->state = PLAYBACK_ERROR;
        snprintf(p->message, sizeof(p->message), "USB input failed at line %zu/%zu", p->line+1, p->count);
        release_all(p);
        return false;
    }
    p->stage = stage;
    p->deadline = current_time(p, now) + delay;
    return true;
}

void playback_tick(Playback *p, uint64_t now, bool enabled) {
    if (p->state != PLAYBACK_RUNNING) return;
    if (!enabled) {
        playback_stop(p);
        p->state = PLAYBACK_ERROR;
        snprintf(p->message, sizeof(p->message), "Playback stopped: USB unavailable or NXHID not in foreground");
        return;
    }
    if (now < p->deadline) return;
    snprintf(p->message, sizeof(p->message), "Typing line %zu/%zu. B stops playback.", p->line+1, p->count);
    switch (p->stage) {
    case PRE_DOWN: send_report(p, true, pad_a, PRE_UP, 50, now); break;
    case PRE_UP:
        p->preamble++;
        send_report(p, true, neutral_pad, p->preamble < 5 ? PRE_DOWN : ESC_DOWN, 800, now);
        break;
    case ESC_DOWN: send_report(p, false, escape_key, ESC_UP, 40, now); break;
    case ESC_UP: send_report(p, false, neutral_key, OPEN_DOWN, 800, now); break;
    case OPEN_DOWN: send_report(p, true, pad_a, OPEN_UP, 50, now); break;
    case OPEN_UP: send_report(p, true, neutral_pad, CHAR_DOWN, 1200, now); break;
    case CHAR_DOWN: {
        uint8_t report[8];
        if (!playback_ascii((uint8_t)p->lines[p->line][p->character], p->leds ? p->leds() : 0, report)) {
            p->state = PLAYBACK_ERROR;
            snprintf(p->message, sizeof(p->message), "Unsupported character in payload");
            release_all(p);
            return;
        }
        send_report(p, false, report, CHAR_UP, 40, now);
        break;
    }
    case CHAR_UP:
        p->character++;
        send_report(p, false, neutral_key, p->lines[p->line][p->character] ? CHAR_DOWN : ENTER1_DOWN, 40, now);
        break;
    case ENTER1_DOWN: send_report(p, false, enter_key, ENTER1_UP, 40, now); break;
    case ENTER1_UP: send_report(p, false, neutral_key, ENTER2_DOWN, 200, now); break;
    case ENTER2_DOWN: send_report(p, false, enter_key, ENTER2_UP, 40, now); break;
    case ENTER2_UP:
        if (!send_report(p, false, neutral_key, SEPARATOR_DOWN, 800, now)) break;
        if (p->line + 1 == p->count) {
            p->state = PLAYBACK_DONE;
            snprintf(p->message, sizeof(p->message), "All %zu lines sent. Check the target console.", p->count);
        } else {
            p->line++;
            p->character = 0;
        }
        break;
    case SEPARATOR_DOWN: send_report(p, true, pad_a, SEPARATOR_UP, 50, now); break;
    case SEPARATOR_UP: send_report(p, true, neutral_pad, ESC_DOWN, 1200, now); break;
    default:
        playback_stop(p);
        p->state = PLAYBACK_ERROR;
        snprintf(p->message, sizeof(p->message), "Invalid local playback state");
    }
}

bool playback_holding(const Playback *p) {
    if (p->state != PLAYBACK_RUNNING) return false;
    return p->stage == PRE_UP || p->stage == ESC_UP || p->stage == OPEN_UP ||
        p->stage == CHAR_UP || p->stage == ENTER1_UP || p->stage == ENTER2_UP || p->stage == SEPARATOR_UP;
}
