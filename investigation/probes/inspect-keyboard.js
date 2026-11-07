/* Read-only runtime inspection. Does not open the keyboard or edit values. */
(async function () {
    var module = await import("/core/ui/components/fxs-textbox.js");
    await log("MOONLIGHT_KEYBOARD_PROBE_BEGIN");
    await log("TEXTBOX_CLASS_BEGIN");
    await log(String(module.default));
    await log("TEXTBOX_CLASS_END");
    var prototype = module.default && module.default.prototype;
    var depth = 0;
    while (prototype && depth++ < 4) {
        var names = Object.getOwnPropertyNames(prototype);
        await log("PROTOTYPE_" + depth + ": " + names.join(", "));
        prototype = Object.getPrototypeOf(prototype);
    }
    ["UI", "Input"].forEach(function (name) {
        var object = window[name];
        if (!object) return;
        var names = [];
        var current = object;
        var depth = 0;
        while (current && depth++ < 3) {
            Object.getOwnPropertyNames(current).forEach(function (key) {
                if (/keyboard|input|focus|applet|suspend|resume/i.test(key) && names.indexOf(key) < 0) names.push(key);
            });
            current = Object.getPrototypeOf(current);
        }
        // Queue diagnostics through the loader logger; no field values read.
        object = null;
        window.__moonlightKeyboardProbeNames = window.__moonlightKeyboardProbeNames || [];
        window.__moonlightKeyboardProbeNames.push(name + ": " + names.join(", "));
    });
    for (var entry of window.__moonlightKeyboardProbeNames || []) await log(entry);
    delete window.__moonlightKeyboardProbeNames;
    await log("MOONLIGHT_KEYBOARD_PROBE_END");
})();
