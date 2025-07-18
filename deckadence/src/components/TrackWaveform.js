import React, { useState, useEffect, useRef } from 'react';
import './TrackWaveform.css';

const TrackWaveform = ({ 
  track, 
  isPlaying, 
  currentTime, 
  duration, 
  onTimeUpdate, 
  onPlayPause,
  deckNumber,
  isMaster = false
}) => {
  const mainCanvasRef = useRef(null);
  const overviewCanvasRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);

  // Generate mock waveform data (in real app, this would come from actual audio analysis)
  const generateWaveformData = (length = 200) => {
    const data = [];
    for (let i = 0; i < length; i++) {
      // Create realistic waveform with varying amplitudes
      const baseAmplitude = 0.3 + Math.random() * 0.4;
      const frequency = 1 + Math.sin(i * 0.1) * 0.5;
      data.push(baseAmplitude * frequency);
    }
    return data;
  };

  const drawMainWaveform = () => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Set canvas size for high DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    
    const waveformData = generateWaveformData(400); // More detailed for main waveform
    const barWidth = width / waveformData.length;
    const centerY = height / 2;
    
    // Draw beatgrid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    
    // Standard beats (thin lines)
    for (let i = 0; i <= width; i += barWidth * 4) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }
    
    // Downbeats (thicker red lines)
    ctx.strokeStyle = '#FF4444';
    ctx.lineWidth = 2;
    for (let i = 0; i <= width; i += barWidth * 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }
    
    // Draw 3-band frequency color-coded waveform
    waveformData.forEach((amplitude, index) => {
      const x = index * barWidth;
      const barHeight = amplitude * (height * 0.8);
      
      // 3-band frequency color coding
      const progress = index / waveformData.length;
      let color;
      if (progress < 0.33) {
        color = '#00AEEF'; // Blue for low frequencies
      } else if (progress < 0.66) {
        color = '#FFAA00'; // Amber/Orange for mid frequencies
      } else {
        color = '#FFFFFF'; // White for high frequencies
      }
      
      ctx.fillStyle = color;
      ctx.fillRect(
        x + barWidth * 0.1, 
        centerY - barHeight / 2, 
        barWidth * 0.8, 
        barHeight
      );
    });
    
    // Draw playhead
    if (isPlaying || currentTime > 0) {
      const playheadX = (currentTime / duration) * width;
      
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
  };

  const drawOverviewWaveform = () => {
    const canvas = overviewCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Set canvas size for high DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    
    const waveformData = generateWaveformData(100); // Compressed for overview
    const barWidth = width / waveformData.length;
    const centerY = height / 2;
    
    // Draw compressed waveform overview
    waveformData.forEach((amplitude, index) => {
      const x = index * barWidth;
      const barHeight = amplitude * (height * 0.6);
      
      // Color-coded by frequency
      const progress = index / waveformData.length;
      let color;
      if (progress < 0.33) {
        color = '#00AEEF'; // Blue for bass
      } else if (progress < 0.66) {
        color = '#FFAA00'; // Orange for mids
      } else {
        color = '#FFFFFF'; // White for highs
      }
      
      ctx.fillStyle = color;
      ctx.fillRect(
        x + barWidth * 0.2, 
        centerY - barHeight / 2, 
        barWidth * 0.6, 
        barHeight
      );
    });
    
    // Draw playhead marker
    if (isPlaying || currentTime > 0) {
      const playheadX = (currentTime / duration) * width;
      
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
    
    // Draw cue points (mock data)
    const cuePoints = [0.25, 0.5, 0.75];
    cuePoints.forEach(cuePoint => {
      const cueX = cuePoint * width;
      ctx.fillStyle = '#FF4444';
      ctx.fillRect(cueX - 1, 0, 2, height);
    });
  };

  const handleCanvasClick = (e) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = (clickX / canvas.width) * duration;
    
    if (onTimeUpdate) {
      onTimeUpdate(Math.max(0, Math.min(newTime, duration)));
    }
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    
    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const newTime = (currentX / canvas.width) * duration;
    
    if (onTimeUpdate) {
      onTimeUpdate(Math.max(0, Math.min(newTime, duration)));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    drawMainWaveform();
    drawOverviewWaveform();
  }, [currentTime, isPlaying, duration]);

  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [isDragging, duration]);

  return (
    <div className="rekordbox-deck">
      {/* Track Info Panel */}
      <div className="track-info-panel">
        <div className="track-title">{track?.name || 'No Track Loaded'}</div>
        <div className="track-artist">{track?.artist || 'Unknown Artist'}</div>
        <div className="track-meta">
          <div className="track-bpm">{track?.bpm || '---'}.00</div>
          <div className="track-key">{track?.camelotKey || 'Cm'}</div>
          <div className="track-time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
      </div>

      {/* Full Waveform Overview */}
      <div className="waveform-overview">
        <canvas
          ref={overviewCanvasRef}
          className="overview-canvas"
          width={800}
          height={40}
        />
      </div>

      {/* Main Scrolling Waveform */}
      <div className="main-waveform">
        <canvas
          ref={mainCanvasRef}
          className="main-canvas"
          width={800}
          height={120}
          onClick={handleCanvasClick}
        />
      </div>
    </div>
  );
};

export default TrackWaveform; 