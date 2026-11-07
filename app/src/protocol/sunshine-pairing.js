/* Sunshine GameStream pairing, running entirely in the console's JavaScript VM.
 * Protocol references (independent implementation):
 * moonlight-stream/moonlight-embedded, libgamestream/client.c
 * LizardByte/Sunshine, src/nvhttp.cpp
 *
 * Load app/vendor/forge-1.4.3.min.js first. Transport contract:
 * requestHttp({host,port,path,timeoutMs,signal}) -> Promise<XML string>
 * requestHttps({...same,identity,pinnedCertificatePem}) -> Promise<XML string>
 * HTTPS MUST use identity's PKCS#12/client key and verify the exact pinned peer
 * certificate before sending the HTTP request. A disabled verification flag alone
 * does not satisfy this contract. HTTP status failures must reject.
 * randomBytes(n) MUST synchronously return n bytes from a native secure RNG.
 * loadIdentity()/saveIdentity(identity), loadHost(hostKey)/saveHost(hostKey,host)
 * may be async. Identity and host contain secrets: never log them.
 */
(function (global) {
  "use strict";

  function fail(message) { throw new Error(message); }
  function pause() { return new Promise(function (resolve) { setTimeout(resolve, 0); }); }
  function bytes(value, length) {
    var out = "";
    if (typeof value === "string") out = value;
    else if (value && typeof value.length === "number") {
      for (var i = 0; i < value.length; i++) {
        if (!Number.isInteger(value[i]) || value[i] < 0 || value[i] > 255) fail("Invalid native random bytes");
        out += String.fromCharCode(value[i]);
      }
    } else fail("Native secure random generator returned no bytes");
    if (out.length !== length) fail("Native secure random generator returned the wrong byte count");
    for (var j = 0; j < out.length; j++) if (out.charCodeAt(j) > 255) fail("Invalid binary byte string");
    return out;
  }
  function parseHost(input) {
    var match = /^([A-Za-z0-9][A-Za-z0-9.-]*)(?::([0-9]{1,5}))?$/.exec(String(input).trim());
    if (!match || match[1].length > 253) fail("Enter a host address, optionally followed by :port");
    var port = match[2] ? Number(match[2]) : 47989;
    if (port < 1 || port > 65535) fail("Invalid Sunshine HTTP port");
    if (/^[0-9.]+$/.test(match[1])) {
      var octets = match[1].split(".");
      if (octets.length !== 4 || octets.some(function (v) { return !/^\d{1,3}$/.test(v) || Number(v) > 255; })) fail("Invalid IPv4 address");
    }
    return { host: match[1].toLowerCase(), port: port, key: match[1].toLowerCase() + ":" + port };
  }
  function xmlValue(xml, tag, required) {
    var pattern = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "g");
    var m = pattern.exec(xml);
    if (!m) { if (required) fail("Sunshine response is missing " + tag); return ""; }
    if (pattern.exec(xml)) fail("Duplicate Sunshine response field: " + tag);
    if (/<[^>]*>/.test(m[1])) fail("Invalid Sunshine response field: " + tag);
    return m[1].replace(/&(amp|lt|gt|quot|apos);/g, function (_, v) {
      return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[v];
    }).trim();
  }
  function checkXml(xml) {
    if (typeof xml !== "string" || xml.length > 131072 || /<!DOCTYPE|<!ENTITY/i.test(xml)) fail("Invalid Sunshine XML response");
    var root = /<root\b[^>]*\bstatus_code=["'](\d+)["'][^>]*>/.exec(xml);
    if (!root) fail("Sunshine response has no status code");
    if (root[1] !== "200") fail("Sunshine returned status " + root[1]);
    return xml;
  }
  function requirePaired(xml) {
    checkXml(xml);
    if (xmlValue(xml, "paired", true) !== "1") fail("Sunshine rejected pairing; check the PIN and try again");
    return xml;
  }
  function equalBytes(a, b) {
    var mismatch = a.length ^ b.length;
    for (var i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
    return mismatch === 0;
  }

  function installNativeBigIntModPow(forge) {
    if (typeof BigInt !== "function") fail("Pairing requires the console's BigInt support");
    var BigInteger = forge.jsbn.BigInteger;
    function integer(value) {
      var text = value.toString(16);
      return text.charAt(0) === "-" ? -BigInt("0x" + text.slice(1)) : BigInt("0x" + text);
    }
    function power(base, exponent, modulus) {
      if (exponent < 0n || modulus <= 0n) fail("Invalid modular exponentiation arguments");
      base = ((base % modulus) + modulus) % modulus;
      var result = 1n % modulus;
      while (exponent > 0n) {
        if (exponent & 1n) result = (result * base) % modulus;
        exponent >>= 1n;
        if (exponent > 0n) base = (base * base) % modulus;
      }
      return new BigInteger(result.toString(16), 16);
    }
    // Hardware measurements showed several seconds per JSBN primality check.
    // Keep Forge's primality tests, RSA CRT and blinding, replacing only its
    // modular arithmetic with V8's native BigInt operations. Like the original
    // JSBN routines, this does not provide a constant-time execution guarantee.
    BigInteger.prototype.modPow = function (exponent, modulus) {
      return power(integer(this), integer(exponent), integer(modulus));
    };
    BigInteger.prototype.modPowInt = function (exponent, modulus) {
      if (!Number.isSafeInteger(exponent) || exponent < 0) fail("Invalid modular exponent");
      return power(integer(this), BigInt(exponent), integer(modulus));
    };
  }

  function create(options) {
    options = options || {};
    var forge = global.forge;
    if (!forge) fail("The bundled cryptography library is missing");
    installNativeBigIntModPow(forge);
    ["requestHttp", "requestHttps", "randomBytes", "loadIdentity", "saveIdentity", "loadHost", "saveHost"].forEach(function (name) {
      if (typeof options[name] !== "function") fail("Missing pairing adapter: " + name);
    });
    var busy = false;
    var entropyCalls = 0, entropyBytes = 0, entropyMilliseconds = 0;
    function random(n) {
      var started = Date.now();
      var result = bytes(options.randomBytes(n), n);
      entropyCalls++; entropyBytes += n; entropyMilliseconds += Date.now() - started;
      return result;
    }
    // All Forge randomness, including RSA blinding and the vendored primality
    // witness hook, goes through the native generator. There is no weak fallback.
    forge.options.usePureJavaScript = true;
    forge.random.getBytesSync = random;
    forge.random.getBytes = function (n, callback) {
      if (!callback) return random(n);
      try { callback(null, random(n)); } catch (error) { callback(error); }
    };
    var witnessPool = "";
    global.MoonlightForgeRandom = function () {
      // Miller–Rabin asks for individual witness bytes. Batch native RNG calls
      // rather than crossing the ROP bridge once for every generated byte.
      if (witnessPool.length < 6) witnessPool += random(512);
      var value = witnessPool.slice(0, 6), fraction = 0;
      witnessPool = witnessPool.slice(6);
      for (var i = 0; i < 6; i++) fraction = fraction * 256 + value.charCodeAt(i);
      return fraction / 281474976710656;
    };
    random(1); // Fail before any key generation if native entropy is unavailable.
    function abortCheck() { if (options.signal && options.signal.aborted) fail("Pairing canceled"); }
    function progress(stage, message, extra) {
      abortCheck();
      if (options.onProgress) options.onProgress(Object.assign({ stage: stage, message: message }, extra || {}));
    }
    function hash(data) { return forge.md.sha256.create().update(data, "raw").digest().getBytes(); }
    function hex(data) { return forge.util.bytesToHex(data); }
    function unhex(value, min, max, name) {
      if (!/^(?:[0-9a-f]{2})+$/i.test(value) || value.length / 2 < min || value.length / 2 > max) fail("Invalid Sunshine " + name);
      return forge.util.hexToBytes(value);
    }
    function uuid() {
      var r = random(16).split("").map(function (v) { return v.charCodeAt(0); });
      r[6] = (r[6] & 15) | 64; r[8] = (r[8] & 63) | 128;
      var h = hex(bytes(r, 16));
      return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
    }
    function aes(data, key, decrypt) {
      if (data.length % 16) fail("Invalid AES block length");
      var cipher = decrypt ? forge.cipher.createDecipher("AES-ECB", key) : forge.cipher.createCipher("AES-ECB", key);
      cipher.start(); cipher.update(forge.util.createBuffer(data, "raw"));
      if (!cipher.finish(function () { return true; })) fail("AES operation failed");
      return cipher.output.getBytes();
    }
    async function getIdentity() {
      var identity = await options.loadIdentity();
      if (identity) {
        if (!/^[0-9a-f]{16}$/i.test(identity.uniqueId || "")) fail("Saved pairing identity is invalid");
        var savedCert = forge.pki.certificateFromPem(identity.certificatePem);
        var savedKey = forge.pki.privateKeyFromPem(identity.privateKeyPem);
        if (savedKey.n.bitLength() < 2048 || savedKey.n.compareTo(savedCert.publicKey.n) !== 0 || savedKey.e.compareTo(savedCert.publicKey.e) !== 0) fail("Saved pairing certificate does not match its private key");
        if (!identity.p12Bytes || typeof identity.p12Password !== "string") fail("Saved identity has no native TLS credential");
        return identity;
      }
      progress("generating_identity", "Creating the Switch's pairing certificate…");
      await pause();
      abortCheck();
      var state = forge.pki.rsa.createKeyPairGenerationState(2048, 65537, { prng: { getBytesSync: random } });
      var started = Date.now(), lastProgress = started, steps = 0;
      while (true) {
        var generated = forge.pki.rsa.stepKeyPairGenerationState(state, 12);
        steps++;
        abortCheck();
        var now = Date.now(), elapsed = now - started;
        if (now - lastProgress >= 2000 || steps % 16 === 0 || generated) {
          var primes = (state.p ? 1 : 0) + (state.q ? 1 : 0);
          progress(generated ? "key_generated" : "generating_identity",
            generated ? "Pairing key created in " + Math.round(elapsed / 1000) + "s" :
              "Creating pairing key… " + Math.round(elapsed / 1000) + "s, " + primes + "/2 primes", {
              elapsedMs: elapsed, steps: steps, primesFound: primes, keygenPhase: state.state,
              candidatePhase: state.pqState, entropyCalls: entropyCalls,
              entropyBytes: entropyBytes, entropyMs: entropyMilliseconds
            });
          lastProgress = now;
        }
        if (elapsed > 180000 || steps > 20000) fail("Creating the pairing identity took too long; try again");
        if (generated) break;
        await pause();
      }
      abortCheck();
      progress("generating_certificate", "Signing the Switch's pairing certificate…");
      await pause();
      abortCheck();
      var cert = forge.pki.createCertificate();
      cert.publicKey = state.keys.publicKey;
      cert.serialNumber = "01" + hex(random(15));
      cert.validity.notBefore = new Date(Date.now() - 86400000);
      cert.validity.notAfter = new Date(Date.now() + 3650 * 86400000);
      var attributes = [{ name: "commonName", value: "CivSwitch Moonlight" }];
      cert.setSubject(attributes); cert.setIssuer(attributes);
      cert.setExtensions([
        { name: "basicConstraints", cA: false },
        { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
        { name: "extKeyUsage", clientAuth: true }
      ]);
      cert.sign(state.keys.privateKey, forge.md.sha256.create());
      abortCheck();
      progress("wrapping_credential", "Preparing the native TLS credential…");
      await pause();
      abortCheck();
      var password = hex(random(16));
      // Use broadly compatible 3DES PKCS#12 credential wrapping. The native
      // importer must still be verified on hardware; TLS negotiation stays native.
      var p12 = forge.pkcs12.toPkcs12Asn1(state.keys.privateKey, [cert], password, {
        algorithm: "3des", count: 2048, saltSize: 16, friendlyName: "CivSwitch Moonlight", generateLocalKeyId: true
      });
      identity = {
        version: 1, uniqueId: hex(random(8)), certificatePem: forge.pki.certificateToPem(cert),
        privateKeyPem: forge.pki.privateKeyToPem(state.keys.privateKey),
        p12Bytes: forge.asn1.toDer(p12).getBytes(), p12Password: password
      };
      // Retain the identity before the host sees it so interrupted attempts can
      // retry with the same credential. This does not record a successful pair.
      progress("saving_identity", "Saving the pairing identity on this Switch…");
      await pause();
      abortCheck();
      await options.saveIdentity(identity);
      return identity;
    }
    function path(identity, endpoint, fields) {
      var values = Object.assign({ uniqueid: identity.uniqueId, uuid: uuid() }, fields || {});
      if (endpoint === "pair") values = Object.assign({ devicename: "CivSwitch Moonlight", updateState: "1" }, values);
      return "/" + endpoint + "?" + Object.keys(values).map(function (key) {
        return encodeURIComponent(key) + "=" + encodeURIComponent(values[key]);
      }).join("&");
    }
    async function checkAndPair(input) {
      if (busy) fail("A Sunshine request is already running");
      busy = true;
      try {
        abortCheck();
        var address = parseHost(input);
        progress("checking", "Checking Sunshine…");
        // A temporary random id lets server discovery run before expensive RSA
        // generation; it cannot grant permission and is never saved as identity.
        var discoveryIdentity = { uniqueId: hex(random(8)) };
        var info = checkXml(await options.requestHttp({ host: address.host, port: address.port,
          path: path(discoveryIdentity, "serverinfo"), timeoutMs: 10000, signal: options.signal }));
        var hostname = xmlValue(info, "hostname", false) || address.host;
        var version = xmlValue(info, "appversion", true);
        if (Number(version.split(".")[0]) < 7 || !/^\d+\./.test(version)) fail("This prototype requires Sunshine's GameStream protocol version 7 or newer");
        var advertisedPort = xmlValue(info, "HttpsPort", false);
        var httpsPort = advertisedPort ? Number(advertisedPort) : address.port - 5;
        if (!Number.isInteger(httpsPort) || httpsPort < 1 || httpsPort > 65535) fail("Sunshine advertised an invalid HTTPS port");
        progress("online", "Sunshine is online: " + hostname, { hostname: hostname });
        var identity = await getIdentity();
        var savedHost = await options.loadHost(address.key);
        function http(fields, timeout) {
          abortCheck();
          return options.requestHttp({ host: address.host, port: address.port, path: path(identity, "pair", fields),
            timeoutMs: timeout || 10000, signal: options.signal });
        }
        function https(endpoint, fields, certificate) {
          abortCheck();
          return options.requestHttps({ host: address.host, port: httpsPort, path: path(identity, endpoint, fields),
            timeoutMs: 15000, signal: options.signal, identity: identity, pinnedCertificatePem: certificate });
        }
        if (savedHost && savedHost.certificatePem) {
          progress("checking_pair", "Checking the saved pairing…");
          // A network/TLS/pin error must remain visible: never silently replace a
          // known certificate by performing an unauthenticated new pairing.
          var savedInfo = checkXml(await https("serverinfo", null, savedHost.certificatePem));
          if (xmlValue(savedInfo, "PairStatus", true) === "1") {
            progress("paired", "Paired with " + hostname, { hostname: hostname, reused: true });
            return { paired: true, host: address.key, hostname: hostname, httpsPort: httpsPort, reused: true };
          }
        }
        var pinNumber;
        do { var p = random(2); pinNumber = p.charCodeAt(0) * 256 + p.charCodeAt(1); } while (pinNumber >= 60000);
        var pin = ("0000" + (pinNumber % 10000)).slice(-4);
        var salt = random(16);
        progress("waiting_pin", "Enter this PIN in Sunshine's PIN page", { pin: pin, hostname: hostname });
        await pause();
        var response = requirePaired(await http({ phrase: "getservercert", salt: hex(salt), clientcert: hex(identity.certificatePem) }, 180000));
        var serverPem = unhex(xmlValue(response, "plaincert", true), 128, 16384, "certificate");
        var serverCert = forge.pki.certificateFromPem(serverPem);
        if (!serverCert.publicKey.n || serverCert.publicKey.n.bitLength() < 2048) fail("Sunshine must present an RSA certificate of at least 2048 bits");
        if (savedHost && savedHost.certificatePem && !equalBytes(
          forge.asn1.toDer(forge.pki.certificateToAsn1(serverCert)).getBytes(),
          forge.asn1.toDer(forge.pki.certificateToAsn1(forge.pki.certificateFromPem(savedHost.certificatePem))).getBytes())) fail("Sunshine's certificate changed; saved pairing was not replaced");
        var key = hash(salt + pin).slice(0, 16);
        var challenge = random(16);
        progress("exchanging_challenges", "Verifying the pairing challenge…");
        response = requirePaired(await http({ clientchallenge: hex(aes(challenge, key, false)) }));
        var encrypted = unhex(xmlValue(response, "challengeresponse", true), 48, 64, "challenge response");
        if (encrypted.length !== 48 && encrypted.length !== 64) fail("Unexpected Sunshine challenge response length");
        var decrypted = aes(encrypted, key, true);
        var serverHash = decrypted.slice(0, 32), serverChallenge = decrypted.slice(32, 48);
        var clientSecret = random(16);
        var clientCert = forge.pki.certificateFromPem(identity.certificatePem);
        response = requirePaired(await http({ serverchallengeresp: hex(aes(hash(serverChallenge + clientCert.signature + clientSecret), key, false)) }));
        var secret = unhex(xmlValue(response, "pairingsecret", true), 17, 1040, "pairing secret");
        var serverSecret = secret.slice(0, 16), signature = secret.slice(16);
        var validSignature = false;
        try {
          validSignature = signature.length === Math.ceil(serverCert.publicKey.n.bitLength() / 8) &&
            serverCert.publicKey.verify(hash(serverSecret), signature);
        } catch (_) { /* Malformed RSA blocks are failed signatures. */ }
        if (!validSignature) fail("Sunshine's pairing signature is invalid");
        if (!equalBytes(serverHash, hash(challenge + serverCert.signature + serverSecret))) fail("Pairing PIN or server challenge is incorrect");
        abortCheck();
        var privateKey = forge.pki.privateKeyFromPem(identity.privateKeyPem);
        var signedSecret = privateKey.sign(forge.md.sha256.create().update(clientSecret, "raw"));
        requirePaired(await http({ clientpairingsecret: hex(clientSecret + signedSecret) }));
        progress("verifying_tls", "Verifying native TLS and the client certificate…");
        requirePaired(await https("pair", { phrase: "pairchallenge" }, serverPem));
        var verified = checkXml(await https("serverinfo", null, serverPem));
        if (xmlValue(verified, "PairStatus", true) !== "1") fail("Sunshine did not confirm the pairing over authenticated HTTPS");
        abortCheck();
        await options.saveHost(address.key, { version: 1, certificatePem: serverPem, hostname: hostname,
          httpsPort: httpsPort, verifiedAt: new Date().toISOString(), uniqueId: identity.uniqueId });
        progress("paired", "Paired with " + hostname, { hostname: hostname, reused: false });
        return { paired: true, host: address.key, hostname: hostname, httpsPort: httpsPort, reused: false };
      } finally { busy = false; }
    }
    return { checkAndPair: checkAndPair, parseHost: parseHost, isBusy: function () { return busy; } };
  }
  global.MoonlightPairing = { create: create, parseHost: parseHost };
})(typeof window !== "undefined" ? window : globalThis);
