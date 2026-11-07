/* Explicit maintenance command. Never run automatically on UI close. */
(async function () {
    var native = window.MoonlightNative.create();
    native.clearExperimentData();
    await log("MOONLIGHT_STORAGE_CLEARED: " + native.storageRoot + "/");
    await log("Sunshine's paired-client entry is separate; remove it in Sunshine if retiring this client.");
})();
