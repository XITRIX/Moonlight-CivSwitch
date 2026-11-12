/**
 * AV1 low-overhead OBU scanning (AV1 spec 5.3): the OBUs of a temporal unit, its sequence header
 * and whether its frame is a key frame. The pipe reader in h264-stream.js is codec neutral.
 */

const OBU = {
  SEQUENCE_HEADER: 1,
  TEMPORAL_DELIMITER: 2,
  FRAME_HEADER: 3,
  TILE_GROUP: 4,
  METADATA: 5,
  FRAME: 6,
  REDUNDANT_FRAME_HEADER: 7,
  TILE_LIST: 8,
  PADDING: 15
};
const KEY_FRAME = 0;
const FORBIDDEN_BIT = 0x80;
const TYPE_SHIFT = 3;
const TYPE_MASK = 0xf;
const EXTENSION_BIT = 0x04;
const SIZE_BIT = 0x02;
const LEB128_BYTES = 8;

/** MSB-first bit reader over one OBU payload (AV1 spec 4.10.2 f(n)). */
class Bits {
  /** @param {Uint8Array} bytes */
  constructor(bytes) {
    this.bytes = bytes;
    this.position = 0;
  }

  /** @param {number} count at most 32 */
  read(count) {
    let value = 0;
    for (let bit = 0; bit < count; bit++) {
      const byte = this.position >> 3;
      if (byte >= this.bytes.length) throw Error('Truncated AV1 OBU payload');

      const set = (this.bytes[byte] >> (7 - (this.position & 7))) & 1;
      value = value * 2 + set;
      this.position++;
    }
    return value;
  }

  flag() {
    return this.read(1) === 1;
  }

  /** uvlc() (AV1 spec 4.10.3); only skipped, so large values are fine as a float. */
  uvlc() {
    let zeros = 0;
    while (!this.flag()) {
      zeros++;
      if (zeros >= 32) throw Error('Invalid AV1 uvlc value');
    }
    return zeros ? this.read(zeros) + 2 ** zeros - 1 : 0;
  }
}

/**
 * leb128() at `offset` (AV1 spec 4.10.5).
 * @param {Uint8Array} bytes
 * @param {number} offset
 */
function leb128(bytes, offset) {
  let value = 0;
  for (let index = 0; index < LEB128_BYTES; index++) {
    if (offset + index >= bytes.length) throw Error('Truncated AV1 OBU size');

    const byte = bytes[offset + index];
    value += (byte & 0x7f) * 2 ** (index * 7);
    if (!(byte & 0x80)) return {value, length: index + 1};
  }
  throw Error('Invalid AV1 OBU size');
}

/**
 * @typedef {{type: number, temporalId: number, spatialId: number, offset: number, size: number,
 *   payload: Uint8Array}} Obu offset and size cover the whole OBU, header included
 */

/**
 * Splits low-overhead OBUs; an OBU without a size field runs to the end of `bytes`.
 * @param {Uint8Array} bytes
 * @returns {Obu[]}
 */
function obus(bytes) {
  /** @type {Obu[]} */
  const list = [];
  let offset = 0;
  while (offset < bytes.length) {
    const header = bytes[offset];
    if (header & FORBIDDEN_BIT) throw Error('Invalid AV1 OBU header');

    let at = offset + 1;
    let temporalId = 0;
    let spatialId = 0;
    if (header & EXTENSION_BIT) {
      if (at >= bytes.length) throw Error('Truncated AV1 OBU extension');
      temporalId = bytes[at] >> 5;
      spatialId = (bytes[at] >> 3) & 3;
      at++;
    }

    let payloadBytes = bytes.length - at;
    if (header & SIZE_BIT) {
      const size = leb128(bytes, at);
      at += size.length;
      payloadBytes = size.value;
    }
    if (at + payloadBytes > bytes.length) throw Error('AV1 OBU overruns its temporal unit');

    const type = (header >> TYPE_SHIFT) & TYPE_MASK;
    list.push({type, temporalId, spatialId, offset, size: at + payloadBytes - offset,
      payload: bytes.subarray(at, at + payloadBytes)});
    offset = at + payloadBytes;
  }
  return list;
}

/**
 * The sequence-header fields a frame header's size depends on (AV1 spec 5.9.2).
 * @typedef {{frameWidthBits: number, frameHeightBits: number, frameIdBits: number,
 *   screenContent: number, integerMv: number, orderHintBits: number, superres: boolean,
 *   decoderModel: boolean, equalPictureInterval: boolean, presentationBits: number, removalBits: number,
 *   points: {idc: number, model: boolean}[]}} FrameHeaderFields
 */

/**
 * `width` and `height` are max_frame_width/height; a frame header may code a smaller size.
 * @typedef {{profile: number, reducedStillPicture: boolean, width: number, height: number,
 *   highBitDepth: boolean, monochrome: boolean, fields: FrameHeaderFields}} SequenceHeader
 */

const NO_TIMING = {decoderModel: false, equalPictureInterval: false, bufferDelayBits: 0, removalBits: 0,
  presentationBits: 0};

/**
 * timing_info() and decoder_model_info() of the sequence header (AV1 spec 5.5.3, 5.5.4).
 * @param {Bits} bits
 */
function readTiming(bits) {
  if (!bits.flag()) return NO_TIMING;

  bits.read(32);
  bits.read(32);
  const equalPictureInterval = bits.flag();
  if (equalPictureInterval) bits.uvlc();
  if (!bits.flag()) return {...NO_TIMING, equalPictureInterval};

  const bufferDelayBits = bits.read(5) + 1;
  bits.read(32);
  const removalBits = bits.read(5) + 1;
  const presentationBits = bits.read(5) + 1;
  return {decoderModel: true, equalPictureInterval, bufferDelayBits, removalBits, presentationBits};
}

/**
 * The operating points of the sequence header (AV1 spec 5.5.1).
 * @param {Bits} bits
 * @param {{decoderModel: boolean, bufferDelayBits: number}} timing
 */
function readOperatingPoints(bits, timing) {
  const initialDisplayDelay = bits.flag();
  const count = bits.read(5) + 1;
  /** @type {{idc: number, model: boolean}[]} */
  const points = [];
  for (let point = 0; point < count; point++) {
    const idc = bits.read(12);
    const level = bits.read(5);
    if (level > 7) bits.read(1);
    const model = timing.decoderModel && bits.flag();
    if (model) {
      bits.read(timing.bufferDelayBits);
      bits.read(timing.bufferDelayBits);
      bits.read(1);
    }
    if (initialDisplayDelay && bits.flag()) bits.read(4);
    points.push({idc, model});
  }
  return points;
}

/**
 * The tool flags between the frame size and color_config() (AV1 spec 5.5.1).
 * @param {Bits} bits
 * @param {boolean} reduced
 */
function readToolFlags(bits, reduced) {
  let frameIdBits = 0;
  if (!reduced && bits.flag()) {
    const delta = bits.read(4) + 2;
    frameIdBits = bits.read(3) + 1 + delta;
  }
  bits.read(3);
  if (reduced) return {frameIdBits, screenContent: 2, integerMv: 2, orderHintBits: 0};

  bits.read(4);
  const orderHint = bits.flag();
  if (orderHint) bits.read(2);
  const screenContent = bits.flag() ? 2 : bits.read(1);
  let integerMv = 2;
  if (screenContent > 0 && !bits.flag()) integerMv = bits.read(1);
  const orderHintBits = orderHint ? bits.read(3) + 1 : 0;
  return {frameIdBits, screenContent, integerMv, orderHintBits};
}

/**
 * sequence_header_obu() up to the start of color_config() (AV1 spec 5.5).
 * @param {Uint8Array} payload
 * @returns {SequenceHeader}
 */
function sequenceHeader(payload) {
  const bits = new Bits(payload);
  const profile = bits.read(3);
  bits.read(1);
  const reducedStillPicture = bits.flag();
  let timing = NO_TIMING;
  /** @type {{idc: number, model: boolean}[]} */
  let points = [{idc: 0, model: false}];
  if (reducedStillPicture) {
    bits.read(5);
  } else {
    timing = readTiming(bits);
    points = readOperatingPoints(bits, timing);
  }

  const frameWidthBits = bits.read(4) + 1;
  const frameHeightBits = bits.read(4) + 1;
  const width = bits.read(frameWidthBits) + 1;
  const height = bits.read(frameHeightBits) + 1;
  const tools = readToolFlags(bits, reducedStillPicture);
  const superres = bits.flag();
  bits.read(2);

  const highBitDepth = bits.flag();
  if (profile === 2 && highBitDepth) bits.read(1);
  const monochrome = profile === 1 ? false : bits.flag();
  const fields = {frameWidthBits, frameHeightBits, ...tools, superres, decoderModel: timing.decoderModel,
    equalPictureInterval: timing.equalPictureInterval, presentationBits: timing.presentationBits,
    removalBits: timing.removalBits, points};
  return {profile, reducedStillPicture, width, height, highBitDepth, monochrome, fields};
}

/**
 * @typedef {{frameWidth: number, frameHeight: number, upscaledWidth: number, renderWidth: number,
 *   renderHeight: number, superresDenominator: number}} FrameSize the decoder outputs upscaledWidth x
 *   frameHeight; render is the size to display
 */

const FRAME_TYPE = {KEY: 0, INTER: 1, INTRA_ONLY: 2, SWITCH: 3};
const SUPERRES_NUMERATOR = 8;

/**
 * The size of an intra frame from uncompressed_header() up to render_size() (AV1 spec 5.9.2, 5.9.5,
 * 5.9.6, 5.9.8). Inter frames and show_existing_frame return undefined.
 * @param {Uint8Array} payload a frame header or frame OBU payload
 * @param {SequenceHeader} sequence
 * @param {{temporalId: number, spatialId: number}} layer the OBU's extension ids
 * @returns {FrameSize | undefined}
 */
function frameSize(payload, sequence, layer) {
  const bits = new Bits(payload);
  const fields = sequence.fields;
  let frameType = FRAME_TYPE.KEY;
  let showFrame = true;
  if (!sequence.reducedStillPicture) {
    if (bits.flag()) return undefined;
    frameType = bits.read(2);
    showFrame = bits.flag();
    if (showFrame && fields.decoderModel && !fields.equalPictureInterval) bits.read(fields.presentationBits);
    if (!showFrame) bits.read(1);
    const resilientByRule = frameType === FRAME_TYPE.SWITCH || (frameType === FRAME_TYPE.KEY && showFrame);
    if (!resilientByRule) bits.read(1);
  }
  const intra = frameType === FRAME_TYPE.KEY || frameType === FRAME_TYPE.INTRA_ONLY;
  if (!intra) return undefined;

  bits.read(1);
  const screenContent = fields.screenContent === 2 ? bits.read(1) : fields.screenContent;
  if (screenContent && fields.integerMv === 2) bits.read(1);
  if (fields.frameIdBits) bits.read(fields.frameIdBits);
  const sizeOverride = sequence.reducedStillPicture ? false : bits.flag();
  bits.read(fields.orderHintBits);
  skipRemovalTimes(bits, fields, layer);
  if (!(frameType === FRAME_TYPE.KEY && showFrame)) bits.read(8);

  let upscaledWidth = sequence.width;
  let frameHeight = sequence.height;
  if (sizeOverride) {
    upscaledWidth = bits.read(fields.frameWidthBits) + 1;
    frameHeight = bits.read(fields.frameHeightBits) + 1;
  }
  let superresDenominator = SUPERRES_NUMERATOR;
  if (fields.superres && bits.flag()) superresDenominator = bits.read(3) + 9;
  const frameWidth = Math.floor((upscaledWidth * SUPERRES_NUMERATOR + superresDenominator / 2) / superresDenominator);

  const renderDiffers = bits.flag();
  const renderWidth = renderDiffers ? bits.read(16) + 1 : upscaledWidth;
  const renderHeight = renderDiffers ? bits.read(16) + 1 : frameHeight;
  return {frameWidth, frameHeight, upscaledWidth, renderWidth, renderHeight, superresDenominator};
}

/**
 * buffer_removal_time of each operating point the frame belongs to (AV1 spec 5.9.2).
 * @param {Bits} bits
 * @param {FrameHeaderFields} fields
 * @param {{temporalId: number, spatialId: number}} layer
 */
function skipRemovalTimes(bits, fields, layer) {
  if (!fields.decoderModel || !bits.flag()) return;

  for (const point of fields.points) {
    if (!point.model) continue;
    const temporal = (point.idc >> layer.temporalId) & 1;
    const spatial = (point.idc >> (layer.spatialId + 8)) & 1;
    if (point.idc === 0 || (temporal && spatial)) bits.read(fields.removalBits);
  }
}

/**
 * Whether a frame header starts a key frame: show_existing_frame 0 and frame_type KEY_FRAME, or
 * any frame under a reduced still-picture header (AV1 spec 5.9.2).
 * @param {Uint8Array} payload
 * @param {SequenceHeader | undefined} sequence
 */
function isKeyFrameHeader(payload, sequence) {
  if (sequence?.reducedStillPicture) return true;

  const bits = new Bits(payload);
  if (bits.flag()) return false;
  return bits.read(2) === KEY_FRAME;
}

/**
 * The sequence header of a temporal unit, whether its first frame header starts a key frame, that
 * frame's size when it is an intra frame and how many frame headers the unit holds. A unit's own
 * sequence header decides how its frame header reads; `previous` stands in when the unit has none.
 * @param {Uint8Array} bytes
 * @param {SequenceHeader} [previous]
 * @returns {{sequence?: SequenceHeader, keyframe: boolean, size?: FrameSize, frames: number,
 *   delimiter: boolean}}
 */
function scanTemporalUnit(bytes, previous = undefined) {
  /** @type {SequenceHeader | undefined} */
  let sequence;
  let keyframe = false;
  /** @type {FrameSize | undefined} */
  let size;
  let frames = 0;
  let delimiter = false;
  for (const obu of obus(bytes)) {
    if (obu.type === OBU.TEMPORAL_DELIMITER) delimiter = true;
    if (obu.type === OBU.SEQUENCE_HEADER) sequence = sequenceHeader(obu.payload);

    const frameHeader = obu.type === OBU.FRAME_HEADER || obu.type === OBU.FRAME;
    if (!frameHeader) continue;

    const governing = sequence ?? previous;
    if (!frames) {
      keyframe = isKeyFrameHeader(obu.payload, governing);
      if (governing) size = frameSize(obu.payload, governing, obu);
    }
    frames++;
  }
  return {sequence, keyframe, size, frames, delimiter};
}

/**
 * Splits a low-overhead OBU stream into temporal units at its temporal delimiters.
 * @param {Uint8Array} data
 * @returns {Buffer[]}
 */
function temporalUnits(data) {
  /** @type {Buffer[]} */
  const units = [];
  let start = -1;
  for (const obu of obus(data)) {
    if (obu.type !== OBU.TEMPORAL_DELIMITER) continue;
    if (start >= 0) units.push(Buffer.from(data.subarray(start, obu.offset)));
    start = obu.offset;
  }

  if (start < 0) throw Error('No AV1 temporal delimiter in input');
  units.push(Buffer.from(data.subarray(start)));
  return units;
}

/**
 * Whether a sequence header is AV1 Main 8-bit 4:2:0, the profile the console decoder opens.
 * @param {SequenceHeader} sequence
 */
function isMain8(sequence) {
  return sequence.profile === 0 && !sequence.highBitDepth && !sequence.monochrome;
}

/** How far an encoder may align a coded frame dimension up past the requested one. */
const CODED_ALIGNMENT = 64;

/** @param {{width: number, height: number}} size */
const text = size => size.width + 'x' + size.height;

/**
 * The sizes a stream start declares, for the log: the sequence maximum and the intra frame's coded,
 * upscaled and render sizes.
 * @param {SequenceHeader} sequence
 * @param {FrameSize | undefined} size
 */
function streamSizes(sequence, size) {
  const maximum = {width: sequence.width, height: sequence.height};
  if (!size) return {maximum};

  return {maximum, frame: {width: size.upscaledWidth, height: size.frameHeight},
    coded: {width: size.frameWidth, height: size.frameHeight},
    render: {width: size.renderWidth, height: size.renderHeight}, superres: size.superresDenominator};
}

/**
 * The frame size the decoder opens with and its surfaces hold, for a requested stream size. An
 * encoder may code each dimension aligned up (AMD's VAAPI codes 1080 lines as 1082) and signal the
 * requested size as the render size, or not at all; presenting crops the frame to the request.
 * Anything else throws with every size named.
 * @param {{width: number, height: number}} requested
 * @param {SequenceHeader} sequence
 * @param {FrameSize | undefined} size the first unit's intra frame
 */
function decodedSize(requested, sequence, size) {
  const refuse = () => {
    const sizes = streamSizes(sequence, size);
    const parts = ['requested ' + text(requested), 'sequence max ' + text(sizes.maximum)];
    if (sizes.frame && sizes.render) parts.push('frame ' + text(sizes.frame), 'render ' + text(sizes.render),
      'superres ' + sizes.superres + '/' + SUPERRES_NUMERATOR);
    return Error('Sunshine sent AV1 at another size: ' + parts.join(', '));
  };
  if (!size || size.superresDenominator !== SUPERRES_NUMERATOR) throw refuse();

  const frame = {width: size.upscaledWidth, height: size.frameHeight};
  const withinMaximum = frame.width <= sequence.width && frame.height <= sequence.height;
  const renderAsked = size.renderWidth === requested.width && size.renderHeight === requested.height;
  const renderUnsignaled = size.renderWidth === frame.width && size.renderHeight === frame.height;
  if (!withinMaximum || !(renderAsked || renderUnsignaled)) throw refuse();

  /** @param {number} coded @param {number} wanted */
  const alignedUp = (coded, wanted) => coded >= wanted && coded < wanted + CODED_ALIGNMENT && coded % 2 === 0;
  if (!alignedUp(frame.width, requested.width) || !alignedUp(frame.height, requested.height)) throw refuse();
  return frame;
}

/**
 * @template {{data: Buffer, keyframe: boolean}} T
 * @typedef {{next(): Promise<{value?: T, done?: boolean}>}} UnitSource
 */

/**
 * Wraps a source of AV1 temporal units so each unit's keyframe comes from its own OBUs, not the
 * host's frame type: a key frame under a known sequence header. Each unit also carries the
 * sequence header it holds and its intra frame's size, if any.
 * @template {{data: Buffer, keyframe: boolean}} T
 * @param {UnitSource<T>} source
 * @returns {UnitSource<T & {sequence?: SequenceHeader, size?: FrameSize}>}
 */
function obuKeyframes(source) {
  /** @type {SequenceHeader | undefined} */
  let current;
  return {
    async next() {
      const result = await source.next();
      if (result.done || !result.value) return result;

      const scan = scanTemporalUnit(result.value.data, current);
      current = scan.sequence ?? current;
      const keyframe = scan.keyframe && current !== undefined;
      return {...result, value: Object.assign(result.value, {keyframe, sequence: scan.sequence, size: scan.size})};
    }
  };
}

export {OBU, decodedSize, frameSize, isMain8, obuKeyframes, obus, scanTemporalUnit, sequenceHeader, streamSizes,
  temporalUnits};
