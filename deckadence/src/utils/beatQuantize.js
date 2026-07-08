// Snapping cue/loop points to the beatgrid instead of the raw playhead
// position is what makes manual loops sound clean instead of "weird" -
// an unquantized loop-out point that lands a few milliseconds off the real
// beat produces an audible stutter every time it loops back.

/**
 * Binary-search the sorted beatgrid array for the index of the beat
 * closest to `time`. Returns -1 for an empty grid.
 */
export function findNearestBeatIndex(beatgrid, time) {
  if (!beatgrid || beatgrid.length === 0) return -1;

  let lo = 0;
  let hi = beatgrid.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beatgrid[mid] < time) lo = mid + 1;
    else hi = mid;
  }

  if (lo > 0 && Math.abs(beatgrid[lo - 1] - time) <= Math.abs(beatgrid[lo] - time)) {
    return lo - 1;
  }
  return lo;
}

/**
 * Snap `time` to the nearest beat in `beatgrid`. Returns `time` unchanged
 * if the grid is empty, so callers degrade gracefully on tracks with no
 * detected beats instead of erroring.
 */
export function quantizeTimeToBeat(time, beatgrid) {
  const idx = findNearestBeatIndex(beatgrid, time);
  return idx >= 0 ? beatgrid[idx] : time;
}

/**
 * Median beat-to-beat interval in a window around `index`, as a de-jittered
 * estimate of the local tempo.
 *
 * Individual detected beat positions are quantized to the analysis frame
 * size (~11-12ms at the backend's hop length) - each one on its own is fine
 * for display or as a single cue anchor, but a LOOP's length is the
 * difference of two such positions, so it inherits noise from both. On
 * real analyzed tracks this is enough to make a "4 beat" loop measurably
 * uneven (verified: one test track had a 95ms std / 350ms range across
 * its 4-beat spans) - an audible stutter on every repeat. Taking the
 * median interval over nearby beats averages that quantization noise out,
 * so loop lengths built from it land on a clean, consistent spacing
 * instead of inheriting two independently-noisy endpoints.
 */
export function estimateLocalBeatInterval(beatgrid, index, window = 16) {
  if (!beatgrid || beatgrid.length < 2) return null;

  const lo = Math.max(0, index - window);
  const hi = Math.min(beatgrid.length - 1, index + window);
  const intervals = [];
  for (let i = lo; i < hi; i++) {
    intervals.push(beatgrid[i + 1] - beatgrid[i]);
  }
  if (intervals.length === 0) return null;

  intervals.sort((a, b) => a - b);
  const mid = Math.floor(intervals.length / 2);
  return intervals.length % 2 === 0
    ? (intervals[mid - 1] + intervals[mid]) / 2
    : intervals[mid];
}

// Above this, a real beat position's disagreement with the smoothed
// estimate is treated as a genuine tracking discrepancy rather than
// ordinary frame-quantization noise (verified against real analyzed
// tracks: normal per-beat noise tops out around 3 analysis frames, ~35ms
// at the backend's hop length; a real "stable tempo" track rarely exceeds
// that, while a track with genuinely more local timing variation does).
const LOOP_END_OUTLIER_THRESHOLD = 0.04;

/**
 * Where a loop that starts at beatgrid[startIndex] and spans `beatCount`
 * beats should end.
 *
 * The smoothed local interval (see estimateLocalBeatInterval) is a de-
 * jittered length, which is exactly right for keeping a loop's own
 * repeats consistent - but for a SHORT loop (especially 1 beat), using a
 * pure average instead of the real position of the very next beat can
 * make the loop a few tens of ms too long, which is enough to fully
 * contain that next beat's transient too (verified on a real track: a
 * 1-beat loop landed 70ms past the real next beat, so what was meant to
 * loop a single beat instead played that beat's hit AND the following
 * one, every repeat). The real detected position is only "wrong" for
 * this purpose when it's a genuine outlier - otherwise it's a more
 * precise answer than an average, since it's tied to where the analyzer
 * actually found that specific beat.
 */
export function estimateLoopEnd(beatgrid, startIndex, beatCount) {
  const interval = estimateLocalBeatInterval(beatgrid, startIndex);
  if (interval == null) return null;

  const smoothedEnd = beatgrid[startIndex] + interval * beatCount;
  const realEnd = beatgrid[startIndex + beatCount];
  if (realEnd != null && Math.abs(realEnd - smoothedEnd) < LOOP_END_OUTLIER_THRESHOLD) {
    return realEnd;
  }
  return smoothedEnd;
}
