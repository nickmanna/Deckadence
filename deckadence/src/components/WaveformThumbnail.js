import React, { useEffect, useRef } from 'react';
import './WaveformThumbnail.css';

const WIDTH = 150;
const HEIGHT = 40;
const BAR_COUNT = 40;

// Same low/mid/high color convention as the full DJ-view waveform
// (Waveform.js) so a track looks visually consistent between the table
// thumbnail and the player.
const LOW_COLOR = [0x00, 0xAE, 0xEF];
const MID_COLOR = [0xFF, 0xAA, 0x00];
const HIGH_COLOR = [0xFF, 0xFF, 0xFF];

// Downsample/upsample an array to exactly `count` values by bucket-averaging
// so the thumbnail always renders the same number of bars regardless of how
// much analysis data a track has.
const resample = (values, count, fallback = 0.15) => {
  if (!values || values.length === 0) return new Array(count).fill(fallback);
  if (values.length === count) return values;

  const result = new Array(count);
  const bucketSize = values.length / count;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
    let sum = 0;
    let n = 0;
    for (let j = start; j < end && j < values.length; j++) {
      sum += values[j];
      n++;
    }
    result[i] = n > 0 ? sum / n : fallback;
  }
  return result;
};

// Blend the three fixed band colors, weighted by each band's relative
// energy at this point, so the dominant frequency content drives the hue.
const blendBandColor = (low, mid, high) => {
  const total = low + mid + high;
  if (total <= 0) return '#4ecdc4';

  const wLow = low / total;
  const wMid = mid / total;
  const wHigh = high / total;

  const r = Math.round(LOW_COLOR[0] * wLow + MID_COLOR[0] * wMid + HIGH_COLOR[0] * wHigh);
  const g = Math.round(LOW_COLOR[1] * wLow + MID_COLOR[1] * wMid + HIGH_COLOR[1] * wHigh);
  const b = Math.round(LOW_COLOR[2] * wLow + MID_COLOR[2] * wMid + HIGH_COLOR[2] * wHigh);
  return `rgb(${r}, ${g}, ${b})`;
};

const WaveformThumbnail = ({ track }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    const waveformData = track?.waveformData;
    const amplitudes = resample(waveformData?.amplitudes, BAR_COUNT);
    const low = resample(waveformData?.frequency_bands?.low, BAR_COUNT, 0);
    const mid = resample(waveformData?.frequency_bands?.mid, BAR_COUNT, 0);
    const high = resample(waveformData?.frequency_bands?.high, BAR_COUNT, 0);

    const barWidth = WIDTH / BAR_COUNT;
    const centerY = HEIGHT / 2;

    amplitudes.forEach((amplitude, index) => {
      const barHeight = Math.max(2, amplitude * HEIGHT * 0.85);
      const x = index * barWidth;

      ctx.fillStyle = blendBandColor(low[index], mid[index], high[index]);
      ctx.fillRect(x, centerY - barHeight / 2, Math.max(1, barWidth - 1), barHeight);
    });
  }, [track]);

  return (
    <canvas
      ref={canvasRef}
      className="waveform-thumbnail"
      style={{ width: WIDTH, height: HEIGHT }}
    />
  );
};

export default WaveformThumbnail;
