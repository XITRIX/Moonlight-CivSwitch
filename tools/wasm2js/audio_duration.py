"""Checked build-copy negotiation policy; preserve the upstream audio preset.

High-refresh stereo can use 10 ms Opus packets to reduce native/bridge calls.
Do not set SLOW_OPUS_DECODER: that also changes the RTSP quality preset.
"""
import hashlib

SOURCE_SHA256 = 'c0ef395dd701b9f30defc9ae94ba2333c0cf7cdaa7108f7fb1b9300241f1a6aa'
ANCHOR = 'StreamConfig.bitrate < LOW_AUDIO_BITRATE_TRESHOLD))'
REPLACEMENT = '(StreamConfig.bitrate < LOW_AUDIO_BITRATE_TRESHOLD ||\n                        (audioChannelCount == 2 && StreamConfig.fps > 60))))'

def specialize(source):
    if hashlib.sha256(source.encode()).hexdigest() != SOURCE_SHA256 or source.count(ANCHOR) != 1:
        raise ValueError('Pinned SdpGenerator.c changed; review audio-duration negotiation')
    return source.replace(ANCHOR, REPLACEMENT)

def fixture(source):
    adapted = specialize(source)
    begin = adapted.index('    if (AppVersionQuad[0] >= 7) {\n        if (StreamConfig.bitrate >= HIGH_AUDIO_BITRATE_THRESHOLD')
    end = adapted.index('\n    if (AppVersionQuad[0] >= 7) {', begin + 8)
    return '''static int durationPolicy(int major,int fps,int bitrate,int caps,int channels,int hq) {
    int AppVersionQuad[4]={major,0,0,0},AudioPacketDuration=0,err=0,optionHead=0;
    int audioChannelCount=channels,HighQualitySurroundSupported=hq,HighQualitySurroundEnabled=0;
    struct {int bitrate,fps;} StreamConfig={bitrate,fps};
    struct {int capabilities;} AudioCallbacks={caps};char payloadStr[32];
''' + adapted[begin:end] + '\n    return AudioPacketDuration;\n}\n'
