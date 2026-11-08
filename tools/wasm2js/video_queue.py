"""Apply a checked receive-queue optimization to a build copy of pinned upstream.

The upstream checkout stays untouched. A packet above the highest received
sequence cannot be a duplicate or out of order in the current bounded FEC
window. Keep nextContiguousSequenceNumber unchanged after a hole, and use
upstream's scan for reordered, duplicate, and locally recovered packets.
"""

SOURCE_SHA256 = '4399b84d71dae1c9e9133a4f23badec065acde569479c3be40db263498dfa32d'

ANCHOR = '''        outOfSequence = false;
    }
    else {
        outOfSequence = false;

        // Check for duplicates'''
REPLACEMENT = '''        outOfSequence = false;
    }
    else if (!isFecRecovery && queue->pendingFecBlockList.count != 0 &&
             isBefore16(queue->receivedHighestSequenceNumber, packet->sequenceNumber)) {
        /* Already bounded to this FEC window by RtpvAddPacket. A new highest
           sequence cannot duplicate any received packet. Keep the hole state. */
        queue->useFastQueuePath = false;
        outOfSequence = false;
    }
    else {
        outOfSequence = false;

        // Check for duplicates'''


def specialize(source):
    if REPLACEMENT in source or source.count(ANCHOR) != 1:
        raise ValueError('Pinned video queue shape changed; review before building')
    return source.replace(ANCHOR, REPLACEMENT)


def fixture(source):
    """Exercise the exact original and changed queuePacket bodies side by side."""
    begin = source.index('static bool queuePacket(')
    end = source.index('\n#define PACKET_RECOVERY_FAILURE', begin)
    body = source[begin:end]
    # Timestamp conversion has a separate 20k-case actual-artifact fixture.
    # Avoid duplicating its compiler specialization sites in these diagnostics.
    body = body.replace('((uint64_t)packet->timestamp * 1000) / PTS_DIVISOR',
                        '(uint64_t)packet->timestamp')
    append_begin = source.index('static void insertEntryIntoList(')
    append_end = source.index('static void removeEntryFromList(', append_begin)
    return ('#include "Limelight-internal.h"\n'
            '#define SPECULATIVE_RFI_COOLDOWN_PERIOD_US 300000000\n' +
            source[append_begin:append_end] +
            body.replace('queuePacket(', 'referenceQueuePacket(') +
            specialize(body).replace('queuePacket(', 'optimizedQueuePacket('))
