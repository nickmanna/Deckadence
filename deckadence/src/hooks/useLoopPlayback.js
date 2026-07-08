import { useCallback, useRef } from 'react';

/**
 * Sample-accurate loop playback via the Web Audio API, as a companion to
 * the app's normal <audio>-element-based playback.
 *
 * The <audio> element's currentTime can only be checked/corrected from JS
 * (e.g. via requestAnimationFrame), and rAF is capped at the display's
 * refresh rate (~16ms at 60Hz) - measured on a real analyzed track, that
 * let playback run up to ~23ms past the intended loop-out point before
 * catching it, long enough to hear the start of the next beat bleed
 * through before snapping back. AudioBufferSourceNode's native loop/
 * loopStart/loopEnd properties are enforced by the browser's audio engine
 * itself, not polled from the UI thread, so the loop boundary is exact.
 *
 * The tradeoff is that this requires the whole track decoded into memory
 * as a raw PCM buffer up front (fetch + decodeAudioData), so it's used
 * only while a loop is actually active - normal playback stays on the
 * plain <audio> element.
 */
// Splicing the loop boundary at an exact sample (native loopStart/loopEnd)
// jumps straight from whatever amplitude the waveform happens to be at
// loopEnd to whatever it happens to be at loopStart. On percussive or
// vocal content those two points are almost never at the same amplitude,
// and that instantaneous jump is an audible click/pop on every repeat -
// independent of how accurately loopStart/loopEnd are placed on the
// beatgrid. Building the loop as its own short buffer and blending
// (equal-power) the last few ms of the segment's tail against its own
// head fixes the discontinuity: the seam is smoothed audio instead of a
// hard edge. 10ms is short enough to stay under the threshold where a
// pre-echo of the head becomes a separately audible event, even for a
// short 1-beat loop, while still being enough samples to mask a typical
// waveform-amplitude jump.
const LOOP_CROSSFADE_SECONDS = 0.01;

function buildLoopSegment(ctx, buffer, loopStart, loopEnd) {
  const sr = buffer.sampleRate;
  const startSample = Math.max(0, Math.round(loopStart * sr));
  const endSample = Math.min(buffer.length, Math.round(loopEnd * sr));
  const length = endSample - startSample;
  if (length <= 0) return null;

  // Capped at a quarter of the loop's own length so the fade can't eat
  // into more of the segment than exists on very short (sub-beat) loops.
  const fadeSamples = Math.min(Math.round(LOOP_CROSSFADE_SECONDS * sr), Math.floor(length / 4));
  const segment = ctx.createBuffer(buffer.numberOfChannels, length, sr);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const out = segment.getChannelData(ch);
    out.set(src.subarray(startSample, endSample));

    for (let i = 0; i < fadeSamples; i++) {
      const t = i / fadeSamples;
      const fadeOut = Math.cos((t * Math.PI) / 2);
      const fadeIn = Math.sin((t * Math.PI) / 2);
      const tailIdx = length - fadeSamples + i;
      out[tailIdx] = src[startSample + tailIdx] * fadeOut + src[startSample + i] * fadeIn;
    }
  }
  return segment;
}

export function useLoopPlayback() {
  const audioContextRef = useRef(null);
  const audioBufferRef = useRef(null);
  const bufferUrlRef = useRef(null);
  const decodingPromiseRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const playbackInfoRef = useRef(null);

  const getContext = useCallback(() => {
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new Ctx();
    }
    return audioContextRef.current;
  }, []);

  const ensureBuffer = useCallback(async (url) => {
    if (audioBufferRef.current && bufferUrlRef.current === url) return audioBufferRef.current;
    if (decodingPromiseRef.current && bufferUrlRef.current === url) return decodingPromiseRef.current;

    bufferUrlRef.current = url;
    audioBufferRef.current = null;
    const ctx = getContext();
    decodingPromiseRef.current = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        audioBufferRef.current = buffer;
        return buffer;
      })
      .catch((error) => {
        console.error('Tight-loop playback unavailable (could not decode audio for Web Audio):', error);
        return null;
      });
    return decodingPromiseRef.current;
  }, [getContext]);

  const stop = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {
        // already stopped - fine
      }
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    playbackInfoRef.current = null;
  }, []);

  /**
   * Starts sample-accurate looped playback of [loopStart, loopEnd) from
   * `fromTime` (or loopStart, if fromTime falls outside the loop).
   * Returns false if decoding failed, so the caller can fall back to
   * ordinary <audio>-element playback.
   */
  const start = useCallback(async (url, loopStart, loopEnd, fromTime, opts = {}) => {
    const buffer = await ensureBuffer(url);
    if (!buffer) return false;

    stop();
    const ctx = getContext();
    if (ctx.state === 'suspended') ctx.resume();

    // Loop a self-contained, seam-crossfaded copy of [loopStart, loopEnd)
    // rather than using the full track buffer's native loopStart/loopEnd -
    // see buildLoopSegment for why (declicking the wrap point).
    const segment = buildLoopSegment(ctx, buffer, loopStart, loopEnd);
    if (!segment) return false;

    const source = ctx.createBufferSource();
    source.buffer = segment;
    source.loop = true;
    source.playbackRate.value = opts.playbackRate ?? 1;

    const gain = ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    source.connect(gain);
    gain.connect(ctx.destination);

    const playFrom = fromTime >= loopStart && fromTime < loopEnd ? fromTime : loopStart;
    source.start(0, playFrom - loopStart);

    sourceNodeRef.current = source;
    gainNodeRef.current = gain;
    playbackInfoRef.current = {
      contextStartTime: ctx.currentTime,
      bufferOffset: playFrom,
      loopStart,
      loopEnd,
      playbackRate: opts.playbackRate ?? 1,
    };
    return true;
  }, [ensureBuffer, getContext, stop]);

  const setVolume = useCallback((v) => {
    if (gainNodeRef.current) gainNodeRef.current.gain.value = v;
  }, []);

  /**
   * Current playhead position for UI display only - the actual loop
   * boundary is enforced natively by the AudioBufferSourceNode, this just
   * derives where the playhead visually is from the Web Audio clock.
   */
  const getCurrentTime = useCallback(() => {
    const info = playbackInfoRef.current;
    const ctx = audioContextRef.current;
    if (!info || !ctx) return null;
    const loopLength = info.loopEnd - info.loopStart;
    if (loopLength <= 0) return info.loopStart;
    let elapsed = (ctx.currentTime - info.contextStartTime) * info.playbackRate + (info.bufferOffset - info.loopStart);
    elapsed = ((elapsed % loopLength) + loopLength) % loopLength;
    return info.loopStart + elapsed;
  }, []);

  const isActive = useCallback(() => sourceNodeRef.current != null, []);

  return { start, stop, setVolume, getCurrentTime, isActive };
}
