#!/usr/bin/env python3
"""Verify the pinned CivApps renderer release and refresh packaged notices."""
from pathlib import Path
import json
from civapps_native_ui import verify
ROOT=Path(__file__).resolve().parents[1]
lock=verify(ROOT)
cap=json.loads((ROOT/'payload.json').read_text())['extensions']['nativeUi']
if cap.get('library')!=lock['name'] or cap.get('version')!=lock['version'] or cap['api']!=lock['api']:
    raise ValueError('Update payload.json nativeUi capability to match civapps-native-ui.lock.json')
notice=ROOT/'app/civapp-notices.js'
marker='/* CIV_NATIVE_UI_NOTICES'
base=notice.read_text().split(marker)[0].rstrip()+'\n\n'
text=(ROOT/'app/vendor/civapps-native-ui-NOTICE.txt').read_text()
notice.write_text(base+marker+'\n'+text.replace('*/','* /')+'\n*/\n')
print('Verified CivApps native UI',lock['version'])
