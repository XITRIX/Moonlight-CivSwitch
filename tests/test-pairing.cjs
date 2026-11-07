/* Run: node tests/test-pairing.cjs. Tests need no npm packages or network.
 * The fake Sunshine uses Node/OpenSSL crypto, independently of the JS client.
 */
"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const tls = require("node:tls");

const context = { console, setTimeout, clearTimeout, Uint8Array };
// Civ VII has URL but no URL.searchParams. Optional Forge console settings
// must not make its browser build fail at module load on that legacy API.
context.URL = function LegacyURL() {};
context.location = { href: "coui://moonlight/index.html" };
const frozenTime = Date.parse("2026-11-07T12:00:00Z");
context.Date = class FrozenDate extends Date {
  constructor(...args) { super(...(args.length ? args : [frozenTime])); }
  static now() { return frozenTime; }
};
context.window = context;
context.Math = Object.create(Math);
context.Math.random = () => { throw Error("Weak Math.random must never be used"); };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/vendor/forge-1.4.3.min.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/src/protocol/sunshine-pairing.js"), "utf8"), context);
const forge = context.forge;
// The fixture certificate also needs secure RSA blinding before a client exists.
forge.random.getBytesSync = n => crypto.randomBytes(n).toString("latin1");
forge.random.getBytes = forge.random.getBytesSync;
context.MoonlightForgeRandom = () => crypto.randomBytes(6).readUIntBE(0, 6) / 281474976710656;
// A clock that stays fixed during JS callbacks must not trap Forge's timed
// key-generation step. A deliberately composite candidate makes the old loop
// infinite; vm's host timeout also makes this regression test fail cleanly.
vm.runInContext(`
  var boundedOperations = 0;
  var boundedState = { algorithm: "PRIMEINC", keys: null, state: 0,
    p: null, q: null, pBits: 1024, qBits: 1024, pqState: 1,
    num: { bitLength: function () { return 1024; },
      isProbablePrime: function () { return false; },
      dAddOffset: function () { boundedOperations++; } } };
  forge.pki.rsa.stepKeyPairGenerationState(boundedState, 12);
`, context, { timeout: 2000 });
assert.equal(context.boundedOperations, 8);
// Broken native entropy cannot trap witness rejection forever either.
const savedWitnessRandom = context.MoonlightForgeRandom;
context.MoonlightForgeRandom = () => 0;
assert.throws(() => vm.runInContext('new forge.jsbn.BigInteger("1009").millerRabin(1)', context, { timeout: 2000 }), /too many rejected primality witnesses/);
context.MoonlightForgeRandom = savedWitnessRandom;
const sha = value => crypto.createHash("sha256").update(value).digest();
const bin = value => Buffer.from(value, "latin1");
const hex = value => Buffer.from(value).toString("hex");
function aes(value, key, decrypt = false) {
  const cipher = decrypt ? crypto.createDecipheriv("aes-128-ecb", key, null) : crypto.createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(value), cipher.final()]);
}
function certSignature(pem) {
  // Extract the third child of Certificate SEQUENCE, excluding BIT STRING's
  // unused-bit-count byte. This does not rely on Forge's signature property.
  const der = new crypto.X509Certificate(pem).raw;
  function read(offset) {
    const tag = der[offset++]; let length = der[offset++];
    if (length & 128) { const n = length & 127; length = 0; for (let i = 0; i < n; i++) length = length * 256 + der[offset++]; }
    return { tag, start: offset, end: offset + length };
  }
  const outer = read(0), tbs = read(outer.start), algorithm = read(tbs.end), signature = read(algorithm.end);
  assert.equal(signature.tag, 3); assert.equal(der[signature.start], 0);
  return der.subarray(signature.start + 1, signature.end);
}
function certificateFor(keys) {
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(keys.publicKey);
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date("2020-01-01T00:00:00Z");
  cert.validity.notAfter = new Date("2040-01-01T00:00:00Z");
  cert.setSubject([{ name: "commonName", value: "Fake Sunshine" }]); cert.setIssuer(cert.subject.attributes);
  cert.sign(forge.pki.privateKeyFromPem(keys.privateKey), forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}
const serverKeys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
const serverCert = certificateFor(serverKeys);
const xml = fields => '<root status_code="200">' + Object.entries(fields).map(([key, value]) => `<${key}>${value}</${key}>`).join("") + "</root>";
const serverInfo = paired => xml({ hostname: "Fake Sunshine", appversion: "7.1.431.-1", HttpsPort: 47984, PairStatus: paired ? 1 : 0 });

let persistedIdentity;
function setup(mode) {
  let savedHost, pin, key, clientCert, clientChallenge, clientHash;
  let serverChallenge, serverSecret, authorized = false, savedCount = 0, pairCalls = 0, tlsCalls = 0;
  let abort = { aborted: false };
  const stages = [];
  const options = {
    randomBytes: n => crypto.randomBytes(n),
    loadIdentity: async () => persistedIdentity,
    saveIdentity: async identity => { assert.equal(pairCalls, 0); persistedIdentity = identity; },
    loadHost: async () => savedHost,
    saveHost: async (_, host) => { assert(authorized); assert.equal(tlsCalls, 2); savedHost = host; savedCount++; },
    signal: abort,
    onProgress: event => {
      stages.push(event.stage);
      if (event.pin) pin = event.pin;
      if (mode === "cancel" && event.stage === "waiting_pin") abort.aborted = true;
    },
    requestHttp: async request => {
      const url = new URL("http://" + request.host + ":" + request.port + request.path), q = url.searchParams;
      assert.equal(q.get("uniqueid").length, 16); assert.match(q.get("uuid"), /^[a-f0-9-]{36}$/);
      if (url.pathname === "/serverinfo") return serverInfo(false);
      pairCalls++;
      assert(persistedIdentity, "identity must be saved before server sees the pairing certificate");
      if (q.get("phrase") === "getservercert") {
        assert.equal(request.timeoutMs, 180000); assert.match(pin, /^\d{4}$/);
        clientCert = Buffer.from(q.get("clientcert"), "hex").toString("utf8");
        const serverPin = mode === "wrong_pin" ? (pin === "0000" ? "0001" : "0000") : pin;
        key = sha(Buffer.concat([Buffer.from(q.get("salt"), "hex"), Buffer.from(serverPin)])).subarray(0, 16);
        return xml({ paired: 1, plaincert: hex(Buffer.from(serverCert)) });
      }
      if (q.has("clientchallenge")) {
        if (mode === "malformed_hex") return xml({ paired: 1, challengeresponse: "abc" });
        clientChallenge = aes(Buffer.from(q.get("clientchallenge"), "hex"), key, true);
        serverSecret = crypto.randomBytes(16); serverChallenge = crypto.randomBytes(16);
        let hash = sha(Buffer.concat([clientChallenge, certSignature(serverCert), serverSecret]));
        if (mode === "bad_hash") hash[0] ^= 1;
        return xml({ paired: 1, challengeresponse: hex(aes(Buffer.concat([hash, serverChallenge, Buffer.alloc(16, 16)]), key)) });
      }
      if (q.has("serverchallengeresp")) {
        clientHash = aes(Buffer.from(q.get("serverchallengeresp"), "hex"), key, true);
        const signature = crypto.sign("sha256", serverSecret, serverKeys.privateKey);
        if (mode === "bad_signature") signature[0] ^= 1;
        return xml({ paired: 1, pairingsecret: hex(Buffer.concat([serverSecret, signature])) });
      }
      if (q.has("clientpairingsecret")) {
        const response = Buffer.from(q.get("clientpairingsecret"), "hex"), secret = response.subarray(0, 16);
        assert(crypto.verify("sha256", secret, new crypto.X509Certificate(clientCert).publicKey, response.subarray(16)));
        assert.deepEqual(clientHash, sha(Buffer.concat([serverChallenge, certSignature(clientCert), secret])));
        authorized = mode !== "reject_final_http";
        return xml({ paired: authorized ? 1 : 0 });
      }
      throw Error("Unexpected pairing phase");
    },
    requestHttps: async request => {
      tlsCalls++;
      assert(authorized); assert.equal(request.port, 47984);
      assert.equal(request.identity.uniqueId, persistedIdentity.uniqueId);
      assert.deepEqual(new crypto.X509Certificate(request.pinnedCertificatePem).raw, new crypto.X509Certificate(serverCert).raw);
      const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(request.identity.p12Bytes), false, request.identity.p12Password);
      const keys = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag];
      assert.equal(keys.length, 1); assert.equal(keys[0].key.n.toString(16), forge.pki.privateKeyFromPem(request.identity.privateKeyPem).n.toString(16));
      if (mode === "tls_pin_failure") throw Error("Native TLS certificate pin mismatch");
      if (request.path.startsWith("/pair?")) return xml({ paired: 1 });
      return serverInfo(mode !== "tls_unpaired");
    }
  };
  return { client: context.MoonlightPairing.create(options), stages,
    count: () => ({ pairCalls, tlsCalls, savedCount }), setHost: host => { savedHost = host; },
    getHost: () => savedHost };
}

(async () => {
  let run = setup("success");
  // Verify the BigInt-backed Forge operations against OpenSSL's modular
  // exponentiation using large DH exponents and arbitrary generators.
  const BI = forge.jsbn.BigInteger;
  const bi = value => new BI(value.toString(16), 16);
  for (const [base, exponent, modulus, expected] of [
    [2n, 10n, 17n, 4n], [-2n, 5n, 13n, 7n], [0n, 0n, 13n, 1n],
    [23n, 0n, 1n, 0n], [32n, 7n, 17n, 8n], [0n, 123n, 19n, 0n]
  ]) {
    assert.equal(bi(base).modPow(bi(exponent), bi(modulus)).toString(16), expected.toString(16));
    assert.equal(bi(base).modPowInt(Number(exponent), bi(modulus)).toString(16), expected.toString(16));
  }
  assert.throws(() => bi(2n).modPow(bi(-1n), bi(17n)), /Invalid modular/);
  assert.throws(() => bi(2n).modPow(bi(3n), bi(0n)), /Invalid modular/);
  for (const group of ["modp2", "modp14"]) {
    const prime = crypto.getDiffieHellman(group).getPrime();
    for (let i = 0; i < 4; i++) {
      const generator = crypto.randomBytes(prime.length - 1);
      const exponent = crypto.randomBytes(prime.length - 1);
      const dh = crypto.createDiffieHellman(prime, generator); dh.setPrivateKey(exponent);
      const expected = BigInt("0x" + dh.generateKeys().toString("hex"));
      const actual = new BI(generator.toString("hex"), 16).modPow(new BI(exponent.toString("hex"), 16), new BI(prime.toString("hex"), 16));
      assert.equal(actual.toString(16), expected.toString(16), group);
      // Small-exponent path is used repeatedly for Miller–Rabin squaring.
      const squared = BigInt("0x" + generator.toString("hex")) ** 2n % BigInt("0x" + prime.toString("hex"));
      assert.equal(new BI(generator.toString("hex"), 16).modPowInt(2, new BI(prime.toString("hex"), 16)).toString(16), squared.toString(16));
    }
  }
  const result = await run.client.checkAndPair("192.168.1.4:47989");
  assert(result.paired); assert.equal(result.reused, false);
  assert.deepEqual(run.count(), { pairCalls: 4, tlsCalls: 2, savedCount: 1 });
  assert.equal(persistedIdentity.uniqueId.length, 16);
  assert.equal(new crypto.X509Certificate(persistedIdentity.certificatePem).publicKey.asymmetricKeyDetails.modulusLength, 2048);
  // Independently import the generated PKCS#12 using OpenSSL, not Forge.
  assert(tls.createSecureContext({ pfx: bin(persistedIdentity.p12Bytes), passphrase: persistedIdentity.p12Password }));
  assert.throws(() => tls.createSecureContext({ pfx: bin(persistedIdentity.p12Bytes), passphrase: "incorrect" }));
  const firstId = persistedIdentity.uniqueId;
  const savedHost = run.getHost();
  const reused = await run.client.checkAndPair("192.168.1.4:47989");
  assert(reused.reused); assert.equal(persistedIdentity.uniqueId, firstId);
  assert.equal(run.count().pairCalls, 4);
  for (const [mode, message] of [
    ["wrong_pin", /PIN or server challenge/], ["bad_hash", /PIN or server challenge/],
    ["bad_signature", /signature is invalid/], ["malformed_hex", /Invalid Sunshine challenge/],
    ["reject_final_http", /Sunshine rejected pairing/], ["tls_unpaired", /did not confirm/],
    ["tls_pin_failure", /pin mismatch/], ["cancel", /Pairing canceled/]
  ]) {
    run = setup(mode);
    await assert.rejects(run.client.checkAndPair("192.168.1.4:47989"), message, mode);
    assert.equal(run.count().savedCount, 0, mode + " must not persist success");
    assert.equal(persistedIdentity.uniqueId, firstId);
    assert.equal(run.client.isBusy(), false);
  }
  // Known host TLS errors must not silently start a new unauthenticated pair.
  run = setup("tls_pin_failure"); run.setHost(savedHost);
  await assert.rejects(run.client.checkAndPair("192.168.1.4:47989"));
  assert.equal(run.count().pairCalls, 0);
  for (const host of ["http://192.168.1.4", "192.168.1.999", "host:0", "host:65536", "host/path", "host\r\nX:1"])
    assert.throws(() => context.MoonlightPairing.parseHost(host));
  console.log("Pairing protocol tests passed: BigInt modular arithmetic vs OpenSSL at 1024/2048 bits, frozen Date and bounded RSA/witness loops, legacy URL, full handshake, saved identity/PKCS#12, reuse, wrong PIN, tampered hash/signature, malformed responses, HTTP rejection, TLS failure, HTTPS verification, cancellation, host validation, no Math.random.");
})().catch(error => { console.error(error); process.exitCode = 1; });
