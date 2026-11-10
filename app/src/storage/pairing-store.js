/* All persistent experiment files belong under this one Switch directory. */
(function (global) {
    "use strict";
    var root = "save:/moonlight-experiment";
    var paths = [root + "/pairing-0.json", root + "/pairing-1.json"];
    function create(fs) {
        var cached = null;
        function decode(text) {
            if (text === null) return null;
            var value;
            try { value = JSON.parse(text); } catch (_) { return null; }
            if (!value || value.version !== 1 || !Number.isSafeInteger(value.generation) || value.generation < 0 ||
                !value.hosts || typeof value.hosts !== "object" || Array.isArray(value.hosts)) return null;
            return value;
        }
        function snapshot(files) {
            return files.map(function (path) { var text = fs.read(path); return {path:path,text:text,value:decode(text)}; });
        }
        function newest(entries) {
            return entries.filter(function (entry) { return entry.value; }).sort(function (a, b) {
                return b.value.generation - a.value.generation;
            })[0];
        }
        function write(next) {
            if (!Number.isSafeInteger(next.generation + 1)) throw new Error("Pairing generation limit reached.");
            var value = {version:1,generation:next.generation+1,identity:next.identity,hosts:next.hosts};
            var text = JSON.stringify(value), path = paths[value.generation % 2];
            fs.ensureDirectory(root);
            fs.write(path, text);
            fs.commit();
            if (fs.read(path) !== text) throw new Error("Pairing store verification failed; original data retained.");
            return value;
        }
        function load() {
            if (cached) return cached;
            var current = snapshot(paths);
            var best = newest(current);
            var anyFiles = current.some(function (entry) { return entry.text !== null; });
            if (!best && anyFiles) throw new Error("Existing pairing data is unreadable; files were left intact.");
            var value = best ? best.value : {version:1,generation:0,identity:null,hosts:{}};
            cached = value;
            return value;
        }
        return {
            root: root,
            loadIdentity: function () { return load().identity; },
            saveIdentity: function (identity) { var old=load();cached=write({generation:old.generation,identity:identity,hosts:old.hosts}); },
            loadHost: function (host) { return load().hosts[host] || null; },
            listHosts: function () {
                var value = load();
                return Object.keys(value.hosts).filter(function (address) {
                    var host = value.hosts[address];
                    return host && host.certificatePem && value.identity && host.uniqueId === value.identity.uniqueId;
                }).map(function (address) {
                    var host = value.hosts[address];
                    return {address:address,hostname:host.hostname || address,httpsPort:host.httpsPort};
                });
            },
            saveHost: function (host, value) {
                var old=load(), hosts=Object.assign({},old.hosts);hosts[host]=value;
                cached=write({generation:old.generation,identity:old.identity,hosts:hosts});
            },
            removeHost: function (host) {
                var old=load(), hosts=Object.assign({},old.hosts);
                delete hosts[host];
                cached=write({generation:old.generation,identity:old.identity,hosts:hosts});
            },
            clear: function () {
                // Check removal before committing so any failure remains visible and retryable.
                fs.removeDirectory(root);
                fs.commit();
                cached=null;
            }
        };
    }
    global.MoonlightStore = {root:root,create:create};
})(typeof window !== "undefined" ? window : globalThis);
