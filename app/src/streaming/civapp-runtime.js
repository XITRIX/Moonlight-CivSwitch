/* Publish the preceding bundled runtime without requiring a PC upload.
 * Keep this after dist/runtime/moonlight-stream.js and before stream-client.js.
 * Replacing a stale staged upload prevents an older runtime taking precedence.
 */
if (typeof MoonlightStreamCore !== "function") throw Error("Bundled streaming runtime is missing");
window.__moonlightStreamFactory = MoonlightStreamCore;
window.__moonlightStreamFactoryDigest = null;
delete window.__moonlightStreamModuleUpload;
