#include "protocol.h"
#include <string.h>

static int unhex(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

// Parse bounded, unsigned decimal milliseconds followed by one space.
static const char *timing(const char *p, uint16_t *value) {
    unsigned result = 0;
    if (*p < '0' || *p > '9') return NULL;
    do {
        result = result * 10 + (unsigned)(*p++ - '0');
        if (result > 1000) return NULL;
    } while (*p >= '0' && *p <= '9');
    if (*p++ != ' ') return NULL;
    *value = (uint16_t)result;
    return p;
}

Command protocol_parse(const char *line) {
    Command cmd = {0};
    size_t len = strlen(line);
    if (!strcmp(line, "PING")) {
        cmd.type = CMD_PING;
    } else if (!strcmp(line, "CAPS")) {
        cmd.type = CMD_CAPS;
    } else if (!strcmp(line, "LEDS")) {
        cmd.type = CMD_LEDS;
    } else if (!strcmp(line, "RELEASE")) {
        cmd.type = CMD_REPORT;
    } else if (len == 23 && !memcmp(line, "REPORT ", 7)) {
        for (int i = 0; i < 8; i++) {
            int hi = unhex(line[7 + 2*i]), lo = unhex(line[8 + 2*i]);
            if (hi < 0 || lo < 0) return (Command){0};
            cmd.report[i] = (uint8_t)((hi << 4) | lo);
        }
        if (cmd.report[1]) return (Command){0};
        for (int i = 2; i < 8; i++) {
            unsigned key = cmd.report[i];
            if (key && (key < 4 || key > 0x73)) return (Command){0};
            for (int j = 2; key && j < i; j++)
                if (cmd.report[j] == key) return (Command){0};
        }
        cmd.type = CMD_REPORT;
    } else if (len == 20 && !memcmp(line, "PAD ", 4)) {
        for (int i = 0; i < 8; i++) {
            int hi = unhex(line[4 + 2*i]), lo = unhex(line[5 + 2*i]);
            if (hi < 0 || lo < 0) return (Command){0};
            cmd.report[i] = (uint8_t)((hi << 4) | lo);
        }
        if ((cmd.report[1] & 0xc0) || cmd.report[2] > 8 || cmd.report[7])
            return (Command){0};
        cmd.type = CMD_PAD;
    } else if (!strncmp(line, "TAP ", 4) || !strncmp(line, "PTAP ", 5)) {
        const bool pad = line[0] == 'P';
        const char *p = timing(line + (pad ? 5 : 4), &cmd.hold_ms);
        if (!p) return (Command){0};
        p = timing(p, &cmd.gap_ms);
        if (!p || cmd.hold_ms < 10 || cmd.hold_ms > 80 || strlen(p) != 16)
            return (Command){0};
        // Reuse exactly the same keyboard/gamepad report validation as raw commands.
        char raw[24];
        const char *prefix = pad ? "PAD " : "REPORT ";
        const size_t n = strlen(prefix);
        memcpy(raw, prefix, n);
        memcpy(raw+n, p, 17);
        Command report = protocol_parse(raw);
        if (report.type != (pad ? CMD_PAD : CMD_REPORT)) return (Command){0};
        memcpy(cmd.report, report.report, 8);
        cmd.type = pad ? CMD_PAD_TAP : CMD_TAP;
    }
    return cmd;
}


