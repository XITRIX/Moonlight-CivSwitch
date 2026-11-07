#include <switch.h>
#include <arpa/inet.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include "server.h"
#include "usb_keyboard.h"
#ifdef NXHID_GAMEPAD
#include "playback.h"
#endif

static Result usb_fault;

static bool write_report(const uint8_t report[8]) {
    // Never reuse a DMA buffer following a failed transfer before teardown.
    if (R_FAILED(usb_fault)) return false;
    Result rc = usb_keyboard_write(report);
    if (rc == KERNELRESULT(InvalidState) && !usb_keyboard_ready()) return false;
    usb_fault = rc;
    return R_SUCCEEDED(usb_fault);
}

#ifdef NXHID_GAMEPAD
static bool write_pad(const uint8_t report[8]) {
    if (R_FAILED(usb_fault)) return false;
    Result rc = usb_gamepad_write(report);
    if (rc == KERNELRESULT(InvalidState) && !usb_keyboard_ready()) return false;
    usb_fault = rc;
    return R_SUCCEEDED(usb_fault);
}
#endif

static u64 milliseconds(void) { return armTicksToNs(armGetSystemTick()) / 1000000; }

int main(int argc, char **argv) {
    consoleInit(NULL);
    padConfigureInput(1, HidNpadStyleSet_NpadStandard);
    PadState pad;
    padInitializeDefault(&pad);
    bool sockets = false, network = false, usb = false;
    Server server = {.listener = -1, .client = -1};
    char message[160] = "";
    Result rc = 0;
#ifdef NXHID_GAMEPAD
    FILE *usb_log = NULL;
    Playback playback = {0};
    char payload_path[1024] = {0};
    const bool valid_payload_path = playback_payload_path(payload_path, sizeof(payload_path), argc > 0 ? argv[0] : NULL);
#else
    (void)argc;
    (void)argv;
#endif

    if (appletGetAppletType() != AppletType_Application) {
        snprintf(message, sizeof(message), "Full application mode required. Hold R while launching a game, then open NXHID.");
        goto error;
    }
    rc = appletSetFocusHandlingMode(AppletFocusHandlingMode_NoSuspend);
    if (R_FAILED(rc)) {
        snprintf(message, sizeof(message), "Could not configure application focus.");
        goto error;
    }
    rc = socketInitializeDefault();
    if (R_FAILED(rc)) {
        snprintf(message, sizeof(message), "Could not initialize networking.");
        goto error;
    }
    sockets = true;
    rc = nifmInitialize(NifmServiceType_User);
    if (R_FAILED(rc)) {
        snprintf(message, sizeof(message), "Could not initialize Wi-Fi.");
        goto error;
    }
    network = true;
    rc = usb_keyboard_init();
    if (R_FAILED(rc)) {
        snprintf(message, sizeof(message), "Could not initialize the USB keyboard.");
        goto error;
    }
    usb = true;
    if (!server_init(&server, NXHID_PORT, write_report, usb_keyboard_leds)) {
        snprintf(message, sizeof(message), "Cannot listen on TCP %d: %s", NXHID_PORT, strerror(errno));
        goto error;
    }
#ifdef NXHID_GAMEPAD
    server.write_pad = write_pad;
#endif
    server.clock_ms = milliseconds;
    appletSetAutoSleepDisabled(true);
    u64 next_draw = 0, usb_retry_at = 0;
    bool usb_recovering = false, usb_notice = false;
    Result last_usb_error = 0;
    char last_usb_stage[128] = "";
#ifdef NXHID_GAMEPAD
    unsigned usb_errors_logged = 0;
    char logged_bus_status[112] = "", logged_readiness[112] = "";
    char log_path[1024] = {0};
    if (valid_payload_path) {
        snprintf(log_path, sizeof(log_path), "%s", payload_path);
        char *name = strrchr(log_path, '/');
        if (name) snprintf(name+1, sizeof(log_path)-(size_t)(name+1-log_path), "usb.log");
        usb_log = fopen(log_path, "w");
        if (usb_log) { fprintf(usb_log, "NXHID v0.4.4 USB diagnostics\n"); fflush(usb_log); }
    }
#endif
    while (appletMainLoop()) {
        padUpdate(&pad);
        bool focused = appletGetFocusState() == AppletFocusState_InFocus;
        u64 down = focused ? padGetButtonsDown(&pad) : 0;
        if (down & HidNpadButton_Plus) break;
        if (down & HidNpadButton_B) {
#ifdef NXHID_GAMEPAD
            playback_stop(&playback);
#endif
            server_drop(&server);
            snprintf(message, sizeof(message), "Sender disconnected. Waiting for a new connection.");
        }
        if (!usb && usb_recovering && milliseconds() >= usb_retry_at) {
            rc = usb_keyboard_init();
            if (R_FAILED(rc)) {
                snprintf(message, sizeof(message), "Could not restart the USB keyboard.");
                goto error;
            }
            usb = true;
            usb_recovering = false;
        }
        if (usb && R_SUCCEEDED(usb_fault)) usb_fault = usb_keyboard_tick();
        bool ready = usb && R_SUCCEEDED(usb_fault) && usb_keyboard_ready();
#ifdef NXHID_GAMEPAD
        if ((down & HidNpadButton_Minus) && !(down & HidNpadButton_B) && playback.state != PLAYBACK_RUNNING) {
            if (!ready) {
                snprintf(message, sizeof(message), "Wait for Keyboard ready before starting payload.txt.");
            } else if (!valid_payload_path) {
                snprintf(message, sizeof(message), "Cannot resolve payload.txt path next to this NRO.");
            } else {
                server_drop(&server);
                if (playback_load(&playback, payload_path))
                    playback_start(&playback, write_report, write_pad, usb_keyboard_leds, milliseconds, milliseconds());
                snprintf(message, sizeof(message), "%s", playback.message);
            }
        }
        playback_tick(&playback, milliseconds(), ready && focused);
        ready = usb && R_SUCCEEDED(usb_fault) && usb_keyboard_ready();
        server_tick(&server, milliseconds(), ready && focused && playback.state != PLAYBACK_RUNNING);
#else
        server_tick(&server, milliseconds(), ready && focused);
#endif
        if (R_FAILED(usb_fault)) {
            ready = false;
            last_usb_error = usb_fault;
            snprintf(last_usb_stage, sizeof(last_usb_stage), "%s", usb_keyboard_error_stage());
            server_drop(&server);
#ifdef NXHID_GAMEPAD
            playback_stop(&playback);
#endif
            snprintf(message, sizeof(message), "USB error %08x; reconnecting.", usb_fault);
            usb_keyboard_exit();
            usb = false;
            usb_fault = 0;
            usb_notice = usb_recovering = true;
            usb_retry_at = milliseconds() + 500;
#ifdef NXHID_GAMEPAD
            if (usb_log && usb_errors_logged++ < 64) {
                fprintf(usb_log, "t=%llu error=%08x module=%u description=%u stage=%s\n",
                        (unsigned long long)milliseconds(), last_usb_error,
                        last_usb_error & 0x1ff, (last_usb_error >> 9) & 0x1fff, last_usb_stage);
                fflush(usb_log);
            }
#endif
        }
        if (ready && usb_notice) {
            usb_notice = false;
            message[0] = 0;
#ifdef NXHID_GAMEPAD
            if (usb_log) { fprintf(usb_log, "USB ready at t=%llu\n", (unsigned long long)milliseconds()); fflush(usb_log); }
#endif
        }
        if (server.client >= 0) message[0] = 0;
        u64 now = milliseconds();
        bool holding_input = server.tap_phase == 1;
#ifdef NXHID_GAMEPAD
        holding_input = holding_input || playback_holding(&playback);
#endif
        // Console rendering / Wi-Fi status calls must not lengthen a held tap.
        if (focused && !holding_input && now >= next_draw) {
            next_draw = now + 250;
            u32 ip = 0;
            char address[32] = "Wi-Fi not connected";
            bool has_ip = R_SUCCEEDED(nifmGetCurrentIpAddress(&ip)) && ip;
            if (has_ip)
                inet_ntop(AF_INET, &ip, address, sizeof(address));
            const char *status = message;
            if (!*status) {
                if (!ready)
                    status = "Connect the Switch USB-C port directly to the target device.";
                else if (server.client >= 0)
                    status = "Forwarding keyboard input.";
#ifdef NXHID_GAMEPAD
                else if (!has_ip)
                    status = "Ready. Press - for payload.txt; Wi-Fi is optional.";
#else
                else if (!has_ip)
                    status = "Connect the Switch to Wi-Fi.";
#endif
                else
                    status = "Ready. Connect a sender to the Switch IP shown above.";
            }
            printf("\x1b[2J\x1b[HNXHID v0.4.4 - USB diagnostics and local payload\n\n");
            printf("Switch IP:  %s\nTCP port:   %d\n\n", address, NXHID_PORT);
            printf("USB:        %s\nSender:     %s\nReports:    %lu\n", ready ? "Keyboard ready" : usb_keyboard_wait_reason(), server.client >= 0 ? server.peer : "Waiting", server.reports);
            u8 leds = usb_keyboard_leds();
#ifdef NXHID_GAMEPAD
            printf("Gamepad:    Hori-compatible (automatic CivSwitch enabled)\n");
            const char *bus = usb_keyboard_bus_status();
            printf("USB bus:    %.65s\n", bus);
            const char *readiness = usb_keyboard_readiness_detail();
            printf("Readiness:  %.65s\n", readiness);
            if (usb_log && strcmp(logged_readiness, readiness)) {
                snprintf(logged_readiness, sizeof(logged_readiness), "%s", readiness);
                fprintf(usb_log, "t=%llu readiness=%s reason=%s\n", (unsigned long long)milliseconds(), readiness, usb_keyboard_wait_reason());
                fflush(usb_log);
            }
            if (usb_log && strcmp(logged_bus_status, bus)) {
                snprintf(logged_bus_status, sizeof(logged_bus_status), "%s", bus);
                fprintf(usb_log, "t=%llu bus=%s\n", (unsigned long long)milliseconds(), bus);
                fflush(usb_log);
            }
#endif
            printf("Host LEDs:  Num %s  Caps %s  Scroll %s\n\n", leds & 1 ? "on" : "off", leds & 2 ? "on" : "off", leds & 4 ? "on" : "off");
            if (!ready && last_usb_error) {
                printf("USB error:  %08x\nStage:      %.67s\n\n", last_usb_error, last_usb_stage);
            }
#ifdef NXHID_GAMEPAD
            printf("Payload:    %.65s\n", payload_path);
            if (playback.count)
                printf("Local:      line %lu/%lu, character %lu\n", (unsigned long)playback.line+1,
                       (unsigned long)playback.count, (unsigned long)playback.character);
            printf("-: run payload.txt    B: stop/disconnect    +: exit\n\n");
            printf("%s\n\n", playback.state != PLAYBACK_IDLE ? playback.message : status);
#else
            printf("B: disconnect sender    +: exit\n\n%s\n\n", status);
#endif
            printf("Computer -> Wi-Fi -> Switch -> USB -> target device\n");
            consoleUpdate(NULL);
        }
        svcSleepThread(1000000);
    }
    goto cleanup;
error:
    server_close(&server);
    if (usb) { usb_keyboard_exit(); usb = false; }
    bool error_drawn = false;
    while (appletMainLoop()) {
        padUpdate(&pad);
        if (appletGetFocusState() == AppletFocusState_InFocus) {
            if (padGetButtonsDown(&pad) & HidNpadButton_Plus) break;
            if (!error_drawn) {
                printf("\x1b[2J\x1b[HNXHID could not continue.\n");
                if (R_FAILED(rc)) printf("Result: %08x\n", rc);
                printf("%s\n\nPress + to exit.\n", message);
                consoleUpdate(NULL);
                error_drawn = true;
            }
        } else {
            error_drawn = false;
        }
        svcSleepThread(10000000);
    }
cleanup:
#ifdef NXHID_GAMEPAD
    playback_stop(&playback);
    playback_free(&playback);
    if (usb_log) fclose(usb_log);
#endif
    server_close(&server);
    if (usb) usb_keyboard_exit();
    if (network) nifmExit();
    if (sockets) socketExit();
    appletSetAutoSleepDisabled(false);
    consoleExit(NULL);
    return 0;
}

