"""Checked build-copy adaptation for direct, owned packet reception."""
import hashlib

SOURCE_SHA256 = '377a1eda8dfa7ac68b31ae0899dda83be016f7d1df6e2c5245bcc7751c9dfbda'

def specialize(source, expected_hash=SOURCE_SHA256):
    if hashlib.sha256(source.encode()).hexdigest()!=expected_hash:
        raise ValueError('Pinned VideoStream.c changed; review batch ownership')
    begin=source.index('        if (buffer == NULL) {')
    end=source.index('        if (err < 0) {',begin)
    original=source[begin:end]
    source=source[:begin]+'''        if (!encrypted && ml_video_batch_enabled()) {
            err = ml_video_batch_receive(rtpSocket, &buffer, bufferSize, receiveSize, useSelect);
        } else {
'''+original+'        }\n\n'+source[end:]
    marker='    if (buffer != NULL) {\n        free(buffer);'
    if source.count(marker)!=1:raise ValueError('Video cleanup shape changed')
    source=source.replace(marker,'    ml_video_batch_reset();\n'+marker)
    packet='        packet = (PRTP_PACKET)&buffer[0];'
    if source.count(packet)!=1:raise ValueError('Packet header shape changed')
    source=source.replace(packet,'''        if ((uintptr_t)buffer & 3) {
            Limelog("Unaligned owned video packet\\n");
            ListenerCallbacks.connectionTerminated(-1);
            break;
        }
        packet = (PRTP_PACKET)__builtin_assume_aligned(buffer, 4);''')

    return '''#include <stdbool.h>
extern int ml_video_batch_enabled(void);
extern int ml_video_batch_receive(int, char**, int, int, bool);
extern void ml_video_batch_reset(void);
'''+source
