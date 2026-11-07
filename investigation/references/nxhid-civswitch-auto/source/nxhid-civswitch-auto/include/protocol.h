#pragma once
#include <stdbool.h>
#include <stdint.h>

#define NXHID_PORT 24872
#define NXHID_LINE_SIZE 96
#define NXHID_TIMEOUT_MS 3000

typedef enum { CMD_INVALID, CMD_PING, CMD_REPORT, CMD_LEDS, CMD_PAD, CMD_CAPS, CMD_TAP, CMD_PAD_TAP } CommandType;
typedef struct {
    CommandType type;
    uint8_t report[8];
    uint16_t hold_ms, gap_ms;
} Command;

static const uint8_t NXHID_PAD_NEUTRAL[8] = {0, 0, 8, 128, 128, 128, 128, 0};

Command protocol_parse(const char *line);

