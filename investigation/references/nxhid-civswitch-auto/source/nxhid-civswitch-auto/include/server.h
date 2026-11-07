#pragma once
#include "protocol.h"
#include <stddef.h>

typedef bool (*ReportWriter)(const uint8_t report[8]);
typedef uint8_t (*LedReader)(void);
typedef uint64_t (*ClockReader)(void);
typedef struct {
    int listener, client;
    uint64_t last_activity, tap_deadline;
    uint16_t tap_gap_ms;
    uint8_t tap_phase;
    bool tap_pad;
    char line[NXHID_LINE_SIZE], output[64], peer[48];
    size_t used, output_size, output_sent;
    ReportWriter write_report, write_pad;
    LedReader read_leds;
    ClockReader clock_ms;
    unsigned long reports;
} Server;

bool server_init(Server *s, uint16_t port, ReportWriter writer, LedReader reader);
void server_tick(Server *s, uint64_t now_ms, bool enabled);
void server_drop(Server *s);
void server_close(Server *s);

