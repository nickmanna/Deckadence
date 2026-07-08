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
