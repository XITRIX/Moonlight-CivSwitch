/* Sunshine application list and PNG covers, using the on-console pairing. */
(function (global) {
    "use strict";
    function invalid() { throw new Error("Invalid Sunshine application list."); }
    function decode(text) {
        return text.replace(/&([^;\s<&]*);|&/g, function (match, entity) {
            var named = {amp:"&",lt:"<",gt:">",quot:'"',apos:"'"};
            if (Object.prototype.hasOwnProperty.call(named, entity)) return named[entity];
            if (!/^#(?:[0-9]+|x[0-9a-f]+)$/i.test(entity || "")) invalid();
            var hex = entity.charAt(1).toLowerCase() === "x";
            var point = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
            if (!(point === 9 || point === 10 || point === 13 || point >= 32) || point > 0x10ffff ||
                (point >= 0xd800 && point <= 0xdfff) || point === 0xfffe || point === 0xffff) invalid();
            return String.fromCodePoint(point);
        });
    }
    // Gameface has no DOMParser. Parse this small XML response with bounded
    // depth/size and exact tag matching; never interpret titles as markup.
    function parseRoot(xml, allowError) {
        if (typeof xml !== "string" || xml.length > 131072) invalid();
        xml = xml.replace(/^\ufeff/, "");
        var stack = [], root = null, position = 0, nodes = 0;
        while (position < xml.length) {
            var remaining = xml.slice(position), match;
            if (remaining.indexOf("<?xml ") === 0 && !root && !stack.length) {
                var declarationEnd = remaining.indexOf("?>");
                if (declarationEnd < 0) invalid();
                position += declarationEnd + 2; continue;
            }
            if (remaining.indexOf("<!--") === 0) {
                var commentEnd = remaining.indexOf("-->");
                if (commentEnd < 0 || remaining.slice(4, commentEnd).indexOf("--") >= 0) invalid();
                position += commentEnd + 3; continue;
            }
            if (remaining.indexOf("<![CDATA[") === 0) {
                var cdataEnd = remaining.indexOf("]]>");
                if (!stack.length || cdataEnd < 0) invalid();
                stack[stack.length - 1].text += remaining.slice(9, cdataEnd);
                position += cdataEnd + 3; continue;
            }
            if (remaining.charAt(0) !== "<") {
                var nextTag = remaining.indexOf("<");
                var text = remaining.slice(0, nextTag < 0 ? remaining.length : nextTag);
                if (stack.length) stack[stack.length - 1].text += decode(text);
                else if (text.trim()) invalid();
                position += text.length; continue;
            }
            match = /^<\/([A-Za-z_][\w.-]*)\s*>/.exec(remaining);
            if (match) {
                if (!stack.length || stack.pop().name !== match[1]) invalid();
                position += match[0].length; continue;
            }
            match = /^<([A-Za-z_][\w.-]*)/.exec(remaining);
            if (!match || ++nodes > 12000 || stack.length >= 8) invalid();
            var node = {name:match[1],attributes:{},children:[],text:""};
            var opening = match[0].length, selfClosing = false;
            while (true) {
                var rest = remaining.slice(opening);
                var end = /^\s*(\/?)>/.exec(rest);
                if (end) { selfClosing = !!end[1]; opening += end[0].length; break; }
                var attribute = /^\s+([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(rest);
                if (!attribute || Object.prototype.hasOwnProperty.call(node.attributes, attribute[1])) invalid();
                Object.defineProperty(node.attributes, attribute[1], {value:decode(attribute[2] === undefined ? attribute[3] : attribute[2]),enumerable:true});
                opening += attribute[0].length;
            }
            if (stack.length) stack[stack.length - 1].children.push(node);
            else { if (root) invalid(); root = node; }
            if (!selfClosing) stack.push(node);
            position += opening;
        }
        if (stack.length || !root || root.name !== "root" || root.text.trim()) invalid();
        if (!allowError && root.attributes.status_code !== "200")
            throw new Error("Sunshine application list returned status " + (root.attributes.status_code || "unknown") + ".");
        return root;
    }
    function parseList(xml) {
        var root = parseRoot(xml);
        function field(app, name, required) {
            var found = app.children.filter(function (node) { return node.name === name; });
            if (found.length > 1 || (!found.length && required) || (found.length && found[0].children.length)) invalid();
            return found.length ? found[0].text.trim() : "";
        }
        var seen = {};
        return root.children.map(function (app) {
            if (app.name !== "App" || app.text.trim()) invalid();
            var id = field(app, "ID", true), title = field(app, "AppTitle", true);
            if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1 || Number(id) > 0xffffffff || !title) invalid();
            id = Number(id);
            if (seen[id]) throw new Error("Sunshine returned duplicate application IDs.");
            seen[id] = true;
            return {id:id,title:title,hdrSupported:field(app,"IsHdrSupported",false)==="1"};
        });
    }
    function create(options) {
        function checkCanceled() { if (options.signal && options.signal.aborted) throw new Error("Application-list request canceled."); }
        async function credentials(input, httpsPort) {
            checkCanceled();
            var address = global.MoonlightPairing.parseHost(input);
            var identity = await options.loadIdentity(), host = await options.loadHost(address.key);
            if (!identity || !host || !host.certificatePem || host.uniqueId !== identity.uniqueId)
                throw new Error("Connect and pair with this host before loading its games.");
            var port = httpsPort === undefined ? host.httpsPort : httpsPort;
            if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid Sunshine HTTPS port.");
            checkCanceled();return {address:address,identity:identity,host:host,port:port};
        }
        async function request(input, httpsPort, endpoint, binary, prepared) {
            var c=prepared||await credentials(input,httpsPort),address=c.address,identity=c.identity,host=c.host,port=c.port;
            var random = options.randomBytes(16), values = [];
            if (!random || random.length !== 16) throw new Error("Native secure random generator returned no request ID.");
            for (var i = 0; i < 16; i++) {
                var value = typeof random === "string" ? random.charCodeAt(i) : random[i];
                if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error("Invalid native random bytes.");
                values.push(value);
            }
            values[6] = (values[6] & 15) | 64; values[8] = (values[8] & 63) | 128;
            var hex = values.map(function (v) { return ("0" + v.toString(16)).slice(-2); }).join("");
            var uuid = hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
            checkCanceled();
            var response = await options.requestHttps({host:address.host,port:port,
                path:endpoint+(endpoint.indexOf("?")<0?"?":"&")+"uniqueid="+encodeURIComponent(identity.uniqueId)+"&uuid="+uuid,
                identity:identity,pinnedCertificatePem:host.certificatePem,timeoutMs:15000,signal:options.signal,
                responseType:binary?"binary":"text",maxResponseBytes:binary?2097152:131072});
            checkCanceled();
            return {body:response,hostname:host.hostname || address.host,host:address.key};
        }
        function decodeArtwork(bytes) {
            // Apply the same bounds to network images and persistent cache hits.
            if (typeof bytes !== "string" || bytes.length < 33 || bytes.length > 2097152 ||
                bytes.slice(0,8) !== "\x89PNG\r\n\x1a\n" || bytes.slice(8,16) !== "\x00\x00\x00\x0dIHDR")
                throw new Error("Sunshine returned invalid PNG artwork.");
            function uint32(offset) {
                return bytes.charCodeAt(offset)*16777216+bytes.charCodeAt(offset+1)*65536+
                    bytes.charCodeAt(offset+2)*256+bytes.charCodeAt(offset+3);
            }
            var width=uint32(16),height=uint32(20);
            if (!width || !height || width>4096 || height>4096 || width*height>4194304)
                throw new Error("Sunshine artwork dimensions are too large.");
            return {url:"data:image/png;base64,"+global.forge.util.encode64(bytes),width:width,height:height,bytes:bytes.length};
        }
        function cacheError(error){if(options.onArtworkCacheError)options.onArtworkCacheError(error);}
        return {
            listApps:async function (input, httpsPort) {
                var result = await request(input,httpsPort,"/applist",false);
                return {apps:parseList(result.body),hostname:result.hostname,host:result.host};
            },
            loadArtwork:async function (input, appId, httpsPort) {
                if (!Number.isInteger(appId) || appId < 1 || appId > 0xffffffff) throw new Error("Invalid application ID.");
                var c=await credentials(input,httpsPort),key=null;
                if(options.artworkCache){
                    key=global.forge.md.sha256.create().update(c.address.key+"\n"+c.port+"\n"+c.identity.uniqueId+"\n"+c.host.certificatePem+"\n"+appId).digest().toHex();
                    try{
                        var bytes=options.artworkCache.get(key);checkCanceled();
                        if(bytes!==null){var cached=decodeArtwork(bytes);cached.cacheHit=true;cached.invalidateCache=function(){try{options.artworkCache.remove(key);}catch(error){cacheError(error);}};return cached;}
                    }catch(error){
                        checkCanceled();cacheError(error);
                        try{options.artworkCache.remove(key);}catch(_){}
                    }
                }
                var result=await request(input,httpsPort,"/appasset?appid="+appId+"&AssetType=2&AssetIdx=0",true,c),cover=decodeArtwork(result.body);
                if(key)try{options.artworkCache.put(key,result.body);}catch(error){cacheError(error);}
                if(key)cover.invalidateCache=function(){try{options.artworkCache.remove(key);}catch(error){cacheError(error);}};
                checkCanceled();return cover;
            }
        };
    }
    global.MoonlightApps = {create:create,parseList:parseList,parseRoot:parseRoot};
})(typeof window !== "undefined" ? window : globalThis);
