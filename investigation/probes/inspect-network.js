/* Read-only capability probe and Sunshine serverinfo request. */
(async function () {
    await log("MOONLIGHT_NETWORK_PROBE_BEGIN");
    for (var name of ["XMLHttpRequest", "fetch", "WebSocket", "crypto", "localStorage"]) {
        var object = window[name];
        await log(name + ": " + typeof object);
        if (name === "crypto" && object) {
            await log("crypto.subtle: " + typeof object.subtle);
            await log("crypto.getRandomValues: " + typeof object.getRandomValues);
        }
    }
    await log("native sockets: " + (typeof socket === "function" && typeof connect === "function"));
    if (window.Network) await log("Network APIs: " + Object.getOwnPropertyNames(window.Network).join(", "));
    await new Promise(function (resolve) {
        var request = new XMLHttpRequest();
        request.open("GET", "http://192.168.1.4:47989/serverinfo?uniqueid=MOONLIGHTCIVPROBE&uuid=00000000-0000-4000-8000-000000000000", true);
        request.timeout = 8000;
        request.onload = async function () {
            await log("SUNSHINE_XHR_STATUS: " + request.status);
            await log(String(request.responseText).slice(0, 16000));
            resolve();
        };
        request.onerror = async function () { await log("SUNSHINE_XHR_ERROR"); resolve(); };
        request.ontimeout = async function () { await log("SUNSHINE_XHR_TIMEOUT"); resolve(); };
        try { request.send(); } catch (error) { log("SUNSHINE_XHR_EXCEPTION: " + error.message); resolve(); }
    });
    await log("MOONLIGHT_NETWORK_PROBE_END");
})();
