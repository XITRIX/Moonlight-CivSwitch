/* Fixed code reads only. Capture everything before yielding to the logger. */
(async function () {
    var info = malloc(64), page = malloc(8), captures = [];
    try {
        if (read32(sdk_base + 0x168b10n) !== 0xd40000c1n)
            throw Error("Unknown memory query ABI");
        for (var entry of [
            ["texture-map-upload", 0x779c00n, 3072]
        ]) {
            var address = main_base + entry[1], size = entry[2];
            var rc = call_rop(sdk_base + 0x168b0cn, info, page, address);
            if (rc & 0x3fffffn) throw Error("Memory query failed");
            var base = read64(info), end = base + read64(info + 8n);
            var permissions = Number(read32(info + 24n));
            // CivSwitch read32 internally performs an eight-byte read.
            if ((permissions & 5) !== 5 || address < base || address + BigInt(size + 4) > end)
                throw Error("Code range is not readable and executable");
            var hex = "";
            for (var i = 0; i < size; i += 4) {
                var word = Number(read32(address + BigInt(i)));
                for (var b = 0; b < 4; b++)
                    hex += ("0" + ((word >>> (b * 8)) & 255).toString(16)).slice(-2);
            }
            captures.push({name: entry[0], offset: entry[1].toString(16), permissions: permissions, hex: hex});
        }
    } finally {
        free(page); free(info);
    }
    for (var capture of captures) await log("MOONLIGHT_RENDER_SLICE: " + JSON.stringify(capture));
    await log("MOONLIGHT_RENDER_RESOURCE_CODE_END: true");
})();
