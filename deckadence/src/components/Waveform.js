import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import './Waveform.css';

// Rekordbox-style 3-band coloring: blue=bass, orange=mid, white=treble,
// blended per point by each band's relative energy. This is the only
// waveform style in the app now - it's what real Rekordbox looks like,
// and it matches the small waveform thumbnail used in the track library.
const LOW_COLOR = [0x00, 0xAE, 0xEF];
const MID_COLOR = [0xFF, 0xAA, 0x00];
const HIGH_COLOR = [0xFF, 0xFF, 0xFF];
const DEFAULT_COLOR = 'rgb(78, 205, 196)';

const blendBandColor = (low, mid, high) => {
  const total = low + mid + high;
  if (total <= 0) return DEFAULT_COLOR;

  const wLow = low / total;
  const wMid = mid / total;
  const wHigh = high / total;

  const r = Math.round(LOW_COLOR[0] * wLow + MID_COLOR[0] * wMid + HIGH_COLOR[0] * wHigh);
  const g = Math.round(LOW_COLOR[1] * wLow + MID_COLOR[1] * wMid + HIGH_COLOR[1] * wHigh);
  const b = Math.round(LOW_COLOR[2] * wLow + MID_COLOR[2] * wMid + HIGH_COLOR[2] * wHigh);
  return `rgb(${r}, ${g}, ${b})`;
};

const Waveform = ({
  track,
  currentTime,
  duration,
  viewMode,
  zoomLevel,
  showWaveform,
  showBeatgrid,
  onSeekToTime,
  onJogStart,
  onJogEnd,
  isPlaying = false
}) => {
  const canvasRef = useRef(null);
  const djCanvasRef = useRef(null);

  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startTime: 0 });

  // The backend caps waveform data at ~1500 points regardless of track
  // length, so there's no need for the adaptive downsampling/caching this
  // component used to do to cope with 10-20k point payloads - that was
  // most of what made this feel slow. Only recompute per-point colors
  // when the actual waveform data changes, never on playhead movement.
  const points = useMemo(() => {
    const waveformData = track?.waveformData;
    if (!waveformData?.times?.length || !waveformData?.amplitudes?.length) {
      return null;
    }

    const { times, amplitudes, frequency_bands } = waveformData;
    const n = times.length;
    const colors = new Array(n);

    for (let i = 0; i < n; i++) {
      const low = frequency_bands?.low?.[i] || 0;
      const mid = frequency_bands?.mid?.[i] || 0;
      const high = frequency_bands?.high?.[i] || 0;
      colors[i] = blendBandColor(low, mid, high);
    }

    return { times, amplitudes, colors };
  }, [track?.waveformData]);

  const beatgrid = useMemo(() => track?.beatgrid || track?.beatGrid || [], [track?.beatgrid, track?.beatGrid]);

  const drawBeatgrid = useCallback((ctx, width, height, timeToX) => {
    if (!showBeatgrid || beatgrid.length === 0) return;

    beatgrid.forEach((beat, index) => {
      const x = timeToX(beat);
      if (x < 0 || x > width) return;

      const isBarStart = index % 4 === 0;
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = isBarStart ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = isBarStart ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    });
  }, [showBeatgrid, beatgrid]);

  // Traditional view: the whole track, drawn once per frame as a single
  // amplitude silhouette colored per-point by frequency content.
  const drawTraditionalWaveform = useCallback((time) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    if (!points || !duration) return;

    const timeToX = (t) => (t / duration) * width;

    if (showWaveform) {
      const { times, amplitudes, colors } = points;
      const centerY = height / 2;
      const barWidth = Math.max(1, width / times.length);

      for (let i = 0; i < times.length; i++) {
        const x = timeToX(times[i]);
        const barHeight = Math.max(1, amplitudes[i] * height * 0.45);
        ctx.globalAlpha = times[i] < time ? 0.35 : 1.0;
        ctx.fillStyle = colors[i];
        ctx.fillRect(x, centerY - barHeight, barWidth, barHeight * 2);
      }
    }

    drawBeatgrid(ctx, width, height, timeToX);

    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#4ecdc4';
    ctx.lineWidth = 2;
    const playheadX = timeToX(time);
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }, [points, duration, showWaveform, drawBeatgrid]);

  // DJ view: zoomed, scrolls under a fixed center playhead.
  const drawDJWaveform = useCallback((time) => {
    const canvas = djCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, width, height);

    if (!points || !duration) return;

    const visibleDuration = duration / zoomLevel;
    const timeToX = (t) => width / 2 + ((t - time) / visibleDuration) * width;
    const visibleStart = time - visibleDuration / 2;
    const visibleEnd = time + visibleDuration / 2;

    if (showWaveform) {
      const { times, amplitudes, colors } = points;
      const centerY = height / 2;
      const pointSpacing = times.length > 1 ? times[1] - times[0] : visibleDuration;
      const barWidth = Math.max(1, (pointSpacing / visibleDuration) * width);

      for (let i = 0; i < times.length; i++) {
        if (times[i] < visibleStart || times[i] > visibleEnd) continue;

        const x = timeToX(times[i]);
        const barHeight = Math.max(1, amplitudes[i] * height * 0.45);
        ctx.globalAlpha = times[i] < time ? 0.35 : 1.0;
        ctx.fillStyle = colors[i];
        ctx.fillRect(x, centerY - barHeight, barWidth, barHeight * 2);
      }
    }

    drawBeatgrid(ctx, width, height, timeToX);

    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#4ecdc4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
  }, [points, duration, zoomLevel, showWaveform, drawBeatgrid]);

  // Smoothly interpolate the DJ view's playhead between currentTime prop
  // updates (which only arrive on the audio element's own timeupdate
  // cadence, not every animation frame).
  const lastCurrentTimeRef = useRef(currentTime);
  const lastWallClockRef = useRef(performance.now());

  useEffect(() => {
    lastCurrentTimeRef.current = currentTime;
    lastWallClockRef.current = performance.now();
  }, [currentTime]);

  useEffect(() => {
    let raf;
    const loop = () => {
      if (viewMode === 'dj') {
        const elapsed = isPlaying ? (performance.now() - lastWallClockRef.current) / 1000 : 0;
        drawDJWaveform(lastCurrentTimeRef.current + elapsed);
      } else {
        drawTraditionalWaveform(currentTime);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [viewMode, isPlaying, currentTime, drawDJWaveform, drawTraditionalWaveform]);

  const handleSeek = (e) => {
    if (!onSeekToTime || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percentage = (e.clientX - rect.left) / rect.width;
    onSeekToTime(percentage * duration);
  };

  const handleDJMouseDown = (e) => {
    if (!onSeekToTime) return;
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startTime: currentTime };
    if (onJogStart) onJogStart();
    e.preventDefault();
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - dragRef.current.startX;
      const visibleDuration = duration / zoomLevel;
      const deltaTime = -(deltaX / 800) * visibleDuration;
      const newTime = Math.max(0, Math.min(duration, dragRef.current.startTime + deltaTime));
      onSeekToTime(newTime);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (onJogEnd) onJogEnd();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, duration, zoomLevel, onSeekToTime, onJogEnd]);

  return (
    <div className="waveform-component">
      {viewMode === 'traditional' && (
        <div className="waveform-container">
          <canvas
            ref={canvasRef}
            className="waveform-canvas"
            width={800}
            height={200}
            onClick={handleSeek}
          />
        </div>
      )}

      {viewMode === 'dj' && (
        <div className="dj-waveform-container">
          <canvas
            ref={djCanvasRef}
            className="dj-waveform-canvas"
            width={800}
            height={200}
          />
          <div
            className="dj-waveform-overlay"
            onMouseDown={handleDJMouseDown}
          />
        </div>
      )}
    </div>
  );
};

export default Waveform;
