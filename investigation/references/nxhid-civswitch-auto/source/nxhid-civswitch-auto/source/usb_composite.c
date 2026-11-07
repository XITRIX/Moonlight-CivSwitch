#ifdef NXHID_GAMEPAD
/* Composite HID port derived from NXHID (MIT) and CivSwitch PicoSwitch.
 * Copyright (c) 2021 Jason Skuby (gamepad report descriptor).
 * See LICENSE and CIVSWITCH-AUTO.md for attribution and validation limits.
 */
#include "usb_keyboard.h"
#include <string.h>
#include <stdio.h>

// The same wired controller identity/report format used by CivSwitch PicoSwitch.
// Compatibility identity only; this unofficial build is not a Hori product.
#define NXHID_USB_VID 0x0f0d
#define NXHID_USB_PID 0x0092

// Boot-compatible keyboard: modifiers, reserved byte, six key usages; LED output.
static const u8 report_descriptor[] = {
    0x05,0x01, 0x09,0x06, 0xA1,0x01, 0x05,0x07,
    0x19,0xE0, 0x29,0xE7, 0x15,0x00, 0x25,0x01,
    0x75,0x01, 0x95,0x08, 0x81,0x02,
    0x95,0x01, 0x75,0x08, 0x81,0x01,
    0x95,0x05, 0x75,0x01, 0x05,0x08,
    0x19,0x01, 0x29,0x05, 0x91,0x02,
    0x95,0x01, 0x75,0x03, 0x91,0x01,
    0x95,0x06, 0x75,0x08, 0x15,0x00, 0x25,0x73,
    0x05,0x07, 0x19,0x00, 0x29,0x73, 0x81,0x00, 0xC0
};
typedef struct {
    UsbDsInterface *interface;
    UsbDsEndpoint *endpoint, *out_endpoint;
    bool was_ready, input_pending, release_pending, input_is_release, out_pending, descriptor_ready;
    u32 input_id, out_id;
    u8 control_buffer[0x1000] __attribute__((aligned(0x1000)));
    u8 input_buffer[0x1000] __attribute__((aligned(0x1000)));
    u8 output_buffer[0x1000] __attribute__((aligned(0x1000)));
    u8 last_report[8], idle_rate, protocol, leds;
    u8 echo_report[8];
    bool echo_pending;
    u64 last_sent;
    struct usb_control_setup last_setup;
} HidInterface;
static HidInterface hid[2], *current = &hid[1];
static bool initialized;
static Result fault;
static bool bus_known;
static UsbState bus_state;
static unsigned bus_restarts;
static char bus_status[112] = "not attached";
static Result read_state(UsbState *state);
const char *usb_keyboard_bus_status(void) { return bus_status; }
static char trace_context[128] = "USB initialization";
static char fault_context[128];
static void trace_stage(const char *operation, size_t bytes) {
    const struct usb_control_setup *s = &current->last_setup;
    snprintf(trace_context, sizeof(trace_context),
             "if%u %.45s n=%zu req=%02x/%02x v=%04x len=%u",
             current == &hid[0] ? 0u : 1u, operation, bytes,
             s->bmRequestType, s->bRequest, s->wValue, s->wLength);
}
const char *usb_keyboard_error_stage(void) {
    return *fault_context ? fault_context : trace_context;
}
static const u8 key_neutral[8] = {0};
static const u8 pad_neutral[8] = {0, 0, 8, 128, 128, 128, 128, 0};
// MIT, Jason Skuby / CivSwitch PicoSwitch/include/SwitchConsts.h.
static const u8 pad_descriptor[] = {
    0x05,0x01,0x09,0x05,0xa1,0x01,0x15,0x00,0x25,0x01,
    0x35,0x00,0x45,0x01,0x75,0x01,0x95,0x10,0x05,0x09,
    0x19,0x01,0x29,0x10,0x81,0x02,0x05,0x01,0x25,0x07,
    0x46,0x3b,0x01,0x75,0x04,0x95,0x01,0x65,0x14,0x09,
    0x39,0x81,0x42,0x65,0x00,0x95,0x01,0x81,0x01,0x26,
    0xff,0x00,0x46,0xff,0x00,0x09,0x30,0x09,0x31,0x09,
    0x32,0x09,0x35,0x75,0x08,0x95,0x04,0x81,0x02,0x06,
    0x00,0xff,0x09,0x20,0x95,0x01,0x81,0x02,0x0a,0x21,
    0x26,0x95,0x08,0x91,0x02,0xc0
};

static const u8 *neutral(void) { return current == &hid[0] ? pad_neutral : key_neutral; }

// EP0 is shared by both HID interfaces. Only one control transfer owns the
// DMA buffers at a time; completion is retired before another SETUP is served.
enum { CTRL_IDLE, CTRL_IN_DATA, CTRL_OUT_STATUS, CTRL_OUT_DATA, CTRL_IN_STATUS };
typedef struct {
    HidInterface *wire, *target;
    struct usb_control_setup request;
    unsigned phase, notified;
    bool pending, descriptor, update_leds, aborted;
    u32 id, expected;
    u64 started;
} ControlTransfer;
static ControlTransfer control;
static struct {
    bool valid;
    unsigned notified;
    HidInterface *wire;
    struct usb_control_setup request;
} next_setup;
static u8 ctrl_in_buffer[0x1000] __attribute__((aligned(0x1000)));
static u8 ctrl_out_buffer[0x1000] __attribute__((aligned(0x1000)));


enum {
    REPORT_TIMEOUT_MS = 250,
    EVENT_POLL_NS = 1000000,
};

static u64 milliseconds(void) { return armTicksToNs(armGetSystemTick()) / 1000000; }
static Result io_error(void) { return MAKERESULT(Module_Libnx, LibnxError_IoError); }
static Result remember_error(Result rc) {
    if (R_FAILED(rc)) {
        if (R_SUCCEEDED(fault)) snprintf(fault_context, sizeof(fault_context), "%s", trace_context);
        fault = rc;
    }
    return rc;
}

// Resetting an event that is not signaled fails with InvalidState; that is not a fault.
static Result clear_event(Event *event) {
    Result rc = eventClear(event);
    return rc == KERNELRESULT(InvalidState) ? 0 : rc;
}

void usb_keyboard_exit(void) {
    if (initialized) usbDsExit();
    initialized = false;
    fault = 0;
    memset(hid, 0, sizeof(hid));
    memset(&control, 0, sizeof(control));
    memset(&next_setup, 0, sizeof(next_setup));
    current = &hid[1];
    bus_known = false;
}

Result usb_keyboard_init(void) {
    if (initialized) return MAKERESULT(Module_Libnx, LibnxError_AlreadyInitialized);
    if (hosversionBefore(5, 0, 0)) return MAKERESULT(Module_Libnx, LibnxError_IncompatSysVer);
    fault_context[0] = 0;
    trace_stage("usbDsInitialize", 0);
    Result rc = usbDsInitialize();
    if (R_FAILED(rc)) return rc;
    initialized = true;
#define TRY(expr) do { trace_stage(#expr, 0); rc = (expr); if (R_FAILED(rc)) { remember_error(rc); goto fail; } } while (0)
    TRY(usbDsClearDeviceData());
    u8 language, manufacturer, product;
    const u16 langs[] = {0x0409};
    TRY(usbDsAddUsbLanguageStringDescriptor(&language, langs, 1));
    TRY(usbDsAddUsbStringDescriptor(&manufacturer, "NXHID"));
    TRY(usbDsAddUsbStringDescriptor(&product, "NXHID CivSwitch Keyboard and Controller"));
    struct usb_device_descriptor device = {
        .bLength = USB_DT_DEVICE_SIZE, .bDescriptorType = USB_DT_DEVICE,
        .bcdUSB = 0x0200, .bMaxPacketSize0 = 64,
        .idVendor = NXHID_USB_VID, .idProduct = NXHID_USB_PID,
        .bcdDevice = 0x0100, .iManufacturer = manufacturer, .iProduct = product,
        .bNumConfigurations = 1
    };
    TRY(usbDsSetUsbDeviceDescriptor(UsbDeviceSpeed_Full, &device));
    TRY(usbDsSetUsbDeviceDescriptor(UsbDeviceSpeed_High, &device));
    device.bcdUSB = 0x0300;
    device.bMaxPacketSize0 = 9;
    TRY(usbDsSetUsbDeviceDescriptor(UsbDeviceSpeed_Super, &device));
    const u8 bos[] = {5,USB_DT_BOS,22,0,2,7,USB_DT_DEVICE_CAPABILITY,2,2,0,0,0,
                     10,USB_DT_DEVICE_CAPABILITY,3,0,0x0e,0,1,0,0,0};
    TRY(usbDsSetBinaryObjectStore(bos, sizeof(bos)));
    memset(hid, 0, sizeof(hid));
    for (u8 index = 0; index < 2; index++) {
        current = &hid[index];
        const bool pad = index == 0;
        TRY(usbDsRegisterInterfaceEx(&current->interface, index));
        struct usb_interface_descriptor intf = {
            .bLength = USB_DT_INTERFACE_SIZE, .bDescriptorType = USB_DT_INTERFACE,
            .bInterfaceNumber = index, .bNumEndpoints = 2,
            .bInterfaceClass = USB_CLASS_HID,
            .bInterfaceSubClass = pad ? 0 : 1, .bInterfaceProtocol = pad ? 0 : 1
        };
        const size_t desc_size = pad ? sizeof(pad_descriptor) : sizeof(report_descriptor);
        const u8 desc[] = {9,USB_DT_HID,0x11,0x01,0,1,USB_DT_REPORT,
                          desc_size & 0xff, desc_size >> 8};
        struct usb_endpoint_descriptor ep = {
            .bLength = USB_DT_ENDPOINT_SIZE, .bDescriptorType = USB_DT_ENDPOINT,
            .bEndpointAddress = pad ? 0x81 : 0x83,
            .bmAttributes = USB_TRANSFER_TYPE_INTERRUPT,
            .wMaxPacketSize = pad ? 64 : 8, .bInterval = 1
        };
        struct usb_ss_endpoint_companion_descriptor companion = {
            .bLength = 6, .bDescriptorType = USB_DT_SS_ENDPOINT_COMPANION,
            .wBytesPerInterval = pad ? 64 : 8
        };
        for (UsbDeviceSpeed speed = UsbDeviceSpeed_Full; speed <= UsbDeviceSpeed_Super; speed++) {
            ep.bInterval = speed == UsbDeviceSpeed_Full ? 1 : 4;
            TRY(usbDsInterface_AppendConfigurationData(current->interface, speed, &intf, sizeof(intf)));
            TRY(usbDsInterface_AppendConfigurationData(current->interface, speed, desc, sizeof(desc)));
            // Match PicoSwitch's gamepad descriptor ordering: OUT then IN.
            if (pad) {
                struct usb_endpoint_descriptor out = ep;
                out.bEndpointAddress = 0x02;
                TRY(usbDsInterface_AppendConfigurationData(current->interface, speed, &out, sizeof(out)));
                if (speed == UsbDeviceSpeed_Super)
                    TRY(usbDsInterface_AppendConfigurationData(current->interface, speed, &companion, sizeof(companion)));
            }
            TRY(usbDsInterface_AppendConfigurationData(current->interface, speed, &ep, sizeof(ep)));
            if (speed == UsbDeviceSpeed_Super)
                TRY(usbDsInterface_AppendConfigurationData(current->interface, speed, &companion, sizeof(companion)));
            if (!pad) {
                struct usb_endpoint_descriptor out = ep;
                out.bEndpointAddress = 0x03;
                TRY(usbDsInterface_AppendConfigurationData(current->interface, speed, &out, sizeof(out)));
                if (speed == UsbDeviceSpeed_Super)
                    TRY(usbDsInterface_AppendConfigurationData(current->interface, speed, &companion, sizeof(companion)));
            }
        }
        if (pad) TRY(usbDsInterface_RegisterEndpoint(current->interface, &current->out_endpoint, 0x02));
        TRY(usbDsInterface_RegisterEndpoint(current->interface, &current->endpoint, pad ? 0x81 : 0x83));
        if (!pad) TRY(usbDsInterface_RegisterEndpoint(current->interface, &current->out_endpoint, 0x03));
        TRY(usbDsInterface_EnableInterface(current->interface));
        memcpy(current->last_report, neutral(), 8);
        current->protocol = 1;
        current->last_sent = milliseconds();
        current->release_pending = true;
    }
    TRY(usbDsEnable());
#undef TRY
    return 0;
fail:
    usb_keyboard_exit();
    return rc;
}

bool usb_keyboard_ready(void) {
    if (!initialized || R_FAILED(fault) || !bus_known || bus_state != UsbState_Configured)
        return false;
    if (!hid[1].descriptor_ready) return false;
    for (unsigned i = 0; i < 2; i++)
        if (!hid[i].was_ready || hid[i].release_pending) return false;
    return true;
}

const char *usb_keyboard_wait_reason(void) {
    if (!initialized) return "USB not initialized";
    if (R_FAILED(fault)) return "USB I/O error";
    if (!bus_known || bus_state != UsbState_Configured) return "Waiting for USB configuration";
    if (!hid[1].descriptor_ready) return "Waiting for keyboard descriptor delivery";
    if (hid[1].release_pending) return "Waiting for keyboard input polling";
    if (hid[0].release_pending) return "Waiting for controller input polling";
    if (!hid[0].was_ready || !hid[1].was_ready) return "Waiting for interface configuration";
    return "Keyboard ready";
}

const char *usb_keyboard_readiness_detail(void) {
    static char detail[112];
    static const char *phases[] = {"idle", "IN-data", "OUT-status", "OUT-data", "IN-status"};
    snprintf(detail, sizeof(detail), "desc=%s key=%s pad=%s ctrl=%s",
             hid[1].descriptor_ready ? "yes" : "no",
             hid[1].release_pending ? "wait" : "ok",
             hid[0].release_pending ? "wait" : "ok",
             control.phase < 5 ? phases[control.phase] : "invalid");
    return detail;
}

uint8_t usb_keyboard_leds(void) { current = &hid[1]; return current->leds; }

static void trace_control(const char *operation, size_t size) {
    char label[64];
    snprintf(label, sizeof(label), "%s target%u", operation, control.target == &hid[0] ? 0u : 1u);
    current = control.wire;
    trace_stage(label, size);
}

static Result capture_setup(void) {
    // Some usb:ds/host combinations can notify more than one interface about
    // EP0. Consume notifications first and route by wIndex; never stall merely
    // because a valid request names the other interface that we also own.
    for (unsigned i = 0; i < 2; i++) {
        HidInterface *port = &hid[i];
        Result rc = eventWait(&port->interface->SetupEvent, 0);
        if (rc == KERNELRESULT(TimedOut)) continue;
        current = port;
        if (R_FAILED(rc)) { trace_stage("SETUP event", 0); return rc; }
        trace_stage("clear SETUP event", 0);
        rc = clear_event(&port->interface->SetupEvent);
        if (R_FAILED(rc)) return rc;
        struct usb_control_setup request;
        trace_stage("read SETUP packet", sizeof(request));
        rc = usbDsInterface_GetSetupPacket(port->interface, &request, sizeof(request));
        if (R_FAILED(rc)) return rc;
        port->last_setup = request;
        const unsigned bit = 1u << i;
        if (next_setup.valid && !memcmp(&next_setup.request, &request, sizeof(request))) {
            next_setup.notified |= bit;
            continue; // Same shared EP0 notification, not a second request.
        }
        if (control.phase != CTRL_IDLE && !(control.notified & bit) &&
                !memcmp(&control.request, &request, sizeof(request))) {
            control.notified |= bit;
            continue; // The second interface can be notified on a later tick.
        }
        // A different new SETUP supersedes the previous control transaction.
        next_setup.valid = true;
        next_setup.notified = bit;
        next_setup.wire = port;
        next_setup.request = request;
    }
    return 0;
}

static Result queue_control(bool in, size_t size, unsigned phase) {
    if (control.pending) return io_error();
    Event *event = in ? &control.wire->interface->CtrlInCompletionEvent
                      : &control.wire->interface->CtrlOutCompletionEvent;
    trace_control(in ? "control IN clear" : "control OUT clear", size);
    Result rc = clear_event(event);
    if (R_FAILED(rc)) return rc;
    trace_control(in ? "control IN queue" : "control OUT queue", size);
    rc = in ? usbDsInterface_CtrlInPostBufferAsync(control.wire->interface, ctrl_in_buffer, size, &control.id)
            : usbDsInterface_CtrlOutPostBufferAsync(control.wire->interface, ctrl_out_buffer, size, &control.id);
    if (R_FAILED(rc)) {
        // A host may start a new SETUP between IN completion and OUT status.
        // A rejected queue owns no DMA buffer; serve the new request if present.
        char failed_stage[sizeof(trace_context)];
        snprintf(failed_stage, sizeof(failed_stage), "%s", trace_context);
        Result setup_rc = capture_setup();
        if (R_SUCCEEDED(setup_rc) && next_setup.valid) { control.phase = CTRL_IDLE; return 0; }
        // EP0 is physically shared. If usb:ds rejects the keyboard descriptor
        // through interface 1 before accepting a URB, try its primary session
        // once, preserving the requested target interface and descriptor bytes.
        const bool descriptor_on_secondary = rc == 0x25c8c && in && phase == CTRL_IN_DATA &&
            control.wire == &hid[1] && control.target == &hid[1] &&
            control.request.bmRequestType == 0x81 && control.request.bRequest == USB_REQUEST_GET_DESCRIPTOR &&
            control.request.wValue == (USB_DT_REPORT << 8);
        if (!descriptor_on_secondary) {
            snprintf(trace_context, sizeof(trace_context), "%s", failed_stage);
            return rc;
        }
        control.wire = &hid[0];
        control.wire->last_setup = control.request;
        trace_control("control IN primary clear", size);
        rc = clear_event(&control.wire->interface->CtrlInCompletionEvent);
        if (R_FAILED(rc)) return rc;
        trace_control("control IN primary queue", size);
        rc = usbDsInterface_CtrlInPostBufferAsync(control.wire->interface, ctrl_in_buffer, size, &control.id);
        if (R_FAILED(rc)) return rc;
    }
    control.phase = phase;
    control.pending = true;
    control.expected = (u32)size;
    control.started = milliseconds();
    return 0;
}

static Result reply_control(const void *data, size_t size) {
    if (!control.request.wLength) return usbDsInterface_StallCtrl(control.wire->interface);
    if (size > control.request.wLength) size = control.request.wLength;
    if (size) memcpy(ctrl_in_buffer, data, size);
    return queue_control(true, size, CTRL_IN_DATA);
}

static Result dispatch_setup(void) {
    control.wire = next_setup.wire;
    control.request = next_setup.request;
    control.notified = next_setup.notified;
    next_setup.valid = false;
    control.descriptor = control.update_leds = control.aborted = false;
    current = control.wire;
    const struct usb_control_setup *s = &control.request;
    if (s->wIndex >= 2) return usbDsInterface_StallCtrl(control.wire->interface);
    control.target = &hid[s->wIndex];
    control.target->last_setup = *s;
    const u8 zero[8] = {0};
    if (s->bmRequestType == 0x81 && s->bRequest == USB_REQUEST_GET_STATUS && !s->wValue && s->wLength == 2)
        return reply_control(zero, 2);
    if (s->bmRequestType == 0x81 && s->bRequest == USB_REQUEST_GET_INTERFACE && !s->wValue && s->wLength == 1)
        return reply_control(zero, 1);
    if (s->bmRequestType == 0x01 && s->bRequest == USB_REQUEST_SET_INTERFACE && !s->wValue && !s->wLength)
        return queue_control(true, 0, CTRL_IN_STATUS);
    if (s->bmRequestType == 0x81 && s->bRequest == USB_REQUEST_GET_DESCRIPTOR && !(s->wValue & 255)) {
        const bool pad = control.target == &hid[0];
        const size_t length = pad ? sizeof(pad_descriptor) : sizeof(report_descriptor);
        if ((s->wValue >> 8) == USB_DT_REPORT) {
            control.descriptor = s->wLength >= length;
            return reply_control(pad ? pad_descriptor : report_descriptor, length);
        }
        if ((s->wValue >> 8) == USB_DT_HID) {
            const u8 descriptor[] = {9, USB_DT_HID, 0x11, 0x01, 0, 1, USB_DT_REPORT, length & 255, length >> 8};
            return reply_control(descriptor, sizeof(descriptor));
        }
    }
    if (s->bmRequestType == 0xa1 && !(s->wValue & 255)) {
        if (s->bRequest == 1 && s->wValue == 0x0100) return reply_control(control.target->last_report, 8);
        if (s->bRequest == 1 && s->wValue == 0x0200)
            return control.target == &hid[0] ? reply_control(zero, 8) : reply_control(&control.target->leds, 1);
        if (s->bRequest == 2 && !s->wValue) return reply_control(&control.target->idle_rate, 1);
        if (s->bRequest == 3 && !s->wValue) return reply_control(&control.target->protocol, 1);
    }
    if (s->bmRequestType == 0x21) {
        if (s->bRequest == 9 && s->wValue == 0x0200 && s->wLength && s->wLength <= 64 &&
                (control.target == &hid[0] || s->wLength == 1)) {
            memset(ctrl_out_buffer, 0, sizeof(ctrl_out_buffer));
            control.update_leds = control.target == &hid[1];
            return queue_control(false, s->wLength, CTRL_OUT_DATA);
        }
        if (s->bRequest == 10 && !(s->wValue & 255) && !s->wLength) {
            control.target->idle_rate = s->wValue >> 8;
            return queue_control(true, 0, CTRL_IN_STATUS);
        }
        if (s->bRequest == 11 && s->wValue <= 1 && !s->wLength) {
            control.target->protocol = (u8)s->wValue;
            return queue_control(true, 0, CTRL_IN_STATUS);
        }
    }
    trace_control("unsupported control request", 0);
    return usbDsInterface_StallCtrl(control.wire->interface);
}

static Result poll_control(bool *progress) {
    *progress = false;
    if (!control.pending) return 0;
    const bool in = control.phase == CTRL_IN_DATA || control.phase == CTRL_IN_STATUS;
    Event *event = in ? &control.wire->interface->CtrlInCompletionEvent
                      : &control.wire->interface->CtrlOutCompletionEvent;
    trace_control(in ? "control IN completion" : "control OUT completion", control.expected);
    Result rc = eventWait(event, 0);
    if (rc == KERNELRESULT(TimedOut)) {
        if (milliseconds() - control.started >= 1500) return rc;
        return 0;
    }
    if (R_FAILED(rc)) return rc;
    rc = clear_event(event);
    if (R_FAILED(rc)) return rc;
    UsbDsReportData reports;
    trace_control(in ? "control IN result" : "control OUT result", control.expected);
    rc = in ? usbDsInterface_GetCtrlInReportData(control.wire->interface, &reports)
            : usbDsInterface_GetCtrlOutReportData(control.wire->interface, &reports);
    if (R_FAILED(rc)) return rc;
    u32 transferred = 0;
    trace_control(in ? "control IN parse" : "control OUT parse", control.expected);
    rc = usbDsParseReportData(&reports, control.id, NULL, &transferred);
    if (rc == MAKERESULT(Module_Libnx, LibnxError_NotFound)) return 0;
    // Commit successful descriptor delivery before looking at a following SETUP.
    // The host can start its LED request before we process the completion event.
    // Interrupt-IN delivery remains a separate requirement for overall readiness.
    if (!control.aborted && R_SUCCEEDED(rc) && transferred == control.expected && control.descriptor &&
            (control.phase == CTRL_IN_DATA || control.phase == CTRL_OUT_STATUS))
        control.target->descriptor_ready = true;
    // A matching completion retires DMA ownership even if a new SETUP cancelled it.
    control.pending = false;
    *progress = true;
    if (next_setup.valid || control.aborted) {
        control.phase = CTRL_IDLE;
        control.aborted = false;
        return 0;
    }
    if (R_FAILED(rc)) return rc;
    if (transferred != control.expected) return io_error();
    if (!in && transferred) armDCacheFlush(ctrl_out_buffer, transferred);
    if (control.phase == CTRL_IN_DATA) return queue_control(false, 0, CTRL_OUT_STATUS);
    if (control.phase == CTRL_OUT_DATA) {
        if (control.update_leds) control.target->leds = ctrl_out_buffer[0] & 0x1f;
        else if (control.target == &hid[0] && transferred == 8) {
            memcpy(control.target->echo_report, ctrl_out_buffer, 8);
            control.target->echo_pending = true;
        }
        return queue_control(true, 0, CTRL_IN_STATUS);
    }
    if (control.phase == CTRL_OUT_STATUS && control.descriptor) control.target->descriptor_ready = true;
    control.phase = CTRL_IDLE;
    return 0;
}

static Result service_setup(void) {
    HidInterface *saved = current;
    Result rc = 0;
    for (unsigned step = 0; step < 12; step++) {
        rc = capture_setup();
        if (R_FAILED(rc)) break;
        if (control.pending) {
            bool progress;
            rc = poll_control(&progress);
            if (R_FAILED(rc) || !progress) break;
        }
        if (!control.pending && next_setup.valid) {
            rc = dispatch_setup();
            if (R_FAILED(rc)) break;
        } else if (!control.pending) break;
    }
    current = saved;
    return rc;
}

// Drain both OUT pipes. Keyboard LED reports can arrive on EP3 or EP0.
// PicoSwitch also echoes gamepad output reports on its gamepad IN pipe.
static Result poll_output(void) {
    if (!current->out_endpoint) return 0;
    const bool keyboard = current == &hid[1];
    const size_t capacity = keyboard ? 8 : 64;
    if (current->out_pending) {
        trace_stage(keyboard ? "OUT ep03 completion event" : "OUT ep02 completion event", capacity);
        Result rc = eventWait(&current->out_endpoint->CompletionEvent, 0);
        if (rc == KERNELRESULT(TimedOut)) return 0;
        if (R_FAILED(rc)) return rc;
        rc = clear_event(&current->out_endpoint->CompletionEvent);
        if (R_FAILED(rc)) return rc;
        UsbDsReportData reports;
        trace_stage(keyboard ? "OUT ep03 result" : "OUT ep02 result", capacity);
        rc = usbDsEndpoint_GetReportData(current->out_endpoint, &reports);
        if (R_FAILED(rc)) return rc;
        u32 transferred;
        trace_stage(keyboard ? "OUT ep03 parse" : "OUT ep02 parse", capacity);
        rc = usbDsParseReportData(&reports, current->out_id, NULL, &transferred);
        if (rc == MAKERESULT(Module_Libnx, LibnxError_NotFound)) return 0;
        if (R_FAILED(rc) || transferred > capacity) return R_FAILED(rc) ? rc : io_error();
        current->out_pending = false;
        if (transferred) {
            armDCacheFlush(current->output_buffer, transferred);
            if (keyboard) current->leds = current->output_buffer[0] & 0x1f;
            else if (transferred == 8) {
                memcpy(current->echo_report, current->output_buffer, 8);
                current->echo_pending = true;
            }
        }
    }
    Result rc = clear_event(&current->out_endpoint->CompletionEvent);
    if (R_FAILED(rc)) return rc;
    trace_stage(keyboard ? "OUT ep03 queue" : "OUT ep02 queue", capacity);
    rc = usbDsEndpoint_PostBufferAsync(current->out_endpoint, current->output_buffer, capacity, &current->out_id);
    if (R_SUCCEEDED(rc)) current->out_pending = true;
    return rc;
}

static const char *state_name(UsbState state) {
    switch (state) {
    case UsbState_Detached: return "Detached";
    case UsbState_Attached: return "Attached";
    case UsbState_Powered: return "Powered";
    case UsbState_Default: return "Default";
    case UsbState_Address: return "Address";
    case UsbState_Configured: return "Configured";
    case UsbState_Suspended: return "Suspended";
    default: return "Unknown";
    }
}

static Result cancel_data_endpoint(UsbDsEndpoint *endpoint, const char *label) {
    trace_stage(label, 0);
    Result rc = usbDsEndpoint_Cancel(endpoint);
    if (R_FAILED(rc)) return rc;
    // Cancel returns only after the kernel no longer owns this DMA buffer.
    // Drain completion metadata before the endpoint is armed again.
    UsbDsReportData reports;
    rc = usbDsEndpoint_GetReportData(endpoint, &reports);
    if (R_FAILED(rc)) return rc;
    return clear_event(&endpoint->CompletionEvent);
}

static Result reset_bus_transfers(void) {
    HidInterface *saved = current;
    next_setup.valid = false;
    if (control.pending) control.aborted = true; // Retire EP0 ownership through its completion.
    else control.phase = CTRL_IDLE;
    Result rc = 0;
    for (unsigned i = 0; i < 2; i++) {
        current = &hid[i];
        if (current->input_pending) {
            rc = cancel_data_endpoint(current->endpoint, i ? "cancel IN ep83 after bus reset" : "cancel IN ep81 after bus reset");
            if (R_FAILED(rc)) break;
            current->input_pending = false;
        }
        if (current->out_pending) {
            rc = cancel_data_endpoint(current->out_endpoint, i ? "cancel OUT ep03 after bus reset" : "cancel OUT ep02 after bus reset");
            if (R_FAILED(rc)) break;
            current->out_pending = false;
        }
        current->echo_pending = false;
        current->was_ready = false;
        current->release_pending = true;
        // Report bytes did not change. Keep an already acknowledged descriptor
        // across a host's unconfigure/reconfigure cycle on this same connection.
        current->leds = current->idle_rate = 0;
        current->protocol = 1;
        memcpy(current->last_report, neutral(), 8);
    }
    current = saved;
    return rc;
}

static Result read_state(UsbState *state) {
    trace_stage("read USB state", 0);
    Result rc = usbDsGetState(state);
    if (R_FAILED(rc)) return rc;
    if (!bus_known || *state != bus_state) {
        const bool had_state = bus_known;
        const UsbState previous = bus_state;
        bus_known = true;
        bus_state = *state;
        const bool reset = had_state && (previous == UsbState_Configured || previous == UsbState_Suspended) &&
            *state != UsbState_Configured && *state != UsbState_Suspended;
        if (reset) {
            bus_restarts++;
            rc = reset_bus_transfers();
            if (R_FAILED(rc)) return rc;
        }
        snprintf(bus_status, sizeof(bus_status), "%s -> %s; restarts=%u",
                 had_state ? state_name(previous) : "initial", state_name(*state), bus_restarts);
        if (*state == UsbState_Detached || *state == UsbState_Attached || *state == UsbState_Powered) {
            for (unsigned i = 0; i < 2; i++) hid[i].descriptor_ready = false;
        }
        if (*state == UsbState_Suspended) {
            for (unsigned i = 0; i < 2; i++) {
                memcpy(hid[i].last_report, i ? key_neutral : pad_neutral, 8);
                hid[i].release_pending = true;
            }
        }
        if (*state == UsbState_Configured) {
            for (unsigned i = 0; i < 2; i++) hid[i].was_ready = true;
        }
    }
    return 0;
}

static Result start_input(const u8 report[8], bool release) {
    // No writes to this DMA buffer until its matching completion has been consumed.
    if (current->input_pending) return io_error();
    Result rc = clear_event(&current->endpoint->CompletionEvent);
    if (R_FAILED(rc)) return rc;
    memcpy(current->input_buffer, report, 8);
    trace_stage(current == &hid[0] ? "IN ep81 queue" : "IN ep83 queue", 8);
    rc = usbDsEndpoint_PostBufferAsync(current->endpoint, current->input_buffer, 8, &current->input_id);
    if (R_FAILED(rc)) return rc;
    current->input_pending = true;
    current->input_is_release = release;
    return 0;
}

static Result poll_input(u64 timeout) {
    if (!current->input_pending) return 0;
    trace_stage(current == &hid[0] ? "IN ep81 completion event" : "IN ep83 completion event", 8);
    Result rc = eventWait(&current->endpoint->CompletionEvent, timeout);
    if (rc == KERNELRESULT(TimedOut)) return 0;
    if (R_FAILED(rc)) return rc;
    rc = clear_event(&current->endpoint->CompletionEvent);
    if (R_FAILED(rc)) return rc;
    UsbDsReportData reports;
    trace_stage(current == &hid[0] ? "IN ep81 completion result" : "IN ep83 completion result", 8);
    rc = usbDsEndpoint_GetReportData(current->endpoint, &reports);
    if (R_FAILED(rc)) return rc;
    u32 transferred;
    trace_stage(current == &hid[0] ? "IN ep81 parse" : "IN ep83 parse", 8);
    rc = usbDsParseReportData(&reports, current->input_id, NULL, &transferred);
    if (rc == MAKERESULT(Module_Libnx, LibnxError_NotFound)) return 0;
    if (R_FAILED(rc)) return rc;
    if (transferred != 8) return io_error();
    current->input_pending = false;
    if (current->input_is_release) current->release_pending = false;
    current->last_sent = milliseconds();
    return 0;
}

static Result wait_input(void) {
    u64 deadline = milliseconds() + REPORT_TIMEOUT_MS;
    while (current->input_pending) {
        UsbState state;
        Result rc = read_state(&state);
        if (R_FAILED(rc)) return rc;
        if (state != UsbState_Configured) return KERNELRESULT(InvalidState);
        rc = poll_input(EVENT_POLL_NS);
        if (R_FAILED(rc)) {
            char failed_stage[sizeof(trace_context)];
            snprintf(failed_stage, sizeof(failed_stage), "%s", trace_context);
            Result state_rc = read_state(&state);
            if (R_SUCCEEDED(state_rc) && state != UsbState_Configured) return KERNELRESULT(InvalidState);
            snprintf(trace_context, sizeof(trace_context), "%s", failed_stage);
            return rc;
        }
        if (!current->input_pending) return 0;
        if (milliseconds() >= deadline) return KERNELRESULT(TimedOut);
        rc = service_setup();
        if (R_FAILED(rc)) return rc;
    }
    return 0;
}

static Result write_report(const uint8_t report[8]) {
    UsbState state;
    Result rc = read_state(&state);
    if (R_FAILED(rc)) return rc;
    bool release = !memcmp(report, neutral(), 8);
    // A neutral report is deferred across suspend/re-enumeration. A real key
    // cannot be acknowledged as delivered until the bus is configured again.
    if (state != UsbState_Configured) return release ? 0 : KERNELRESULT(InvalidState);
    rc = wait_input();
    if (R_FAILED(rc)) return rc;
    if (current->release_pending && !release) {
        rc = start_input(neutral(), true);
        if (R_FAILED(rc)) return rc;
        rc = wait_input();
        if (R_FAILED(rc)) return rc;
    }
    rc = start_input(report, release);
    if (R_FAILED(rc)) return rc;
    rc = wait_input();
    if (R_FAILED(rc)) return rc;
    memmove(current->last_report, report, 8);
    return 0;
}

Result usb_gamepad_write(const uint8_t report[8]) {
    current = &hid[0];
    if (!initialized) return MAKERESULT(Module_Libnx, LibnxError_NotInitialized);
    if (R_FAILED(fault)) return fault;
    Result rc = write_report(report);
    if (rc == KERNELRESULT(InvalidState) && bus_known && bus_state != UsbState_Configured) return rc;
    return remember_error(rc);
}

Result usb_keyboard_write(const uint8_t report[8]) {
    current = &hid[1];
    if (!initialized) return MAKERESULT(Module_Libnx, LibnxError_NotInitialized);
    if (R_FAILED(fault)) return fault;
    Result rc = write_report(report);
    if (rc == KERNELRESULT(InvalidState) && bus_known && bus_state != UsbState_Configured) return rc;
    return remember_error(rc);
}

static Result tick(void) {
    UsbState state;
    Result rc = read_state(&state);
    if (R_FAILED(rc) || state == UsbState_Suspended) return rc;
    rc = service_setup();
    if (R_FAILED(rc)) return rc;
    rc = read_state(&state);
    if (R_FAILED(rc) || state != UsbState_Configured) return rc;
    rc = poll_output();
    if (R_FAILED(rc)) return rc;
    rc = poll_input(0);
    if (R_FAILED(rc) || current->input_pending) return rc;
    if (current->release_pending) return start_input(neutral(), true);
    if (current->echo_pending) {
        rc = start_input(current->echo_report, false);
        if (R_SUCCEEDED(rc)) current->echo_pending = false;
        return rc;
    }
    // A configured host may stop polling while loading its HID driver or idling.
    // Keep one transfer pending without blocking control requests or resetting USB.
    if ((current == &hid[0] || current->idle_rate) && milliseconds() - current->last_sent >= (current == &hid[0] ? 10 : (u64)current->idle_rate * 4))
        return start_input(current->last_report, false);
    return 0;
}

Result usb_keyboard_tick(void) {
    if (!initialized) return MAKERESULT(Module_Libnx, LibnxError_NotInitialized);
    if (R_FAILED(fault)) return fault;
    for (unsigned i = 0; i < 2; i++) {
        current = &hid[i];
        Result rc = tick();
        if (R_FAILED(rc)) {
            // A host reset can race an interrupt completion. Treat cancelled
            // data I/O as loss of readiness when the bus confirms that reset.
            const bool cancelled = rc == 0x828c || rc == 0x748c || rc == io_error() || rc == KERNELRESULT(InvalidState);
            if (cancelled) {
                char failed_stage[sizeof(trace_context)];
                snprintf(failed_stage, sizeof(failed_stage), "%s", trace_context);
                UsbState state;
                Result state_rc = read_state(&state);
                if (R_SUCCEEDED(state_rc) && state != UsbState_Configured) return 0;
                snprintf(trace_context, sizeof(trace_context), "%s", failed_stage);
            }
            return remember_error(rc);
        }
    }
    return 0;
}


#endif
