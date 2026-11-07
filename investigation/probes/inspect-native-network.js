/* Read-only Sunshine request and bounded SDK export inspection. No TLS calls yet. */
(async function () {
    await log("MOONLIGHT_NATIVE_PROBE_BEGIN");
    var fd = -1n;
    var address = malloc(16), buffer = malloc(8192), timeout = malloc(16);
    try {
        write_buffer(address, new Uint8Array([16, 2, 187, 117, 192, 168, 1, 4, 0, 0, 0, 0, 0, 0, 0, 0]));
        write64(timeout, 5n); write64(timeout + 8n, 0n);
        fd = socket(2, 1, 0);
        await log("SOCKET: " + fd);
        if (fd < 0n) throw new Error("socket failed");
        await log("SEND_TIMEOUT: " + setsockopt(fd, 0xffff, 0x1005, timeout, 16));
        await log("CONNECT: " + connect(fd, address, 16));
        var request = text_encode("GET /serverinfo?uniqueid=MOONLIGHTCIVPROBE&uuid=00000000-0000-4000-8000-000000000000 HTTP/1.1\r\nHost: 192.168.1.4:47989\r\nConnection: close\r\n\r\n");
        write_buffer(buffer, request);
        await log("SEND: " + send(fd, buffer, request.length, 0x80));
        var response = "", deadline = Date.now() + 8000;
        while (Date.now() < deadline && response.length < 32768) {
            var count = Number(recv(fd, buffer, 8192, 0x80));
            if (count === 0) break;
            if (count > 0) response += bytes_to_string(read_buffer(buffer, count));
            else await new Promise(function (resolve) { setTimeout(resolve, 30); });
        }
        await log("SUNSHINE_NATIVE_RESPONSE: " + response);
    } catch (error) { await log("NATIVE_HTTP_ERROR: " + error.message); }
    finally { if (fd >= 0n) close(fd); free(address); free(buffer); free(timeout); }

    var base = sdk_base;
    var modOffset = Number(read32(base + 4n));
    await log("SDK_MOD_OFFSET: 0x" + modOffset.toString(16));
    if (modOffset <= 0 || modOffset > 0x1000000) return;
    var mod = base + BigInt(modOffset);
    if (Number(read32(mod)) !== 0x30444f4d) { await log("SDK_MOD_MAGIC_INVALID"); return; }
    var dyn = mod + BigInt.asIntN(32, read32(mod + 4n));
    var tags = {};
    for (var i = 0; i < 128; i++) {
        var tag = Number(read64(dyn + BigInt(i * 16)));
        if (!tag) break;
        tags[tag] = read64(dyn + BigInt(i * 16 + 8));
    }
    await log("SDK_DYNAMIC_TAGS: " + Object.keys(tags).join(","));
    function ptr(value) { return value < base ? base + value : value; }
    if (!tags[4] || !tags[5] || !tags[6]) return;
    var hash = ptr(tags[4]), strings = ptr(tags[5]), symbols = ptr(tags[6]);
    var count = Number(read32(hash + 4n));
    await log("SDK_SYMBOL_COUNT: " + count);
    if (count > 100000) return;
    for (var n = 0; n < count; n++) {
        var entry = symbols + BigInt(n * 24);
        var nameOffset = read32(entry);
        if (tags[10] && nameOffset >= tags[10]) continue;
        var name = read_null_terminated_string(strings + nameOffset);
        if (/ssl|Tls|RandomBytes|GenerateRandom|Aes128|Sha256|Rsa2048|Fcntl|GetLastErrno/i.test(name)) {
            await log("SDK_EXPORT: " + name + " @0x" + read64(entry + 8n).toString(16) + " size=" + read64(entry + 16n));
        }
        if (n % 256 === 0) await new Promise(function (resolve) { setTimeout(resolve, 0); });
    }
    await log("MOONLIGHT_NATIVE_PROBE_END");
})();
