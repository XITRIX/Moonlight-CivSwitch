# Generated media fixtures

All samples are synthetic blue video or quiet sine-wave audio, generated locally
with FFmpeg. No host screenshots, pairing credentials or downloaded game assets
are included. Encoder versions may change byte-for-byte output.

The native frame probes use baseline H.264, raw SPS/PPS without start codes for
configuration, and **Annex B** access units for decoding. `avcc2` is retained in
`h264-nals.js` to reproduce the failed framing comparison.

Generate a semantically equivalent 720p sequence:

```sh
ffmpeg -f lavfi -i color=c=blue:s=1280x720:r=30 -frames:v 30 \
  -c:v libx264 -profile:v baseline -preset ultrafast -tune zerolatency \
  -threads 1 -bf 0 -g 30 -x264-params aud=1:repeat-headers=1 \
  -pix_fmt yuv420p -f h264 -y investigation/probes/fixtures/sample-h264-720p.annexb
python3 -B investigation/probes/fixtures/prepare-h264.py
```

The preparation script separates access units at AUD NALs and embeds them in JS.
It also derives `h264-nals.js` from the included `sample-h264.annexb`. The tiny
sample came from a 64×64 blue, 5 fps baseline MP4; an equivalent source is:

```sh
ffmpeg -f lavfi -i color=c=blue:s=64x64:r=5 -frames:v 1 \
  -c:v libx264 -profile:v baseline -bf 0 -g 1 -pix_fmt yuv420p \
  -y investigation/probes/fixtures/sample-h264.mp4
ffmpeg -i investigation/probes/fixtures/sample-h264.mp4 -c:v copy \
  -bsf:v h264_mp4toannexb -f h264 \
  -y investigation/probes/fixtures/sample-h264.annexb
```

The moving fixture and its 24 sampled NV12 reference positions per picture:

```sh
ffmpeg -f lavfi -i testsrc2=s=1280x720:r=30 -frames:v 30 \
  -c:v libx264 -profile:v baseline -preset veryfast -tune zerolatency \
  -crf 35 -threads 1 -bf 0 -g 30 -x264-params aud=1:repeat-headers=1 \
  -pix_fmt yuv420p -f h264 -y investigation/probes/fixtures/sample-h264-motion-720p.annexb
python3 -B investigation/probes/fixtures/prepare-h264.py
```

The preparation script requires FFmpeg when this optional motion file is present.
The encoded sample is 148,419 bytes in this run, about 1.19 Mbit for one second;
it does not represent a high-bitrate Sunshine workload.

Decoded NV12 reference values are Y=41, U=240, V=110 for these fixtures. The 64×64
reference has 4,096 luma bytes and 1,024 bytes each of U/V. The native probe checks
the entire tiny frame histogram; the 720p probe checks selected positions in
every returned picture rather than copying each complete frame into JS.

Other included fixtures exercise failing web video source paths and successful
native Opus decoding. `streaming-samples.js` embeds the MP4, H.264, VP8 WebM,
VP8+Vorbis WebM and WAV files; `opus-packets.js` embeds three 20 ms stereo 48 kHz
packets from `sample-opus.ogg`. They are diagnostic assets, not application bundles.
