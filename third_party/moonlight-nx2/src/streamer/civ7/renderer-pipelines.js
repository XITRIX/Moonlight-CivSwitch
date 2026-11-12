// The civ7 renderer's buffers, texel views, descriptor set, pipelines and command buffers per
// frame slot and swapchain image, built in five call plans from pipelines.js building blocks;
// src/renderer/civ7/README.md has the design.
import crypto from 'node:crypto';
import {TYPE, DESTROY, SCOPE, TRANSITIONS, CLEAR_COLOR, PRIVATE_MEMORY_PREFERENCE, MEMORY_HOST_COHERENT_VISIBLE,
  DEVICE_PROPERTIES_BYTES, DEVICE_IDENTITY, MEMORY_PROPERTIES_BYTES, MEMORY_REQUIREMENTS_BYTES,
  struct, u32s, workArea, planRecorder, planRunner, chooseMemory, queryMemoryProperties, bindStorageMemory,
  createShaderModule, shaderStage, openCache, cacheSeed, saveCache, releaseCache, cleanupOrder} from './pipelines.js';
import {INPUT_BYTES, STORAGE_BYTES, UI_INSTANCES, BADGE_INSTANCE, WIDTH, HEIGHT, FRAMES_OFFSET, FRAME_BYTES,
  VIDEO_SLOTS} from '../../renderer/civ7/layout.js';
import {displaySize} from './display.js';

/** @import {Civ7Rpc} from './transport.js' */
/** @import {Created, Display, PlanRecorder} from './pipelines.js' */

const MAX_SWAPCHAIN_IMAGES = 8;
const WORK_BYTES = 0x8000;
const STAGING_ALIGN = 0x10000;
const SHADER_ALIGN = 0x100;
const POINTER_BYTES = 8;
const CACHE_KEY_VERSION = 'moonlight-civ7-pipelines/2';
const SHADER_ENTRY = 'main\0';

const SHADER_STAGE_VERTEX = 0x1;
const SHADER_STAGE_FRAGMENT = 0x10;
const SHADER_STAGE_COMPUTE = 0x20;
const SHADER_STAGES_ALL = SHADER_STAGE_VERTEX | SHADER_STAGE_FRAGMENT | SHADER_STAGE_COMPUTE;

const BUFFER_USAGE_UNIFORM_TEXEL = 0x4;
const BUFFER_USAGE_STORAGE = 0x20;
const DESCRIPTOR_UNIFORM_TEXEL_BUFFER = 4;
const DESCRIPTOR_STORAGE_BUFFER = 7;
const STORAGE_BINDINGS = 2;
const TEXEL_BINDINGS = 2;
const FORMAT_R8_UNORM = 9;
const FORMAT_R8G8_UNORM = 16;
const IMAGE_2D = 1;
const TILING_LINEAR = 1;
const IMAGE_USAGE_SAMPLED = 0x4;
const STRUCTURE = {fenceCreateInfo: 8, bufferViewCreateInfo: 13, imageCreateInfo: 14};
const LIMITS = {maxTexelBufferElements: 316, minTexelBufferOffsetAlignment: 608};
const LIMITS_BYTES = LIMITS.minTexelBufferOffsetAlignment + 8 - LIMITS.maxTexelBufferElements;
const SUBRESOURCE_LAYOUT_BYTES = 40;
const TOPOLOGY_TRIANGLE_LIST = 3;
const COLOR_WRITE_RGBA = 0xf;
const BLEND_ONE = 1;
const BLEND_SOURCE_ALPHA = 6;
const BLEND_ONE_MINUS_SOURCE_ALPHA = 7;
const FORMAT_R8G8B8A8_UNORM = 37;
const IMAGE_VIEW_2D = 1;
const ASPECT_COLOR = 1;
const LOAD_OP_CLEAR = 1;
const LAYOUT_COLOR_ATTACHMENT = 2;
const BIND_POINT_GRAPHICS = 0;
const BIND_POINT_COMPUTE = 1;
const COMMAND_BUFFER_PRIMARY = 0;
const QUEUE_FAMILY_IGNORED = 0xffffffff;
const NO_BASE_PIPELINE = 0xffffffff;
const VIDEO_VERTICES = 3;
const QUAD_VERTICES = 6;

/** Stage name to its slot in the shader handle list; creation follows this order. */
const SHADERS = ['publish', 'videoVertex', 'videoFragment', 'videoStorageFragment', 'uiVertex', 'uiFragment'];

/**
 * The linear images a zero-copy sampled path would bind at a slot: 1080p luma and chroma at
 * the decoder's 1920-byte stride. H.264 puts chroma after 1088 rows, AV1 after 1082.
 */
const LINEAR_PROBE = {luma: {format: FORMAT_R8_UNORM, width: 1920, height: 1088},
  chroma: {format: FORMAT_R8G8_UNORM, width: 960, height: 544}, stride: 1920, chromaRows: [1088, 1082]};

/**
 * @typedef {object} LoadedRenderer What src/renderer/civ7/bundle.js loadRenderer returns.
 * @property {{contract: object}} manifest
 * @property {Record<string, Buffer>} shaders
 * @property {string} fingerprint
 */

const hex = (/** @type {number | bigint | string} */ value) => '0x' + BigInt(value).toString(16);

/**
 * @param {ReturnType<typeof workArea>} area
 * @param {number} imageCount
 */
function handleTable(area, imageCount) {
  const start = area.reserve(0);
  const one = () => area.reserve(POINTER_BYTES);
  const list = (/** @type {number} */ count) => {
    const at = area.reserve(count * POINTER_BYTES);
    return Array.from({length: count}, (_, index) => at + index * POINTER_BYTES);
  };
  const table = {
    count: one(), physical: one(),
    inputBuffer: one(), inputMemory: one(), inputMapped: one(),
    storageBuffer: one(), storageMemory: one(), storageMapped: one(),
    images: list(MAX_SWAPCHAIN_IMAGES), acquired: list(VIDEO_SLOTS), fences: list(VIDEO_SLOTS),
    views: list(imageCount), semaphores: list(imageCount), pool: one(),
    lumaProbe: one(), chromaProbe: one(), lumaView: one(), chromaView: one(),
    setLayout: one(), layout: one(), descriptorPool: one(), descriptor: one(), cache: one(),
    shaders: list(SHADERS.length), compute: one(), video: one(), ui: one(),
    interactive: list(VIDEO_SLOTS * imageCount), streaming: list(VIDEO_SLOTS * imageCount)
  };
  return {...table, start, bytes: area.reserve(0) - start};
}

/**
 * Plan 1: memory and device properties, both buffers and their requirements.
 * @param {ReturnType<typeof workArea>} area
 * @param {ReturnType<typeof handleTable>} table
 * @param {Display} display
 * @param {{properties: number, device: number, input: number, storage: number}} query
 */
function buffersPlan(area, table, display, query) {
  const plan = planRecorder(area);
  plan.put(table.start, Buffer.alloc(table.bytes));
  queryMemoryProperties(plan, table, display, query.properties);
  plan.call('vkGetPhysicalDeviceProperties', [plan.slot(table.physical), query.device]);

  const buffers = [['input', INPUT_BYTES, BUFFER_USAGE_STORAGE, table.inputBuffer, query.input],
    ['storage', STORAGE_BYTES, BUFFER_USAGE_STORAGE | BUFFER_USAGE_UNIFORM_TEXEL, table.storageBuffer, query.storage]];
  for (const [label, bytes, usage, buffer, requirements] of
    /** @type {[string, number, number, number, number][]} */ (buffers)) {
    const info = plan.struct(struct(56, TYPE.bufferCreateInfo, {32: usage}, {24: bytes}));
    plan.create('buffer', label, 'vkCreateBuffer', [display.device, info, 0, buffer], buffer);
    plan.call('vkGetBufferMemoryRequirements', [display.device, plan.slot(buffer), requirements]);
  }
  return plan;
}

/**
 * The linear-image check: two unbound linear images, their row pitch and alignment. They
 * stay with the app stage and the ledger destroys them.
 * @param {ReturnType<typeof workArea>} area
 * @param {ReturnType<typeof handleTable>} table
 * @param {Display} display
 * @param {{luma: {layout: number, requirements: number}, chroma: {layout: number, requirements: number}}} query
 */
function linearProbePlan(area, table, display, query) {
  const plan = planRecorder(area);
  const subresource = plan.struct(u32s(ASPECT_COLOR, 0, 0));
  for (const plane of /** @type {const} */ (['luma', 'chroma'])) {
    const {format, width, height} = LINEAR_PROBE[plane];
    const out = plane === 'luma' ? table.lumaProbe : table.chromaProbe;
    const info = plan.struct(struct(88, STRUCTURE.imageCreateInfo,
      {20: IMAGE_2D, 24: format, 28: width, 32: height, 36: 1, 40: 1, 44: 1, 48: 1, 52: TILING_LINEAR,
        56: IMAGE_USAGE_SAMPLED}));
    plan.create('image', plane + 'Probe', 'vkCreateImage', [display.device, info, 0, out], out);
    plan.call('vkGetImageSubresourceLayout', [display.device, plan.slot(out), subresource, query[plane].layout]);
    plan.call('vkGetImageMemoryRequirements', [display.device, plan.slot(out), query[plane].requirements]);
  }
  return plan;
}

/**
 * Which video fragment shader samples the slots, and whether linear images would fit them.
 * Texel buffers sample any stride and are the default; the storage-buffer sampler is the
 * fallback when the texel limits do not cover both slots.
 * @param {Buffer} limits the device limits from maxTexelBufferElements to minTexelBufferOffsetAlignment
 * @param {{luma: Buffer, chroma: Buffer} | {error: string}} probe
 */
export function videoPath(limits, probe) {
  const elements = limits.readUInt32LE(0);
  const alignment = Number(limits.readBigUInt64LE(LIMITS.minTexelBufferOffsetAlignment - LIMITS.maxTexelBufferElements));
  const rangeOk = elements >= VIDEO_SLOTS * FRAME_BYTES;
  const offsetOk = alignment > 0 && FRAMES_OFFSET % alignment === 0;
  const texel = {maxTexelBufferElements: elements, minTexelBufferOffsetAlignment: alignment};
  const linear = linearFit(probe);

  /** @type {'texel-buffer' | 'storage-buffer'} */
  let path = 'storage-buffer';
  if (!rangeOk || !offsetOk) {
    const reason = !rangeOk ? 'texel buffer limit below both slots' : 'frames offset misses the texel alignment';
    return {path, reason, texel, linear};
  }
  const reason = linear.fits.length
    ? 'linear images fit only ' + linear.fits.join(', ') + '; texel buffers sample every stride'
    : 'linear images do not fit the decoder layout';
  path = 'texel-buffer';
  return {path, reason, texel, linear};
}

/** @param {{luma: Buffer, chroma: Buffer} | {error: string}} probe */
function linearFit(probe) {
  if ('error' in probe) return {fits: [], error: probe.error};

  const pitch = (/** @type {Buffer} */ layout) => Number(layout.readBigUInt64LE(16));
  const alignment = (/** @type {Buffer} */ requirements) => Number(requirements.readBigUInt64LE(8));
  const lumaPitch = pitch(probe.luma.subarray(0, SUBRESOURCE_LAYOUT_BYTES));
  const chromaPitch = pitch(probe.chroma.subarray(0, SUBRESOURCE_LAYOUT_BYTES));
  const align = Math.max(alignment(probe.luma.subarray(SUBRESOURCE_LAYOUT_BYTES)),
    alignment(probe.chroma.subarray(SUBRESOURCE_LAYOUT_BYTES)));
  const pitchOk = lumaPitch === LINEAR_PROBE.stride && chromaPitch === LINEAR_PROBE.stride;
  const slotsOk = align > 0 && FRAMES_OFFSET % align === 0 && FRAME_BYTES % align === 0;
  const fits = LINEAR_PROBE.chromaRows
    .filter(rows => pitchOk && slotsOk && (LINEAR_PROBE.stride * rows) % align === 0)
    .map(rows => '1920x' + rows);
  return {fits, lumaPitch, chromaPitch, alignment: align};
}

/**
 * Swapchain image views, semaphores and the command pool.
 * @param {PlanRecorder} plan
 * @param {ReturnType<typeof handleTable>} table
 * @param {Display} display
 */
function createTargets(plan, table, display) {
  const imagesChanged = 'Swapchain image count changed';
  plan.ok('vkGetSwapchainImagesKHR', [display.device, display.swapchain, table.count, 0]);
  plan.check(plan.word(table.count), {equals: display.imageCount}, imagesChanged);
  plan.ok('vkGetSwapchainImagesKHR', [display.device, display.swapchain, table.count, table.images[0]]);
  plan.check(plan.word(table.count), {equals: display.imageCount}, imagesChanged);

  const semaphore = plan.struct(struct(24, TYPE.semaphoreCreateInfo));
  const fence = plan.struct(struct(24, STRUCTURE.fenceCreateInfo));
  for (let slot = 0; slot < VIDEO_SLOTS; slot++) {
    const suffix = slot ? String(slot) : '';
    plan.create('semaphore', 'acquired' + suffix, 'vkCreateSemaphore',
      [display.device, semaphore, 0, table.acquired[slot]], table.acquired[slot]);
    plan.create('fence', 'slot' + slot, 'vkCreateFence', [display.device, fence, 0, table.fences[slot]], table.fences[slot]);
  }
  const view = plan.struct(struct(80, TYPE.imageViewCreateInfo,
    {32: IMAGE_VIEW_2D, 36: FORMAT_R8G8B8A8_UNORM, 56: ASPECT_COLOR, 64: 1, 72: 1}));
  for (let index = 0; index < display.imageCount; index++) {
    plan.copy(plan.slot(table.images[index]), view + 24);
    plan.create('imageView', 'view' + index, 'vkCreateImageView',
      [display.device, view, 0, table.views[index]], table.views[index]);
    plan.create('semaphore', 'rendered' + index, 'vkCreateSemaphore',
      [display.device, semaphore, 0, table.semaphores[index]], table.semaphores[index]);
  }

  const pool = plan.struct(struct(24, TYPE.commandPoolCreateInfo, {20: display.queueFamily}));
  plan.create('commandPool', 'commands', 'vkCreateCommandPool', [display.device, pool, 0, table.pool], table.pool);
}

/**
 * R8 luma and R8G8 chroma texel views over both frame slots.
 * @param {PlanRecorder} plan
 * @param {ReturnType<typeof handleTable>} table
 * @param {Display} display
 */
function createTexelViews(plan, table, display) {
  const views = [['luma', FORMAT_R8_UNORM, table.lumaView], ['chroma', FORMAT_R8G8_UNORM, table.chromaView]];
  for (const [label, format, out] of /** @type {[string, number, number][]} */ (views)) {
    const info = plan.struct(struct(56, STRUCTURE.bufferViewCreateInfo, {32: format},
      {40: FRAMES_OFFSET, 48: VIDEO_SLOTS * FRAME_BYTES}));
    plan.copy(plan.slot(table.storageBuffer), info + 24);
    plan.create('bufferView', label, 'vkCreateBufferView', [display.device, info, 0, out], out);
  }
}

/**
 * The set: input and storage buffers for every stage, the two texel views for the fragment
 * stage. The views are written only on the texel path; the fallback shader never reads them.
 * @param {PlanRecorder} plan
 * @param {ReturnType<typeof handleTable>} table
 * @param {Display} display
 * @param {boolean} texel
 */
function createSet(plan, table, display, texel) {
  const bindings = Buffer.alloc((STORAGE_BINDINGS + TEXEL_BINDINGS) * 24);
  for (let binding = 0; binding < STORAGE_BINDINGS + TEXEL_BINDINGS; binding++) {
    const storage = binding < STORAGE_BINDINGS;
    bindings.writeUInt32LE(binding, binding * 24);
    bindings.writeUInt32LE(storage ? DESCRIPTOR_STORAGE_BUFFER : DESCRIPTOR_UNIFORM_TEXEL_BUFFER, binding * 24 + 4);
    bindings.writeUInt32LE(1, binding * 24 + 8);
    bindings.writeUInt32LE(storage ? SHADER_STAGES_ALL : SHADER_STAGE_FRAGMENT, binding * 24 + 12);
  }
  const setInfo = plan.struct(struct(32, TYPE.descriptorSetLayoutCreateInfo, {20: STORAGE_BINDINGS + TEXEL_BINDINGS},
    {24: plan.struct(bindings)}));
  plan.create('descriptorSetLayout', 'renderer', 'vkCreateDescriptorSetLayout',
    [display.device, setInfo, 0, table.setLayout], table.setLayout);

  const setLayouts = plan.struct(Buffer.alloc(POINTER_BYTES));
  plan.copy(plan.slot(table.setLayout), setLayouts);
  const layoutInfo = plan.struct(struct(48, TYPE.pipelineLayoutCreateInfo, {20: 1}, {24: setLayouts}));
  plan.create('pipelineLayout', 'renderer', 'vkCreatePipelineLayout',
    [display.device, layoutInfo, 0, table.layout], table.layout);

  const poolSizes = plan.struct(u32s(DESCRIPTOR_STORAGE_BUFFER, STORAGE_BINDINGS, DESCRIPTOR_UNIFORM_TEXEL_BUFFER,
    TEXEL_BINDINGS));
  const poolInfo = plan.struct(struct(40, TYPE.descriptorPoolCreateInfo, {20: 1, 24: 2}, {32: poolSizes}));
  plan.create('descriptorPool', 'renderer', 'vkCreateDescriptorPool',
    [display.device, poolInfo, 0, table.descriptorPool], table.descriptorPool);

  const allocateInfo = plan.struct(struct(40, TYPE.descriptorSetAllocateInfo, {24: 1}, {32: setLayouts}));
  plan.copy(plan.slot(table.descriptorPool), allocateInfo + 16);
  plan.create('descriptorSet', 'renderer', 'vkAllocateDescriptorSets',
    [display.device, allocateInfo, table.descriptor], table.descriptor);

  const bufferInfos = Buffer.alloc(STORAGE_BINDINGS * 24);
  bufferInfos.writeBigUInt64LE(BigInt(INPUT_BYTES), 16);
  bufferInfos.writeBigUInt64LE(BigInt(STORAGE_BYTES), 24 + 16);
  const infos = plan.struct(bufferInfos);
  plan.copy(plan.slot(table.inputBuffer), infos);
  plan.copy(plan.slot(table.storageBuffer), infos + 24);
  const storageWrite = struct(64, TYPE.writeDescriptorSet, {24: 0, 32: STORAGE_BINDINGS, 36: DESCRIPTOR_STORAGE_BUFFER},
    {48: infos});
  if (!texel) {
    const write = plan.struct(storageWrite);
    plan.copy(plan.slot(table.descriptor), write + 16);
    plan.call('vkUpdateDescriptorSets', [display.device, 1, write, 0, 0]);
    return;
  }

  const views = plan.struct(Buffer.alloc(TEXEL_BINDINGS * POINTER_BYTES));
  plan.copy(plan.slot(table.lumaView), views);
  plan.copy(plan.slot(table.chromaView), views + POINTER_BYTES);
  const texelWrite = struct(64, TYPE.writeDescriptorSet,
    {24: STORAGE_BINDINGS, 32: TEXEL_BINDINGS, 36: DESCRIPTOR_UNIFORM_TEXEL_BUFFER}, {56: views});
  const writes = plan.struct(Buffer.concat([storageWrite, texelWrite]));
  plan.copy(plan.slot(table.descriptor), writes + 16);
  plan.copy(plan.slot(table.descriptor), writes + 64 + 16);
  plan.call('vkUpdateDescriptorSets', [display.device, 2, writes, 0, 0]);
}

/**
 * The state both graphics pipelines share: no vertex input, triangle lists, no culling, one
 * RGBA8 dynamic-rendering attachment, the viewport over the whole layer.
 * @param {PlanRecorder} plan
 * @param {{width: number, height: number}} size
 */
function graphicsState(plan, size) {
  const vertexInput = plan.struct(struct(48, TYPE.pipelineVertexInputStateCreateInfo));
  const assembly = plan.struct(struct(32, TYPE.pipelineInputAssemblyStateCreateInfo, {20: TOPOLOGY_TRIANGLE_LIST}));
  const viewportBytes = Buffer.alloc(24);
  [0, 0, size.width, size.height, 0, 1].forEach((value, index) => viewportBytes.writeFloatLE(value, index * 4));
  const viewport = plan.struct(viewportBytes);
  const scissor = plan.struct(u32s(0, 0, size.width, size.height));
  const viewportState = plan.struct(struct(48, TYPE.pipelineViewportStateCreateInfo, {20: 1, 32: 1}, {24: viewport, 40: scissor}));
  const rasterBytes = struct(64, TYPE.pipelineRasterizationStateCreateInfo);
  rasterBytes.writeFloatLE(1, 56);
  const raster = plan.struct(rasterBytes);
  const multisample = plan.struct(struct(48, TYPE.pipelineMultisampleStateCreateInfo, {20: 1}));
  const format = plan.struct(u32s(FORMAT_R8G8B8A8_UNORM));
  const rendering = plan.struct(struct(40, TYPE.pipelineRenderingCreateInfo, {20: 1}, {24: format}));
  return {vertexInput, assembly, viewportState, raster, multisample, rendering};
}

/**
 * Opaque for the video, source-over (premultiplied alpha accumulation) for the UI quads.
 * @param {PlanRecorder} plan
 * @param {boolean} blended
 */
function colorBlend(plan, blended) {
  const attachment = blended
    ? u32s(1, BLEND_SOURCE_ALPHA, BLEND_ONE_MINUS_SOURCE_ALPHA, 0, BLEND_ONE, BLEND_ONE_MINUS_SOURCE_ALPHA, 0,
      COLOR_WRITE_RGBA)
    : u32s(0, 0, 0, 0, 0, 0, 0, COLOR_WRITE_RGBA);
  return plan.struct(struct(56, TYPE.pipelineColorBlendStateCreateInfo, {28: 1}, {32: plan.struct(attachment)}));
}

/**
 * @param {PlanRecorder} plan
 * @param {ReturnType<typeof handleTable>} table
 * @param {Display} display
 * @param {{entry: number, cache: number | object, state: ReturnType<typeof graphicsState>}} shared
 * @param {{name: string, vertex: number, fragment: number, blended: boolean, out: number}} pipeline
 */
function createGraphicsPipeline(plan, table, display, {entry, cache, state}, pipeline) {
  const stages = plan.struct(Buffer.concat([shaderStage(SHADER_STAGE_VERTEX, entry), shaderStage(SHADER_STAGE_FRAGMENT, entry)]));
  plan.copy(plan.slot(table.shaders[pipeline.vertex]), stages + 24);
  plan.copy(plan.slot(table.shaders[pipeline.fragment]), stages + 48 + 24);

  const info = plan.struct(struct(144, TYPE.graphicsPipelineCreateInfo, {20: 2, 136: NO_BASE_PIPELINE}, {
    8: state.rendering, 24: stages, 32: state.vertexInput, 40: state.assembly, 56: state.viewportState,
    64: state.raster, 72: state.multisample, 88: colorBlend(plan, pipeline.blended)
  }));
  plan.copy(plan.slot(table.layout), info + 104);
  plan.create('pipeline', pipeline.name, 'vkCreateGraphicsPipelines',
    [display.device, cache, 1, info, 0, pipeline.out], pipeline.out);
}

/**
 * @param {PlanRecorder} plan
 * @param {ReturnType<typeof handleTable>} table
 * @param {Display} display
 * @param {number} entry
 * @param {number | object} cache
 */
function createComputePipeline(plan, table, display, entry, cache) {
  const bytes = struct(96, TYPE.computePipelineCreateInfo, {88: NO_BASE_PIPELINE});
  shaderStage(SHADER_STAGE_COMPUTE, entry).copy(bytes, 24);
  const info = plan.struct(bytes);
  plan.copy(plan.slot(table.shaders[SHADERS.indexOf('publish')]), info + 24 + 24);
  plan.copy(plan.slot(table.layout), info + 72);
  plan.create('pipeline', 'publish', 'vkCreateComputePipelines',
    [display.device, cache, 1, info, 0, table.compute], table.compute);
}

/**
 * The create-infos every recording shares; only the image and view change per frame.
 * @param {PlanRecorder} plan
 * @param {ReturnType<typeof handleTable>} table
 * @param {{width: number, height: number}} size
 */
function recordingInfos(plan, table, size) {
  const allocate = plan.struct(struct(32, TYPE.commandBufferAllocateInfo, {24: COMMAND_BUFFER_PRIMARY, 28: 1}));
  plan.copy(plan.slot(table.pool), allocate + 16);
  const begin = plan.struct(struct(32, TYPE.commandBufferBeginInfo));

  const sets = plan.struct(Buffer.alloc(POINTER_BYTES));
  plan.copy(plan.slot(table.descriptor), sets);
  const bind = plan.struct(struct(64, TYPE.bindDescriptorSetsInfo, {16: SHADER_STAGES_ALL, 36: 1}, {40: sets}));
  plan.copy(plan.slot(table.layout), bind + 24);

  /** @param {[number, number]} source @param {[number, number]} destination */
  const memoryBarrier = ([srcStage, srcAccess], [dstStage, dstAccess]) => {
    const barrier = plan.struct(struct(48, TYPE.memoryBarrier2, {}, {16: srcStage, 24: srcAccess, 32: dstStage, 40: dstAccess}));
    return plan.struct(struct(64, TYPE.dependencyInfo, {20: 1}, {24: barrier}));
  };
  const barriers = {
    shadersToCompute: memoryBarrier(SCOPE.allShadersReadWrite, SCOPE.computeReadWrite),
    computeToGraphics: memoryBarrier(SCOPE.computeWrite, SCOPE.graphicsShaderRead),
    computeToHost: memoryBarrier(SCOPE.computeWrite, SCOPE.hostRead)
  };

  const images = TRANSITIONS.map(({from, to, source, destination}) => {
    const barrier = plan.struct(struct(96, TYPE.imageMemoryBarrier2,
      {48: from, 52: to, 56: QUEUE_FAMILY_IGNORED, 60: QUEUE_FAMILY_IGNORED, 72: ASPECT_COLOR, 80: 1, 88: 1},
      {16: source[0], 24: source[1], 32: destination[0], 40: destination[1]}));
    return {barrier, dependency: plan.struct(struct(64, TYPE.dependencyInfo, {48: 1}, {56: barrier}))};
  });

  const attachmentBytes = struct(72, TYPE.renderingAttachmentInfo, {24: LAYOUT_COLOR_ATTACHMENT, 44: LOAD_OP_CLEAR});
  CLEAR_COLOR.forEach((value, channel) => attachmentBytes.writeFloatLE(value, 52 + channel * 4));
  const attachment = plan.struct(attachmentBytes);
  const area = {28: size.width, 32: size.height, 36: 1, 44: 1};
  const rendering = plan.struct(struct(72, TYPE.renderingInfo, area, {48: attachment}));

  return {allocate, begin, bind, barriers, images, attachment, rendering};
}

/** @param {number} slot @param {number} image @param {number} imageCount */
const commandIndex = (slot, image, imageCount) => slot * imageCount + image;

/**
 * Allocates and begins one command buffer, transitions the image and opens the render pass on
 * it; `inside` records what runs before that (the compute pass).
 * @param {PlanRecorder} plan
 * @param {ReturnType<typeof handleTable>} table
 * @param {Display} display
 * @param {ReturnType<typeof recordingInfos>} infos
 * @param {{name: string, out: number, image: number, before?: (command: object) => void}} target
 */
function beginFrame(plan, table, display, infos, {name, out, image, before}) {
  plan.create('commandBuffer', name, 'vkAllocateCommandBuffers', [display.device, infos.allocate, out], out);
  const command = plan.slot(out);
  plan.ok('vkBeginCommandBuffer', [command, infos.begin]);
  if (before) before(command);
  else plan.call('vkCmdBindDescriptorSets2', [command, infos.bind]);
  transition(plan, table, infos, command, image, 0);

  plan.copy(plan.slot(table.views[image]), infos.attachment + 16);
  plan.call('vkCmdBeginRendering', [command, infos.rendering]);
  return command;
}

/**
 * @param {PlanRecorder} plan
 * @param {ReturnType<typeof handleTable>} table
 * @param {ReturnType<typeof recordingInfos>} infos
 * @param {object} command
 * @param {number} image
 * @param {number} step
 */
function transition(plan, table, infos, command, image, step) {
  plan.copy(plan.slot(table.images[image]), infos.images[step].barrier + 64);
  plan.call('vkCmdPipelineBarrier2', [command, infos.images[step].dependency]);
}

/**
 * The menu and overlay frame for one slot and image: publish/UI compute, then the slot's video
 * triangle, the UI quads and the badge.
 * @param {PlanRecorder} plan
 * @param {ReturnType<typeof handleTable>} table
 * @param {Display} display
 * @param {ReturnType<typeof recordingInfos>} infos
 * @param {number} slot
 * @param {number} image
 */
function recordInteractive(plan, table, display, infos, slot, image) {
  const out = table.interactive[commandIndex(slot, image, display.imageCount)];
  const command = beginFrame(plan, table, display, infos, {name: 'interactive' + slot + '.' + image, out, image,
    before(command) {
      plan.call('vkCmdPipelineBarrier2', [command, infos.barriers.shadersToCompute]);
      plan.call('vkCmdBindDescriptorSets2', [command, infos.bind]);
      plan.call('vkCmdBindPipeline', [command, BIND_POINT_COMPUTE, plan.slot(table.compute)]);
      plan.call('vkCmdDispatch', [command, 1, 1, 1]);
      plan.call('vkCmdPipelineBarrier2', [command, infos.barriers.computeToGraphics]);
    }});
  plan.call('vkCmdBindPipeline', [command, BIND_POINT_GRAPHICS, plan.slot(table.video)]);
  plan.call('vkCmdDraw', [command, VIDEO_VERTICES, 1, 0, slot]);
  plan.call('vkCmdBindPipeline', [command, BIND_POINT_GRAPHICS, plan.slot(table.ui)]);
  plan.call('vkCmdDraw', [command, QUAD_VERTICES, UI_INSTANCES + 1, 0, 0]);
  plan.call('vkCmdEndRendering', [command]);

  transition(plan, table, infos, command, image, 1);
  transition(plan, table, infos, command, image, 2);
  plan.call('vkCmdPipelineBarrier2', [command, infos.barriers.computeToHost]);
  plan.ok('vkEndCommandBuffer', [command]);
}

/**
 * The streaming frame for one slot and image: no compute, the slot's video triangle and the
 * badge quad. Host writes reach it through the submit; it writes no storage.
 * @param {PlanRecorder} plan
 * @param {ReturnType<typeof handleTable>} table
 * @param {Display} display
 * @param {ReturnType<typeof recordingInfos>} infos
 * @param {number} slot
 * @param {number} image
 */
function recordStreaming(plan, table, display, infos, slot, image) {
  const out = table.streaming[commandIndex(slot, image, display.imageCount)];
  const command = beginFrame(plan, table, display, infos, {name: 'streaming' + slot + '.' + image, out, image});
  plan.call('vkCmdBindPipeline', [command, BIND_POINT_GRAPHICS, plan.slot(table.video)]);
  plan.call('vkCmdDraw', [command, VIDEO_VERTICES, 1, 0, slot]);
  plan.call('vkCmdBindPipeline', [command, BIND_POINT_GRAPHICS, plan.slot(table.ui)]);
  plan.call('vkCmdDraw', [command, QUAD_VERTICES, 1, 0, BADGE_INSTANCE]);
  plan.call('vkCmdEndRendering', [command]);

  transition(plan, table, infos, command, image, 1);
  transition(plan, table, infos, command, image, 2);
  plan.ok('vkEndCommandBuffer', [command]);
}

/**
 * Plan 2: memory, targets, texel views, the set, the pipeline cache, shaders and pipelines.
 * @param {ReturnType<typeof workArea>} area
 * @param {ReturnType<typeof handleTable>} table
 * @param {Display} display
 * @param {{input: {size: bigint, type: number}, storage: {size: bigint, type: number}}} memory
 * @param {Record<string, {address: number, bytes: number}>} code
 * @param {{initial: {address: number, bytes: number} | null} | null} cache
 * @param {'texel-buffer' | 'storage-buffer'} path
 */
function rendererPlan(area, table, display, memory, code, cache, path) {
  const plan = planRecorder(area);
  bindStorageMemory(plan, display, 'input', memory.input,
    {buffer: table.inputBuffer, memory: table.inputMemory, mapped: table.inputMapped});
  bindStorageMemory(plan, display, 'storage', memory.storage,
    {buffer: table.storageBuffer, memory: table.storageMemory, mapped: table.storageMapped});
  createTargets(plan, table, display);
  const texel = path === 'texel-buffer';
  if (texel) createTexelViews(plan, table, display);
  createSet(plan, table, display, texel);

  let pipelineCache = /** @type {number | object} */ (0);
  if (cache) {
    const initial = cache.initial || {address: 0, bytes: 0};
    const info = plan.struct(struct(40, TYPE.pipelineCacheCreateInfo, {}, {24: initial.bytes, 32: initial.address}));
    plan.create('pipelineCache', 'pipelines', 'vkCreatePipelineCache',
      [display.device, info, 0, table.cache], table.cache);
    pipelineCache = plan.slot(table.cache);
  }

  const entry = plan.struct(Buffer.from(SHADER_ENTRY));
  SHADERS.forEach((stage, index) => createShaderModule(plan, display, stage, code[stage], table.shaders[index]));
  createComputePipeline(plan, table, display, entry, pipelineCache);
  const shared = {entry, cache: pipelineCache, state: graphicsState(plan, displaySize(display))};
  const videoFragment = texel ? 'videoFragment' : 'videoStorageFragment';
  createGraphicsPipeline(plan, table, display, shared, {name: 'video', blended: false,
    vertex: SHADERS.indexOf('videoVertex'), fragment: SHADERS.indexOf(videoFragment), out: table.video});
  createGraphicsPipeline(plan, table, display, shared, {name: 'ui', blended: true,
    vertex: SHADERS.indexOf('uiVertex'), fragment: SHADERS.indexOf('uiFragment'), out: table.ui});
  return plan;
}

/**
 * Plans 3 and 4: the interactive, then the streaming command buffers of every slot and image.
 * @param {ReturnType<typeof workArea>} area
 * @param {ReturnType<typeof handleTable>} table
 * @param {Display} display
 * @param {typeof recordInteractive} record
 */
function recordingPlan(area, table, display, record) {
  const plan = planRecorder(area);
  const infos = recordingInfos(plan, table, displaySize(display));
  for (let slot = 0; slot < VIDEO_SLOTS; slot++)
    for (let image = 0; image < display.imageCount; image++) record(plan, table, display, infos, slot, image);
  return plan;
}

/** @param {LoadedRenderer} renderer */
function stagingLayout(renderer) {
  let bytes = 0;
  /** @type {Record<string, {offset: number, bytes: Buffer}>} */
  const shaders = {};
  for (const stage of SHADERS) {
    const code = renderer.shaders[stage];
    if (!code?.length || code.length % 4) throw Error('Missing or invalid ' + stage + ' shader');
    bytes = Math.ceil(bytes / SHADER_ALIGN) * SHADER_ALIGN;
    shaders[stage] = {offset: bytes, bytes: code};
    bytes += code.length;
  }
  return {shaders, bytes: Math.ceil(bytes / STAGING_ALIGN) * STAGING_ALIGN};
}

/**
 * What a saved cache must have been made from: this module's pipeline state (with the viewport,
 * when the layer is not 1080p), the renderer's contract and every shader. The driver is checked by
 * cacheSeed (pipelineCacheUUID).
 * @param {LoadedRenderer} renderer
 * @param {{width: number, height: number}} [size] the layer's
 */
export function rendererCacheKey(renderer, size = {width: WIDTH, height: HEIGHT}) {
  const hash = crypto.createHash('sha256').update(CACHE_KEY_VERSION)
    .update(JSON.stringify(renderer.manifest.contract));
  if (size.width !== WIDTH || size.height !== HEIGHT) hash.update('layer:' + size.width + 'x' + size.height);
  for (const stage of SHADERS) {
    const code = renderer.shaders[stage];
    hash.update(stage + ':' + code.length + ':').update(code);
  }
  return hash.digest('hex');
}

/**
 * Builds the renderer on the console: buffers, views, pipelines and every command buffer.
 * @param {Pick<Civ7Rpc, 'a' | 'allocate' | 'release' | 'write' | 'callPlan' | 'request'>} rpc
 * @param {{display: Display, renderer: LoadedRenderer, resolve: (name: string) => Promise<number>,
 *   onCreated?: (objects: Created[]) => Promise<void>, cache?: boolean}} options
 */
export async function createRendererPipelines(rpc, {display, renderer, resolve, onCreated, cache = false}) {
  const imagesOk = Number.isInteger(display.imageCount) && display.imageCount >= 1 &&
    display.imageCount <= MAX_SWAPCHAIN_IMAGES;
  const familyOk = Number.isInteger(display.queueFamily) && display.queueFamily >= 0;
  if (!imagesOk || !familyOk) throw Error('Invalid display for pipelines');

  /** @type {Created[]} */
  const created = [];
  /** @type {Record<string, number>} */
  const functions = {};
  /** @type {object[]} */
  const requests = [];
  const opened = cache ? await openCache(rpc, rendererCacheKey(renderer, displaySize(display)), resolve) : null;
  const session = opened?.session || null;

  try {
    const work = await rpc.allocate(WORK_BYTES);
    created.push({kind: 'allocation', name: 'work', handle: String(work), destroy: DESTROY.allocation});
    const staging = stagingLayout(renderer);
    const stagingAddress = await rpc.allocate(staging.bytes, {align: STAGING_ALIGN});
    created.push({kind: 'allocation', name: 'staging', handle: String(stagingAddress), destroy: DESTROY.allocation});
    for (const shader of Object.values(staging.shaders)) await rpc.write(stagingAddress + shader.offset, shader.bytes);

    const area = workArea(work, WORK_BYTES);
    const table = handleTable(area, display.imageCount);
    const query = {properties: area.reserve(MEMORY_PROPERTIES_BYTES), device: area.reserve(DEVICE_PROPERTIES_BYTES),
      input: area.reserve(MEMORY_REQUIREMENTS_BYTES), storage: area.reserve(MEMORY_REQUIREMENTS_BYTES)};
    const probeQuery = {
      luma: {layout: area.reserve(SUBRESOURCE_LAYOUT_BYTES), requirements: area.reserve(MEMORY_REQUIREMENTS_BYTES)},
      chroma: {layout: area.reserve(SUBRESOURCE_LAYOUT_BYTES), requirements: area.reserve(MEMORY_REQUIREMENTS_BYTES)}
    };
    const probeBytes = SUBRESOURCE_LAYOUT_BYTES + MEMORY_REQUIREMENTS_BYTES;
    const reads = [
      {address: hex(table.start), length: table.bytes},
      {address: hex(query.properties), length: MEMORY_PROPERTIES_BYTES},
      {address: hex(query.input), length: MEMORY_REQUIREMENTS_BYTES},
      {address: hex(query.storage), length: MEMORY_REQUIREMENTS_BYTES},
      {address: hex(query.device), length: DEVICE_IDENTITY.bytes},
      {address: hex(query.device + LIMITS.maxTexelBufferElements), length: LIMITS_BYTES},
      {address: hex(probeQuery.luma.layout), length: probeBytes},
      {address: hex(probeQuery.chroma.layout), length: probeBytes}
    ];
    const run = planRunner(rpc, {resolve, functions, created, requests, reads, table, onCreated});

    const [properties, inputNeeds, storageNeeds, identity, limits] =
      (await run(buffersPlan(area, table, display, query))).memory;
    const probe = await run(linearProbePlan(area, table, display, probeQuery))
      .then(({memory}) => ({luma: memory[5], chroma: memory[6]}))
      .catch(error => ({error: String(/** @type {Error} */ (error).message || error)}));
    const video = videoPath(limits, probe);
    const memory = {
      input: chooseMemory(properties, inputNeeds, [MEMORY_HOST_COHERENT_VISIBLE], 'Coherent input memory unavailable'),
      storage: chooseMemory(properties, storageNeeds, PRIVATE_MEMORY_PREFERENCE, 'Private coherent storage unavailable')
    };

    const code = Object.fromEntries(Object.entries(staging.shaders)
      .map(([stage, shader]) => [stage, {address: stagingAddress + shader.offset, bytes: shader.bytes.length}]));
    const report = opened?.report || null;
    const seed = session && report ? cacheSeed(session, identity, report) : null;
    await run(rendererPlan(area, table, display, memory, code, session ? {initial: seed} : null, video.path));
    await run(recordingPlan(area, table, display, recordInteractive));
    const {value} = await run(recordingPlan(area, table, display, recordStreaming));
    if (session && report) await saveCache(rpc, session, display, value(table.cache), report);

    return describe(rpc, {display, renderer, table, value, functions, created, requests, memory,
      staging: {address: stagingAddress, bytes: staging.bytes}, cache: report, video});
  } catch (error) {
    if (session) await releaseCache(rpc, session);
    throw Object.assign(/** @type {Error} */ (error), {created: [...created], cleanup: cleanupOrder(created)});
  }
}

/** @typedef {ReturnType<typeof describe>['menu']} PipelineMenu launcher.json, as civ7 reads it. */
/** @typedef {ReturnType<typeof describe>['gpu']} PipelineGpu The renderer's report, as civ7 reads it. */

/**
 * The menu and gpu records console startup keeps and civ7 reads.
 * @param {{a: {session: unknown}}} rpc
 * @param {{display: Display, renderer: LoadedRenderer, table: ReturnType<typeof handleTable>,
 *   value: (slot: number) => bigint, functions: Record<string, number>, created: Created[],
 *   requests: object[], memory: {storage: {flags: number}}, staging: {address: number, bytes: number},
 *   cache: Record<string, unknown> | null, video: ReturnType<typeof videoPath>}} result
 */
function describe(rpc, {display, renderer, table, value, functions, created, requests, memory, staging, cache,
  video}) {
  const handle = (/** @type {number} */ slot) => String(value(slot));
  const address = (/** @type {number} */ slot) => {
    const mapped = Number(value(slot));
    if (!Number.isSafeInteger(mapped) || mapped <= 0) throw Error('Invalid mapped address');
    return mapped;
  };
  const images = Array.from({length: display.imageCount}, (_, index) => index);
  const slotList = (/** @type {(slot: number) => any} */ each) => Array.from({length: VIDEO_SLOTS}, (_, slot) => each(slot));
  const session = rpc.a.session;

  const menu = {
    session, ready: true, resourcesRetained: true, shaderStaging: staging,
    resources: {
      device: String(display.device), queue: String(display.queue), swapchain: String(display.swapchain),
      images: images.map(index => handle(table.images[index])),
      views: images.map(index => handle(table.views[index])),
      semaphores: images.map(index => handle(table.semaphores[index])),
      acquired: handle(table.acquired[0]), pool: handle(table.pool),
      ...(display.layer ? {layer: String(display.layer)} : {})
    },
    controls: {buffer: handle(table.inputBuffer), memory: handle(table.inputMemory),
      mapped: address(table.inputMapped), bytes: INPUT_BYTES}
  };

  const shaders = Object.fromEntries(SHADERS.map((stage, index) => [stage, handle(table.shaders[index])]));
  const gpu = {
    session, renderer: 'civ7', id: 'moonlight-civ7', fingerprint: renderer.fingerprint, resourcesRetained: true,
    ready: true, functions,
    privateStorage: {buffer: handle(table.storageBuffer), memory: handle(table.storageMemory),
      mapped: address(table.storageMapped), bytes: STORAGE_BYTES, memoryFlags: memory.storage.flags,
      descriptor: handle(table.descriptor), setLayout: handle(table.setLayout), descriptorPool: handle(table.descriptorPool)},
    pipeline: handle(table.video), layout: handle(table.layout), shaders: [shaders.videoVertex, shaders.videoFragment],
    pipelines: {publish: handle(table.compute), video: handle(table.video), ui: handle(table.ui)},
    shaderModules: shaders,
    computePipelines: {compute: {pipeline: handle(table.compute), shader: shaders.publish}},
    computePipeline: handle(table.compute), computeShader: shaders.publish,
    commands: [images.map(index => handle(table.interactive[commandIndex(0, index, display.imageCount)]))],
    slots: {
      interactive: slotList(slot => images.map(index => handle(table.interactive[commandIndex(slot, index, display.imageCount)]))),
      streaming: slotList(slot => images.map(index => handle(table.streaming[commandIndex(slot, index, display.imageCount)]))),
      acquired: slotList(slot => handle(table.acquired[slot])),
      fences: slotList(slot => handle(table.fences[slot]))
    },
    video
  };
  return {menu, gpu, created, requests, cache};
}
