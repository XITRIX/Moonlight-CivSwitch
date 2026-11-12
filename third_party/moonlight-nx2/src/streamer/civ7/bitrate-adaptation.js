/* Auto bitrate adaptation across reconnects: moonlight-common-c fixes the bitrate per session,
 * so a sustained bad window ends the session and the next one starts lower. Session-only; the
 * saved setting stays Auto. Design: civ7/README.md, "Bitrate adaptation". */
import {bitrate as streamBitrate} from '../session/bitrate.js';

/** Seconds after each connect whose stats are ignored, for the startup keyframe burst. */
export const WARMUP_SECONDS = 5;
/** Rolling window of judged seconds. */
export const WINDOW_SECONDS = 10;
/** Bad seconds within the window that step the bitrate down, once per launch. */
export const BAD_SECONDS_TO_STEP_DOWN = 6;
/** Access units dropped in one second that make it bad. */
export const BAD_DROPS_PER_SECOND = 5;
/** Host queue age, in frame times, that makes a second bad. */
export const BAD_QUEUE_AGE_FRAMES = 3;
/** Estimated round trip that makes a second bad. */
export const BAD_RTT_MS = 80;
/** A high-rate second presenting below this share of the rate is the frame-rate guard's. */
export const PRESENTATION_SHARE = 0.9;
export const STEP_DOWN_FACTOR = 0.75;
export const FLOOR_KBPS = 5000;
export const STEP_KBPS = 100;
/** Consecutive clean seconds on a lowered bitrate before the one step up. */
export const CLEAN_SECONDS_TO_STEP_UP = 120;
/** Stats seconds of a launch, warmups included, between two adaptation reconnects. */
export const HOLD_OFF_SECONDS = 60;

/** Auto defaults are whole Mbps, which recovers one from a scaled session bitrate. */
const AUTO_STEP_KBPS = 1000;

/**
 * The Auto default for the effective rate, scaled by the session-only factor.
 * @param {number} autoKbps
 * @param {number} scale
 * @returns {number}
 */
export function scaledBitrate(autoKbps, scale) {
  if (scale >= 1) return autoKbps;

  const lowered = Math.floor(autoKbps * scale / STEP_KBPS) * STEP_KBPS;
  return Math.max(Math.min(autoKbps, FLOOR_KBPS), lowered);
}

/**
 * The bitrate for one session: bitrate.js resolves `--bitrate`, and `--bitrate-scale` scales
 * an Auto value for whatever rate the session runs at.
 * @param {string[]} args
 * @param {number} width
 * @param {number} height
 * @param {number} fps
 * @returns {number}
 */
export function sessionBitrate(args, width, height, fps) {
  const kbps = Number(streamBitrate(args, width, height, fps));
  const at = args.indexOf('--bitrate-scale');
  if (at < 0) return kbps;

  const scale = Number(args[at + 1]);
  const auto = args[args.indexOf('--bitrate') + 1] === 'auto';
  if (!auto) throw Error('--bitrate-scale needs --bitrate auto');
  if (!(scale > 0 && scale <= 1)) throw Error('--bitrate-scale takes a factor in (0, 1]');

  return scaledBitrate(kbps, scale);
}

/**
 * The counters of one civ7-stats line (stream.js); dropped and idrRequests are cumulative.
 * @typedef {{presented: number, dropped: number, idrRequests: number, queueAgeMs: number}} StatsSecond
 */

/**
 * @typedef {{type: 'bitrate-adaptation', direction: 'up' | 'down', reason: string, from: number, to: number,
 *   scale: number, fps: number, badSeconds: number, windowSeconds: number, cleanSeconds: number}} Decision
 */

/**
 * @typedef {{fps: number, kbps: number, autoKbps: number, seconds: number, dropped: number,
 *   idrRequests: number, poor: boolean, rttMs: number, window: boolean[], cleanStreak: number,
 *   decided: boolean}} Session
 */

/**
 * @param {number} value
 * @param {number} previous
 */
const delta = (value, previous) => value >= previous ? value - previous : value;

/**
 * @param {Record<string, unknown>} event
 * @returns {event is Record<string, unknown> & StatsSecond}
 */
const isStatsSecond = event =>
  ['presented', 'dropped', 'idrRequests', 'queueAgeMs'].every(field => typeof event[field] === 'number');

/**
 * One per user launch, fed every stream event of each session it reconnects: at most one step
 * down and one back up, HOLD_OFF_SECONDS apart. Seconds are counted by civ7-stats, so a path
 * without them never adapts.
 */
export function createBitrateAdaptation() {
  /** @type {number | null} */
  let scale = null;
  let steppedDown = false;
  let steppedUp = false;
  let launchSeconds = 0;
  /** @type {number | null} */
  let decidedAt = null;
  /** @type {Session | null} */
  let session = null;
  /**
   * Unscaled Auto values seen per rate; a rate first met while lowered is estimated.
   * @type {Map<number, number>}
   */
  const autoByFps = new Map();

  /**
   * @param {number} fps
   * @param {number} bitrate
   */
  function startSession(fps, bitrate) {
    const started = scale ?? 1;
    if (started === 1) autoByFps.set(fps, bitrate);
    const estimate = Math.round(bitrate / started / AUTO_STEP_KBPS) * AUTO_STEP_KBPS;
    const autoKbps = autoByFps.get(fps) ?? estimate;
    session = {fps, kbps: bitrate, autoKbps, seconds: 0, dropped: 0, idrRequests: 0,
      poor: false, rttMs: 0, window: [], cleanStreak: 0, decided: false};
  }

  /**
   * @param {Session} session
   * @param {StatsSecond} stats
   * @param {number} drops
   * @param {number} idrs
   */
  function isBadSecond(session, stats, drops, idrs) {
    const frameMs = 1000 / session.fps;
    const networkBad = session.poor || session.rttMs > BAD_RTT_MS;
    const backlogBad = drops >= BAD_DROPS_PER_SECOND || idrs > 0;
    const queueBad = stats.queueAgeMs > frameMs * BAD_QUEUE_AGE_FRAMES;

    return networkBad || backlogBad || queueBad;
  }

  /**
   * @param {Session} session
   * @param {StatsSecond} stats
   */
  function isPresentationOverload(session, stats) {
    if (session.fps <= 60) return false;

    return stats.presented < session.fps * PRESENTATION_SHARE;
  }

  /**
   * @param {Session} session
   * @param {number} next
   * @param {Decision['direction']} direction
   * @param {string} reason
   * @returns {Decision}
   */
  function decide(session, next, direction, reason) {
    session.decided = true;
    scale = next;
    decidedAt = launchSeconds;
    if (direction === 'down') steppedDown = true;
    if (direction === 'up') steppedUp = true;
    const bad = session.window.filter(Boolean).length;
    const to = scaledBitrate(session.autoKbps, next);

    return {type: 'bitrate-adaptation', direction, reason, from: session.kbps, to, scale: next,
      fps: session.fps, badSeconds: bad, windowSeconds: session.window.length,
      cleanSeconds: session.cleanStreak};
  }

  /**
   * @param {Session} session
   * @param {StatsSecond} stats
   */
  function judge(session, stats) {
    const drops = delta(stats.dropped, session.dropped);
    const idrs = delta(stats.idrRequests, session.idrRequests);
    session.dropped = stats.dropped;
    session.idrRequests = stats.idrRequests;
    session.seconds++;
    launchSeconds++;

    if (session.seconds <= WARMUP_SECONDS) return null;
    if (isPresentationOverload(session, stats)) return null;

    const bad = isBadSecond(session, stats, drops, idrs);
    session.window.push(bad);
    if (session.window.length > WINDOW_SECONDS) session.window.shift();
    session.cleanStreak = bad ? 0 : session.cleanStreak + 1;

    const holdingOff = decidedAt !== null && launchSeconds - decidedAt < HOLD_OFF_SECONDS;
    if (holdingOff) return null;

    const badSeconds = session.window.filter(Boolean).length;
    const canStepDown = !steppedDown && session.kbps > FLOOR_KBPS;
    if (canStepDown && badSeconds >= BAD_SECONDS_TO_STEP_DOWN)
      return decide(session, (scale ?? 1) * STEP_DOWN_FACTOR, 'down', 'sustained-loss');

    const canStepUp = scale !== null && scale < 1 && !steppedUp;
    if (canStepUp && scale !== null && session.cleanStreak >= CLEAN_SECONDS_TO_STEP_UP)
      return decide(session, Math.min(1, scale / STEP_DOWN_FACTOR), 'up', 'clean-stretch');

    return null;
  }

  return {
    /**
     * @param {Record<string, unknown>} event A parsed stream line; malformed counters are ignored.
     * @returns {Decision | null} A decision ends this session; reconnect at `to`.
     */
    observe(event) {
      if (event.type === 'video-rate') {
        const {fps, bitrate} = event;
        if (typeof fps === 'number' && typeof bitrate === 'number') startSession(fps, bitrate);
        return null;
      }
      if (!session || session.decided) return null;

      if (event.event === 'connection-status') session.poor = event.status === 'poor';
      if (event.event === 'rtt' && typeof event.ms === 'number') session.rttMs = event.ms;
      if (event.type === 'frame-rate-overload') session.decided = true;
      if (event.type !== 'civ7-stats') return null;
      if (!isStatsSecond(event)) return null;

      return judge(session, event);
    },
    /** The session-only factor on the Auto default, or null while Auto has not been lowered. */
    scale: () => scale
  };
}
