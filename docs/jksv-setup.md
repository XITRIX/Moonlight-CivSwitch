# CivSwitch loader through JKSV

For the Switch 1 edition of Civilization VII, physical cartridge version 1.0.0.
This creates the persistent CivSwitch loader save offline, avoiding the chat
keyboard bootstrap. The generated loader listens on TCP port 9026. It uses the
same template, compression helper, stager, payload wrapper and record splice as
the local upstream installer. Nothing is sent to the console during the build.

## Install the generated file

1. Fully close Civilization VII. In JKSV select the user you play with and the
   game, then create a backup named `Before-CivSwitch`. Keep that backup intact.
2. On the computer, duplicate that backup as `CivSwitch-loader` in the same
   title's JKSV folder. If it is a ZIP backup, extract a copy, modify its contents
   as below, and ZIP those contents again with the same paths at the archive root.
   Keep the metadata file from JKSV in the copy.
3. Copy the generated `saves/Single/XSTRIG.Civ7Save` into the copy of your backup
   at exactly that relative path. Merge folders; retain the backup's other files.
   Do not put the outer `CivSwitch-loader` folder inside the backup.
4. Return the modified backup to the SD card beside the original, refresh or
   reopen JKSV, and restore **the modified copy** to the same user and game.
   This restores that backup's entire contents, so use a fresh backup.
5. Launch the game with that user and open **Load Game** from the main menu.
   The loader should start while the save list builds; no manual loading of
   `XSTRIG` or chat typing is needed. Look for the CivSwitch loader screen.

The generated ZIP without `--backup-dir` is an overlay containing only the
trigger, not a complete modern JKSV backup. Merging it into your own backup
preserves the correct title/user metadata and other game data. To remove the
trigger, fully close the game and restore `Before-CivSwitch`.

## Send this project's Moonlight UI

Connect the PC and OLED to the same local network. Replace `OLED_IP` with the
OLED's own address, not the address previously used for the Switch 2:

```sh
python3 tools/send_ui.py OLED_IP
```

For streaming, with `dist/runtime/moonlight-stream.js` already built:

```sh
python3 tools/send_ui.py OLED_IP --streaming
```

Keep the sender running. The Moonlight port's existing hardware results are for
Switch 2; its native media and rendering paths still need validation on OLED.
Successfully reaching CivSwitch does not establish Moonlight compatibility.

## Rebuild

The ignored upstream checkout must exist at
`investigation/references/CivSwitch`, with its installer-creator Node dependencies
installed. The reference commit used for the initial artifact is
`59e27b4894e91bc53ece58dd5e9add7335639ef3`.

```sh
python3 tools/build_jksv_save.py
```

Output is under `dist/jksv/`. Existing outputs are never overwritten. To build
a complete modified copy of an **unpacked** backup directly:

```sh
python3 tools/build_jksv_save.py \
  --backup-dir /path/to/Before-CivSwitch \
  --output /path/to/CivSwitch-loader
```

The source backup stays unchanged. A ZIP and hash manifest are written beside
the output folder. The compressor verifies that its stage decodes exactly to
the minified payload. Offline verification cannot establish successful boot on
the console.

Sources: [CivSwitch](https://github.com/Gezine/CivSwitch),
[upstream installer](https://github.com/Gezine/CivSwitch/tree/59e27b4894e91bc53ece58dd5e9add7335639ef3/installer-creator),
[JKSV](https://github.com/J-D-K/JKSV).
