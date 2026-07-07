import React, { useEffect, useRef } from 'react';
import './WaveformThumbnail.css';

const WIDTH = 150;
const HEIGHT = 40;
const BAR_COUNT = 40;

// Downsample/upsample an amplitude array to exactly `count` values by
// bucket-averaging (or repeating) so the thumbnail always renders the same
// number of bars regardless of how much analysis data a track has.
const resample = (values, count) => {
  if (!values || values.length === 0) return new Array(count).fill(0.15);
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
    result[i] = n > 0 ? sum / n : 0.15;
  }
  return result;
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

    const amplitudes = resample(track?.waveformData?.amplitudes, BAR_COUNT);
    const colors = track?.waveformData?.colors;
    const barWidth = WIDTH / BAR_COUNT;
    const centerY = HEIGHT / 2;

    amplitudes.forEach((amplitude, index) => {
      const barHeight = Math.max(2, amplitude * HEIGHT * 0.85);
      const x = index * barWidth;

      if (colors && colors[index]) {
        const [r, g, b] = colors[index];
        ctx.fillStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
      } else {
        ctx.fillStyle = '#4ecdc4';
      }

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
