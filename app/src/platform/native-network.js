/* CivSwitch native transport. Evaluated inside the loader's lexical scope. */
(function () {
    "use strict";
    window.MoonlightNative = { available: typeof sdk_base !== "undefined" && typeof call_rop === "function", create: create };
    function create() {
        if (!window.MoonlightNative.available) throw new Error("Native networking requires the CivSwitch loader.");
        var cache = window.__moonlightSdkExports || {};
        var mod = sdk_base + read32(sdk_base + 4n);
        if (read32(mod) !== 0x30444f4dn) throw new Error("Unrecognized SDK module.");
        var dynamic = mod + BigInt.asIntN(32, read32(mod + 4n)), tags = {};
        for (var i = 0; i < 128; i++) {
            var tag = Number(read64(dynamic + BigInt(i * 16)));
            if (!tag) break;
            var value = read64(dynamic + BigInt(i * 16 + 8));
            tags[tag] = value < sdk_base ? sdk_base + value : value;
        }
        var table = tags[4], strings = tags[5], symbols = tags[6];
        if (!table || !strings || !symbols) throw new Error("SDK export table unavailable.");
        var buckets = Number(read32(table)), count = Number(read32(table + 4n));
        function resolve(name) {
            if (cache[name]) return cache[name];
            var hash = 0;
            for (var j = 0; j < name.length; j++) {
                hash = ((hash << 4) + name.charCodeAt(j)) >>> 0;
                var high = hash & 0xf0000000;
                if (high) hash ^= high >>> 24;
                hash = (hash & ~high) >>> 0;
            }
            var index = Number(read32(table + 8n + BigInt((hash % buckets) * 4)));
            for (var k = 0; index && k < count; k++) {
                var symbol = symbols + BigInt(index * 24);
                if (read_null_terminated_string(strings + read32(symbol)) === name) {
                    var offset = read64(symbol + 8n);
                    if (!offset) break;
                    return (cache[name] = sdk_base + offset);
                }
                index = Number(read32(table + 8n + BigInt((buckets + index) * 4)));
            }
            throw new Error("Missing SDK export: " + name);
        }
        function call(name) {
            var args = Array.prototype.slice.call(arguments, 1).map(BigInt);
            return call_rop.apply(null, [resolve(name)].concat(args));
        }
        function code(value) { return Number(value & 0x3fffffn); }
        function checked(name) {
            var result = call.apply(null, arguments);
            if (code(result)) throw new Error(name + " failed: 0x" + code(result).toString(16));
            return result;
        }
        function signed(value) { return Number(BigInt.asIntN(32, value)); }
        function err() { return Number(call("_ZN2nn6socket12GetLastErrnoEv")); }
        function pause() { return new Promise(function (done) { setTimeout(done, 20); }); }
        function active(options, deadline) {
            if (options.signal && options.signal.aborted) throw new Error("Connection canceled.");
            if (Date.now() >= deadline) throw new Error("Sunshine request timed out.");
        }
        function ascii(bytes) {
            var result = "";
            for (var n = 0; n < bytes.length; n++) result += String.fromCharCode(bytes[n]);
            return result;
        }
        function binaryBytes(value) {
            if (typeof value !== "string") return new Uint8Array(value);
            var data = new Uint8Array(value.length);
            for (var n = 0; n < value.length; n++) data[n] = value.charCodeAt(n);
            return data;
        }
        var S = "_ZN2nn3ssl";
        async function request(options, secure) {
            var octets = options.host.split(".").map(Number);
            if (octets.length !== 4 || !/^\d+\.\d+\.\d+\.\d+$/.test(options.host) || octets.some(function (v) { return v < 0 || v > 255; }))
                throw new Error("For now, enter an IPv4 address, optionally followed by :port.");
            if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error("Invalid host port.");
            if (!/^\/[\x21-\x7e]*$/.test(options.path)) throw new Error("Invalid request path.");
            var allocated = [], fd = -1n, context, connection, hasContext = false, hasConnection = false;
            var deadline = Date.now() + (options.timeoutMs || 10000);
            active(options, deadline);
            function alloc(size) { var p = malloc(size); if (!p) throw new Error("Native allocation failed."); allocated.push(p); return p; }
            function data(value, nul) { var bytes = binaryBytes(value), p = alloc(bytes.length + (nul ? 1 : 0)); write_buffer(p, bytes); return p; }
            try {
                var address = alloc(16), buffer = alloc(8192), outputCount = alloc(8);
                write_buffer(address, new Uint8Array([16, 2, options.port >> 8, options.port & 255].concat(octets, [0,0,0,0,0,0,0,0])));
                fd = BigInt(signed(call("_ZN2nn6socket6SocketEiii", 2, 1, 0)));
                if (fd < 0n) throw new Error("Cannot create socket.");
                var flags = signed(call("_ZN2nn6socket5FcntlEiiz", fd, 3, 0));
                if (flags < 0 || signed(call("_ZN2nn6socket5FcntlEiiz", fd, 4, flags | 0x800)) < 0) throw new Error("Cannot set nonblocking socket.");
                var connected = signed(call("_ZN2nn6socket7ConnectEiPK8sockaddrj", fd, address, 16));
                // Observed SDK errno uses Linux values (115/114/106); accept BSD equivalents too.
                while (connected < 0) {
                    var error = err();
                    if (error === 56 || error === 106) break;
                    if (error !== 115 && error !== 114 && error !== 36 && error !== 37 && error !== 11 && error !== 35) throw new Error("TCP connect failed (errno " + error + ").");
                    active(options, deadline); await pause();
                    connected = signed(call("_ZN2nn6socket7ConnectEiPK8sockaddrj", fd, address, 16));
                }
                var pinnedDer;
                if (secure) {
                    if (!options.identity || !options.pinnedCertificatePem) throw new Error("TLS requires a paired client identity and host certificate.");
                    if (!call(S + "6detail14ServiceSession13IsInitializedEv")) checked(S + "10InitializeEv");
                    context = alloc(64); call(S + "7ContextC1Ev", context);
                    checked(S + "7Context6CreateENS1_10SslVersionE", context, 32); hasContext = true;
                    var cert = window.forge.pki.certificateFromPem(options.pinnedCertificatePem);
                    pinnedDer = window.forge.asn1.toDer(window.forge.pki.certificateToAsn1(cert)).getBytes();
                    var pki = data(options.pinnedCertificatePem, true), pkiId = alloc(8);
                    checked(S + "7Context15ImportServerPkiEPmPKcjNS0_17CertificateFormatE", context, pkiId, pki, options.pinnedCertificatePem.length + 1, 1);
                    var p12 = binaryBytes(options.identity.p12Bytes), p12Buffer = data(p12);
                    var password = options.identity.p12Password || "", passwordBuffer = password ? data(password, true) : 0n;
                    checked(S + "7Context15ImportClientPkiEPmPKcS4_jj", context, pkiId, p12Buffer, passwordBuffer, p12.length, password.length);
                    connection = alloc(64); call(S + "10ConnectionC1Ev", connection);
                    checked(S + "10Connection6CreateEPNS0_7ContextE", connection, context); hasConnection = true;
                    // Keep descriptor ownership here, including failed handshake paths.
                    checked(S + "10Connection9SetOptionENS1_10OptionTypeEb", connection, 0, 1);
                    checked(S + "10Connection19SetSocketDescriptorEi", connection, fd);
                    var commonName = cert.subject.getField("CN");
                    if (!commonName || !commonName.value) throw new Error("Pinned certificate has no common name.");
                    var tlsHost = commonName.value, tlsHostBytes = text_encode(tlsHost), tlsHostBuffer = data(tlsHostBytes, true);
                    checked(S + "10Connection11SetHostNameEPKcj", connection, tlsHostBuffer, tlsHostBytes.length + 1);
                    checked(S + "10Connection9SetIoModeENS1_6IoModeE", connection, 2);
                    var serverCert = alloc(16384);
                    checked(S + "10Connection19SetServerCertBufferEPcj", connection, serverCert, 16384);
                    while (true) {
                        active(options, deadline);
                        var handshake = code(call(S + "10Connection11DoHandshakeEv", connection));
                        if (!handshake) break;
                        if (handshake !== 0x1987b) {
                            var verifyError = alloc(8);
                            var verifyQuery = code(call(S + "10Connection18GetVerifyCertErrorEPNS_6ResultE", connection, verifyError));
                            throw new Error("TLS handshake failed: 0x" + handshake.toString(16) +
                                (verifyQuery ? " (verify query 0x" + verifyQuery.toString(16) + ")" :
                                    " (certificate 0x" + Number(read32(verifyError)).toString(16) + ")"));
                        }
                        await pause();
                    }
                    // With GetServerCertChain unset, the buffer contains the leaf certificate in DER format.
                    var certSize = alloc(8);
                    checked("_ZNK2nn3ssl10Connection17GetServerCertSizeEPj", connection, certSize);
                    var leafSize = Number(read32(certSize));
                    if (leafSize !== pinnedDer.length || ascii(read_buffer(serverCert, leafSize)) !== pinnedDer) throw new Error("Sunshine TLS certificate changed.");
                }
                var wire = text_encode("GET " + options.path + " HTTP/1.1\r\nHost: " + options.host + ":" + options.port + "\r\nConnection: close\r\nAccept: application/xml\r\n\r\n");
                var requestBuffer = data(wire), offset = 0;
                while (offset < wire.length) {
                    active(options, deadline);
                    var written;
                    if (secure) {
                        var wr = code(call(S + "10Connection5WriteEPKcPij", connection, requestBuffer + BigInt(offset), outputCount, wire.length - offset));
                        if (wr && wr !== 0x1987b) throw new Error("TLS write failed: 0x" + wr.toString(16));
                        written = wr ? -1 : Number(read32(outputCount));
                    } else {
                        written = signed(call("_ZN2nn6socket4SendEiPKvmi", fd, requestBuffer + BigInt(offset), wire.length - offset, 0x80));
                        if (written < 0 && err() !== 11 && err() !== 35) throw new Error("Socket write failed.");
                    }
                    if (written > 0) offset += written; else await pause();
                }
                var response = "", headerEnd = -1, bodyLength = null;
                while (true) {
                    active(options, deadline);
                    var received;
                    if (secure) {
                        var rd = code(call(S + "10Connection4ReadEPcPij", connection, buffer, outputCount, 8192));
                        if (rd && rd !== 0x1987b) throw new Error("TLS read failed: 0x" + rd.toString(16));
                        received = rd ? -1 : Number(read32(outputCount));
                    } else {
                        received = signed(call("_ZN2nn6socket4RecvEiPvmi", fd, buffer, 8192, 0x80));
                        if (received < 0 && err() !== 11 && err() !== 35) throw new Error("Socket read failed.");
                    }
                    if (received === 0) break;
                    if (received > 0) {
                        response += ascii(read_buffer(buffer, received));
                        if (response.length > 131072) throw new Error("Sunshine response exceeds 128 KiB.");
                        if (headerEnd < 0 && (headerEnd = response.indexOf("\r\n\r\n")) >= 0) {
                            var headers = response.slice(0, headerEnd), match = /^HTTP\/1\.[01] (\d{3})\b/.exec(headers);
                            if (!match || match[1] !== "200") throw new Error("Sunshine HTTP status " + (match ? match[1] : "invalid") + ".");
                            if (/transfer-encoding:/i.test(headers)) throw new Error("Chunked responses are not supported yet.");
                            var lengths = headers.split("\r\n").filter(function (line) { return /^content-length:/i.test(line); });
                            if (lengths.length > 1) throw new Error("Duplicate Sunshine content length.");
                            if (lengths.length) {
                                var length = /^content-length:[ \t]*(\d+)[ \t]*$/i.exec(lengths[0]);
                                if (!length || !Number.isSafeInteger(Number(length[1])) || Number(length[1]) > 131072)
                                    throw new Error("Invalid Sunshine content length.");
                                bodyLength = Number(length[1]);
                            }
                        }
                        if (headerEnd >= 0 && bodyLength !== null && response.length >= headerEnd + 4 + bodyLength) break;
                    } else await pause();
                }
                if (headerEnd < 0 || (bodyLength !== null && response.length < headerEnd + 4 + bodyLength)) throw new Error("Incomplete Sunshine response.");
                return decodeURIComponent(escape(response.slice(headerEnd + 4, bodyLength === null ? undefined : headerEnd + 4 + bodyLength)));
            } finally {
                try { if (hasConnection) call(S + "10Connection7DestroyEv", connection); }
                finally {
                    try { if (fd >= 0n) call("_ZN2nn6socket5CloseEi", fd); }
                    finally {
                        try { if (hasContext) call(S + "7Context7DestroyEv", context); }
                        finally { allocated.reverse().forEach(free); }
                    }
                }
            }
        }
        function randomBytes(length) {
            if (!Number.isInteger(length) || length < 0 || length > 65536) throw new Error("Invalid random byte count.");
            if (!length) return new Uint8Array(0);
            var p = malloc(length);
            try { call("_ZN2nn6crypto36GenerateCryptographicallyRandomBytesEPvm", p, length); return read_buffer(p, length); }
            finally { free(p); }
        }
        if (!window.MoonlightStore) throw new Error("Pairing store module is missing.");
        ["_ZN2nn2fs15CreateDirectoryEPKc",
            "_ZN2nn2fs26DeleteDirectoryRecursivelyEPKc"].forEach(resolve);
        function requireExperimentPath(path, allowRoot) {
            var root = window.MoonlightStore.root;
            if (allowRoot && path === root) return;
            if (typeof path !== "string" || path.indexOf(root + "/") !== 0)
                throw new Error("Refusing a file operation outside the experiment directory.");
            var parts = path.slice(root.length + 1).split("/");
            if (parts.some(function (part) { return !part || part === "." || part === ".." || /[\\:\x00]/.test(part); }))
                throw new Error("Refusing a noncanonical experiment path.");
        }
        function readStateFile(path) {
            requireExperimentPath(path, false);
            var p = alloc_string(path), handle = malloc(8), size = malloc(8), buffer, opened = false;
            try {
                var result = code(call("_ZN2nn2fs8OpenFileEPNS0_10FileHandleEPKci", handle, p, 1));
                if (result === 0x202) return null;
                if (result) throw new Error("Pairing store open failed: 0x" + result.toString(16));
                opened = true;
                checked("_ZN2nn2fs11GetFileSizeEPlNS0_10FileHandleE", size, read64(handle));
                var length = Number(read64(size));
                if (length < 0 || length > 65536) throw new Error("Invalid pairing store size; file left intact.");
                if (!length) return "";
                buffer = malloc(length);
                checked("_ZN2nn2fs8ReadFileENS0_10FileHandleElPvm", read64(handle), 0, buffer, length);
                return bytes_to_string(read_buffer(buffer, length));
            } finally { if (opened) call("_ZN2nn2fs9CloseFileENS0_10FileHandleE", read64(handle)); if (buffer) free(buffer); free(size); free(handle); free(p); }
        }
        function writeStateFile(path, text) {
            requireExperimentPath(path, false);
            var bytes = text_encode(text);
            if (bytes.length > 65536) throw new Error("Pairing store is full.");
            var p = alloc_string(path), handle = malloc(8), option = malloc(8), buffer = malloc(bytes.length), opened = false;
            try {
                var createResult = code(call("_ZN2nn2fs10CreateFileEPKcl", p, bytes.length));
                if (createResult && createResult !== 0x402) throw new Error("Pairing store create failed: 0x" + createResult.toString(16));
                checked("_ZN2nn2fs8OpenFileEPNS0_10FileHandleEPKci", handle, p, 6); opened = true;
                checked("_ZN2nn2fs11SetFileSizeENS0_10FileHandleEl", read64(handle), bytes.length);
                write32(option, 1n); write_buffer(buffer, bytes);
                checked("_ZN2nn2fs9WriteFileENS0_10FileHandleElPKvmRKNS0_11WriteOptionE", read64(handle), 0, buffer, bytes.length, option);
            } finally { if (opened) call("_ZN2nn2fs9CloseFileENS0_10FileHandleE", read64(handle)); [p,handle,option,buffer].forEach(free); }
        }
        function pathOperation(name, path, allowedCode) {
            var p = alloc_string(path);
            try {
                var result = code(call(name, p));
                if (result && result !== allowedCode) throw new Error(name + " failed: 0x" + result.toString(16));
            } finally { free(p); }
        }
        var store = window.MoonlightStore.create({
            read: readStateFile, write: writeStateFile,
            ensureDirectory: function (path) { requireExperimentPath(path, true);pathOperation("_ZN2nn2fs15CreateDirectoryEPKc", path, 0x402); },
            removeDirectory: function (path) {
                if (path !== window.MoonlightStore.root) throw new Error("Refusing to remove a directory outside the experiment root.");
                pathOperation("_ZN2nn2fs26DeleteDirectoryRecursivelyEPKc", path, 0x202);
            },
            commit: function () { pathOperation("_ZN2nn2fs6CommitEPKc", "save", 0); }
        });
        return {
            requestHttp: function (options) { return request(options, false); },
            requestHttps: async function (options) {
                // Sunshine can briefly reject the first handshake while its client trust
                // store is refreshed after clientpairingsecret. Every attempt retains
                // certificate verification and exact pinning; other errors fail immediately.
                for (var attempt = 0; ; attempt++) {
                    try { return await request(options, true); }
                    catch (error) {
                        if (attempt >= 2 || !/^TLS handshake failed: 0x19e7b\b/.test(error.message) ||
                            (options.signal && options.signal.aborted)) throw error;
                        for (var tick = 0; tick < 50; tick++) {
                            if (options.signal && options.signal.aborted) throw new Error("Connection canceled.");
                            await pause();
                        }
                    }
                }
            }, randomBytes: randomBytes,
            loadIdentity: store.loadIdentity,
            saveIdentity: store.saveIdentity,
            loadHost: store.loadHost,
            saveHost: store.saveHost,
            clearExperimentData: store.clear,
            storageRoot: store.root
        };
    }
})();
