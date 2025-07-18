import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import './Waveform.css';

const Waveform = ({ 
  track, 
  currentTime, 
  duration, 
  viewMode, 
  zoomLevel, 
  showWaveform, 
  showBeatgrid, 
  onSeek,
  onSeekToTime,
  onJogStart,
  onJogEnd,
  waveformMode = '3band'
}) => {
  const canvasRef = useRef(null);
  const djCanvasRef = useRef(null);
  
  // State for DJ view dragging and jog wheel
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState(0);
  const [lastDragTime, setLastDragTime] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [lastCurrentTime, setLastCurrentTime] = useState(0);
  
  // Performance optimization: cache waveform data and rendering
  const [waveformCache, setWaveformCache] = useState(null);
  const [lastRenderTime, setLastRenderTime] = useState(0);
  const [renderCache, setRenderCache] = useState({ traditional: null, dj: null });
  const [lastCacheKey, setLastCacheKey] = useState('');
  
  // Memoize waveform data processing with caching
  const processedWaveformData = useMemo(() => {
    if (!track?.waveformData) return null;
    
    const { times, amplitudes, frequency_bands } = track.waveformData;
    
    // Create cache key for this data
    const cacheKey = `${waveformMode}-${times.length}-${amplitudes.length}`;
    if (waveformCache && waveformCache.key === cacheKey) {
      return waveformCache.data;
    }
    
    // Process data based on waveform mode with downsampling for performance
    // Downsample data based on zoom level and view mode for better performance
    let downsamplingFactor = 1;
    if (viewMode === 'dj') {
      if (isScrolling) {
        // Aggressive downsampling during scrolling for maximum performance
        downsamplingFactor = Math.max(1, Math.floor(times.length / 1000));
      } else if (Math.abs(currentTime - lastCurrentTime) > 0.01) {
        // Moderate downsampling during playback for smooth rendering
        downsamplingFactor = Math.max(1, Math.floor(times.length / 1500));
      } else {
        downsamplingFactor = zoomLevel >= 4 ? 1 : Math.max(1, Math.floor(times.length / 2000)); // More points for high zoom
      }
    } else {
      if (Math.abs(currentTime - lastCurrentTime) > 0.01) {
        // Aggressive downsampling during playback for traditional view to prevent lag
        downsamplingFactor = Math.max(1, Math.floor(times.length / 800));
      } else {
        downsamplingFactor = Math.max(1, Math.floor(times.length / 1000)); // Fewer points for traditional view
      }
    }
    
    // Downsample the data
    const downsampledTimes = [];
    const downsampledAmplitudes = [];
    const downsampledFrequencyBands = frequency_bands ? {
      low: [],
      mid: [],
      high: []
    } : null;
    
    for (let i = 0; i < times.length; i += downsamplingFactor) {
      downsampledTimes.push(times[i]);
      downsampledAmplitudes.push(amplitudes[i]);
      
      if (downsampledFrequencyBands) {
        downsampledFrequencyBands.low.push(frequency_bands.low[i] || 0);
        downsampledFrequencyBands.mid.push(frequency_bands.mid[i] || 0);
        downsampledFrequencyBands.high.push(frequency_bands.high[i] || 0);
      }
    }
    
    // Use downsampled data
    const processedTimes = downsampledTimes;
    const processedAmplitudes = downsampledAmplitudes;
    const processedFrequencyBands = downsampledFrequencyBands;
    
    // Cache the processed data
    let processedData;
    switch (waveformMode) {
      case 'blue':
        // Classic blue waveform - use different shades of blue based on amplitude
        processedData = {
          times: processedTimes,
          amplitudes: processedAmplitudes,
          colors: processedAmplitudes.map(amp => {
            // Create different shades of blue based on amplitude
            const intensity = Math.min(1, amp * 2); // Scale amplitude for better color variation
            const baseBlue = 0.5 + (intensity * 0.5); // 0.5 to 1.0
            const green = 0.3 + (intensity * 0.4); // 0.3 to 0.7 for cyan-blue shades
            const red = 0.1 + (intensity * 0.2); // 0.1 to 0.3 for slight warmth
            return [red, green, baseBlue];
          })
        };
        break;
      
      case 'rgb':
        // RGB based on frequency content with enhanced color mapping
        const colors = [];
        for (let i = 0; i < processedTimes.length; i++) {
          const low = processedFrequencyBands?.low?.[i] || 0;
          const mid = processedFrequencyBands?.mid?.[i] || 0;
          const high = processedFrequencyBands?.high?.[i] || 0;
          const total = low + mid + high;
          const amplitude = processedAmplitudes[i];
          
          if (total === 0 || amplitude < 0.01) {
            colors.push([0.3, 0.3, 0.3]); // Dark gray for silence
          } else {
            // Enhanced RGB mapping with amplitude-based intensity
            const intensity = Math.min(1, amplitude * 1.5); // Scale for better visibility
            
            // Calculate base RGB values from frequency content
            const r = Math.min(1, Math.max(0, (low / total) * 2.5));
            const g = Math.min(1, Math.max(0, (mid / total) * 2.5));
            const b = Math.min(1, Math.max(0, (high / total) * 2.5));
            
            // Apply intensity scaling and ensure minimum brightness
            const minBrightness = 0.2;
            const scaledR = Math.max(minBrightness, r * intensity);
            const scaledG = Math.max(minBrightness, g * intensity);
            const scaledB = Math.max(minBrightness, b * intensity);
            
            // Ensure at least one color channel is prominent for better visibility
            const maxVal = Math.max(scaledR, scaledG, scaledB);
            if (maxVal < 0.4) {
              // Boost the dominant frequency with more vibrant colors
              if (low > mid && low > high) {
                colors.push([0.9, 0.1, 0.1]); // Bright red for bass
              } else if (mid > high) {
                colors.push([0.1, 0.9, 0.1]); // Bright green for mids
              } else {
                colors.push([0.1, 0.1, 0.9]); // Bright blue for highs
              }
            } else {
              colors.push([scaledR, scaledG, scaledB]);
            }
          }
        }
        processedData = { times: processedTimes, amplitudes: processedAmplitudes, colors };
        break;
      
      case '3band': 
      default:
        // 3-band frequency separation (DJ style)
        // Ensure we have valid frequency band data
        const validFrequencyBands = processedFrequencyBands || {
          low: processedAmplitudes.map(() => 0),
          mid: processedAmplitudes.map(() => 0),
          high: processedAmplitudes.map(() => 0)
        };
        
        // If frequency bands are all zeros, use amplitude data as fallback
        const hasValidBands = validFrequencyBands.low.some(val => val > 0) ||
                             validFrequencyBands.mid.some(val => val > 0) ||
                             validFrequencyBands.high.some(val => val > 0);
        
        if (!hasValidBands) {
          // Use amplitude data to create pseudo frequency bands
          processedData = {
            times: processedTimes,
            amplitudes: processedAmplitudes,
            frequency_bands: {
              low: processedAmplitudes.map(amp => amp * 0.8),    // Bass (Blue)
              mid: processedAmplitudes.map(amp => amp * 0.6),    // Midrange (Yellow/Amber)
              high: processedAmplitudes.map(amp => amp * 0.4)  // Treble (White)
            }
          };
        } else {
          processedData = {
            times: processedTimes,
            amplitudes: processedAmplitudes,
            frequency_bands: validFrequencyBands
          };
        }
        break;
    }
    
    // Cache the processed data
    setWaveformCache({ key: cacheKey, data: processedData });
    return processedData;
  }, [track?.waveformData, waveformMode, waveformCache, viewMode, zoomLevel, isScrolling, currentTime, lastCurrentTime]);

  // Optimized drawing functions with better performance
  const drawTraditionalWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !processedWaveformData) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    
    // Create cache key for this render
    const cacheKey = `traditional-${waveformMode}-${currentTime.toFixed(2)}-${duration.toFixed(2)}-${showWaveform}-${showBeatgrid}`;
    
    // Check if we can use cached render
    if (renderCache.traditional && lastCacheKey === cacheKey) {
      return;
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    const { times, amplitudes, colors, frequency_bands } = processedWaveformData;
    
    if (showWaveform) {
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      
      if (waveformMode === '3band' && frequency_bands) {
        // Draw 3band waveform (DJ style) - optimized for performance
        const bandHeight = height / 3;
        
        // Pre-calculate all positions to reduce calculations
        const positions = [];
        for (let i = 0; i < times.length; i++) {
          positions.push({
            x: (times[i] / duration) * width,
            low: frequency_bands.low[i] || 0,
            mid: frequency_bands.mid[i] || 0,
            high: frequency_bands.high[i] || 0,
            time: times[i]
          });
        }
        
        // Draw in batches for better performance
        const batchSize = 100;
        
        // Low frequencies (blue) - bottom third
        ctx.strokeStyle = '#00AEEF';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        
        for (let batch = 0; batch < positions.length - 1; batch += batchSize) {
          const endIndex = Math.min(batch + batchSize, positions.length - 1);
          
          ctx.beginPath();
          for (let i = batch; i < endIndex; i++) {
            const pos = positions[i];
            const nextPos = positions[i + 1];
            
            if (pos.time < currentTime) {
              ctx.globalAlpha = 0.3;
            } else {
              ctx.globalAlpha = 1.0;
            }
            
            const y1 = height - (pos.low * bandHeight);
            const y2 = height - (nextPos.low * bandHeight);
            
            if (i === batch) {
              ctx.moveTo(pos.x, y1);
            }
            ctx.lineTo(nextPos.x, y2);
          }
          ctx.stroke();
        }
        
        // Mid frequencies (yellow) - middle third
        ctx.strokeStyle = '#FFAA00';
        
        for (let batch = 0; batch < positions.length - 1; batch += batchSize) {
          const endIndex = Math.min(batch + batchSize, positions.length - 1);
          
          ctx.beginPath();
          for (let i = batch; i < endIndex; i++) {
            const pos = positions[i];
            const nextPos = positions[i + 1];
            
            if (pos.time < currentTime) {
              ctx.globalAlpha = 0.3;
            } else {
              ctx.globalAlpha = 1.0;
            }
            
            const y1 = height - bandHeight - (pos.mid * bandHeight);
            const y2 = height - bandHeight - (nextPos.mid * bandHeight);
            
            if (i === batch) {
              ctx.moveTo(pos.x, y1);
            }
            ctx.lineTo(nextPos.x, y2);
          }
          ctx.stroke();
        }
        
        // High frequencies (white) - top third
        ctx.strokeStyle = '#FFFFFF';
        
        for (let batch = 0; batch < positions.length - 1; batch += batchSize) {
          const endIndex = Math.min(batch + batchSize, positions.length - 1);
          
          ctx.beginPath();
          for (let i = batch; i < endIndex; i++) {
            const pos = positions[i];
            const nextPos = positions[i + 1];
            
            if (pos.time < currentTime) {
              ctx.globalAlpha = 0.3;
            } else {
              ctx.globalAlpha = 1.0;
            }
            
            const y1 = height - (2 * bandHeight) - (pos.high * bandHeight);
            const y2 = height - (2 * bandHeight) - (nextPos.high * bandHeight);
            
            if (i === batch) {
              ctx.moveTo(pos.x, y1);
            }
            ctx.lineTo(nextPos.x, y2);
          }
          ctx.stroke();
        }
      } else {    // Draw single-band waveform (blue or RGB) - optimized for performance
        // Pre-calculate all positions to reduce calculations in the loop
        const positions = [];
        for (let i = 0; i < times.length; i++) {
          positions.push({
            x: (times[i] / duration) * width,
            amp: amplitudes[i],
            time: times[i],
            color: colors ? colors[i] : null
          });
        }
        
        // Draw in batches for better performance
        const batchSize = 50;
        for (let batch = 0; batch < positions.length - 1; batch += batchSize) {
          const endIndex = Math.min(batch + batchSize, positions.length - 1);
          
          for (let i = batch; i < endIndex; i++) {
            const pos = positions[i];
            const nextPos = positions[i + 1];
            const centerY = height / 2;
            
            // Dim played sections
            if (pos.time < currentTime) {
              ctx.globalAlpha = 0.3;
            } else {
              ctx.globalAlpha = 1.0;
            }
            
            if (waveformMode === 'blue') {
              // Optimized blue waveform - single layer for performance
              ctx.fillStyle = '#00AEEF';
              const height1 = pos.amp * height / 2;
              const height2 = nextPos.amp * height / 2;
              
              // Draw as a single filled path for better performance
              ctx.beginPath();
              ctx.moveTo(pos.x, centerY - height1);
              ctx.lineTo(nextPos.x, centerY - height2);
              ctx.lineTo(nextPos.x, centerY + height2);
              ctx.lineTo(pos.x, centerY + height1);
              ctx.closePath();
              ctx.fill();
            } else if (waveformMode === 'rgb' && pos.color) {
              // Optimized RGB waveform - single layer for performance
              const color = pos.color;
              ctx.fillStyle = `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`;
              const height1 = pos.amp * height / 2;
              const height2 = nextPos.amp * height / 2;
              
              // Draw as a single filled path for better performance
              ctx.beginPath();
              ctx.moveTo(pos.x, centerY - height1);
              ctx.lineTo(nextPos.x, centerY - height2);
              ctx.lineTo(nextPos.x, centerY + height2);
              ctx.lineTo(pos.x, centerY + height1);
              ctx.closePath();
              ctx.fill();
            }
          }
        }
      }
    }
    
    // Draw moving playhead
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#00AEEF';
    ctx.lineWidth = 3;
    const playheadX = (currentTime / duration) * width;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    
    // Cache this render
    setRenderCache(prev => ({ ...prev, traditional: true }));
    setLastCacheKey(cacheKey);
  }, [processedWaveformData, currentTime, duration, showWaveform, waveformMode, showBeatgrid, renderCache, lastCacheKey]);

  // DJ View rendering function
  const drawDJWaveform = useCallback((customTime) => {
    const canvas = djCanvasRef.current;
    if (!canvas || !processedWaveformData) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    
    // Use customTime if provided, otherwise currentTime
    const timeForRender = typeof customTime === 'number' ? customTime : currentTime;

    // Create cache key for this render
    const cacheKey = `dj-${waveformMode}-${timeForRender.toFixed(2)}-${duration.toFixed(2)}-${zoomLevel}-${showWaveform}-${showBeatgrid}`;
    
    // During scrolling, skip cache checks for immediate response
    if (!isScrolling) {
      // Check if we can use cached render
      if (renderCache.dj && lastCacheKey === cacheKey) {
        return;
      }
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Set background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    const { times, amplitudes, colors, frequency_bands } = processedWaveformData;
    const centerY = height / 2;
    
    // Calculate visible range based on current time and zoom
    const visibleDuration = duration / zoomLevel;
    const visibleStart = Math.max(0, timeForRender - visibleDuration / 2);
    const visibleEnd = Math.min(duration, timeForRender + visibleDuration / 2);
    
    if (waveformMode === '3band' && frequency_bands) {
      // Draw 3-band layered waveform (Rekordbox style) - mirrored
      for (let i = 0; i < times.length - 1; i++) {
        const time = times[i];
        if (time < visibleStart || time > visibleEnd) continue;
        
        // Calculate x position relative to center (waveform scrolls, playhead stays fixed)
        const x1 = width / 2 + ((time - timeForRender) / visibleDuration) * width;
        const x2 = width / 2 + ((times[i + 1] - timeForRender) / visibleDuration) * width;
        
        const lowAmp = frequency_bands.low[i] || 0;
        const midAmp = frequency_bands.mid[i] || 0;
        const highAmp = frequency_bands.high[i] || 0;
        
        // Dim played sections
        if (time < timeForRender) {
          ctx.globalAlpha = 0.3;
        } else {
          ctx.globalAlpha = 1.0;
        }
        
        // Draw low frequencies (blue) - mirrored
        ctx.fillStyle = '#00AEEF';
        ctx.fillRect(x1, centerY, x2 - x1, lowAmp * height / 2);
        ctx.fillRect(x1, centerY - lowAmp * height / 2, x2 - x1, lowAmp * height / 2);
        
        // Draw mid frequencies (yellow) - mirrored
        ctx.fillStyle = '#FFAA00';
        ctx.fillRect(x1, centerY, x2 - x1, midAmp * height / 2 * 0.7);
        ctx.fillRect(x1, centerY - midAmp * height / 2 * 0.7, x2 - x1, midAmp * height / 2 * 0.7);
        
        // Draw high frequencies (white) - mirrored
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x1, centerY, x2 - x1, highAmp * height / 2 * 0.4);
        ctx.fillRect(x1, centerY - highAmp * height / 2 * 0.4, x2 - x1, highAmp * height / 2 * 0.4);
      }
    } else {
      // Draw single-band mirrored waveform
      for (let i = 0; i < times.length - 1; i++) {
        const time = times[i];
        if (time < visibleStart || time > visibleEnd) continue;
        
        // Calculate x position relative to center (waveform scrolls, playhead stays fixed)
        const x1 = width / 2 + ((time - timeForRender) / visibleDuration) * width;
        const x2 = width / 2 + ((times[i + 1] - timeForRender) / visibleDuration) * width;
        const y1 = centerY - (amplitudes[i] * height / 2);
        const y2 = centerY - (amplitudes[i + 1] * height / 2);
        
        // Color based on mode
        if (colors && colors[i]) {
          const color = colors[i];
          ctx.fillStyle = `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`;
        } else {
          ctx.fillStyle = '#00AEEF'; // Default blue
        }
        
        // Dim played sections
        if (time < timeForRender) {
          ctx.globalAlpha = 0.3;
        } else {
          ctx.globalAlpha = 1.0;
        }
        
        // Draw filled mirrored waveform
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2, centerY + (amplitudes[i + 1] * height / 2));
        ctx.lineTo(x1, centerY + (amplitudes[i] * height / 2));
        ctx.closePath();
        ctx.fill();
      }
    }
    
    // Draw beatgrid (keep during scrolling but optimize)
    if (track?.beatgrid && showBeatgrid) {
      const beatgrid = track.beatgrid;
      const visibleDuration = duration / zoomLevel;
      const visibleStart = Math.max(0, timeForRender - visibleDuration / 2);
      const visibleEnd = Math.min(duration, timeForRender + visibleDuration / 2);
      
      // Find beats in visible range
      const visibleBeats = beatgrid.filter(beat => beat >= visibleStart && beat <= visibleEnd);
      
      visibleBeats.forEach((beat) => {
        // Calculate x position relative to center (same as waveform)
        const x = width / 2 + ((beat - timeForRender) / visibleDuration) * width;
        
        // Check if this is a 4-beat marker (every 4th beat)
        // Find the beat index in the full beatgrid
        const beatIndex = beatgrid.indexOf(beat);
        const isFourBeat = beatIndex % 4 === 0;
        
        if (isFourBeat) {
          // White line every 4 beats
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
          
          // Red arrow pointing inwards
          ctx.fillStyle = '#FF0000';
          ctx.beginPath();
          ctx.moveTo(x - 8, 10);
          ctx.lineTo(x + 8, 10);
          ctx.lineTo(x, 20);
          ctx.closePath();
          ctx.fill();
          
          // Bottom arrow
          ctx.beginPath();
          ctx.moveTo(x - 8, height - 10);
          ctx.lineTo(x + 8, height - 10);
          ctx.lineTo(x, height - 20);
          ctx.closePath();
          ctx.fill();
        } else {
          // Gray line every beat
          ctx.strokeStyle = '#666666';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
      });
    }
    
    // Draw center playhead (fixed at center)
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#00AEEF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
    
    // Cache this render
    setRenderCache(prev => ({ ...prev, dj: true }));
    setLastCacheKey(cacheKey);
  }, [processedWaveformData, currentTime, duration, waveformMode, zoomLevel, track?.beatgrid, showBeatgrid, showWaveform, renderCache, lastCacheKey, djCanvasRef]);

  // DJ View drag handlers with jog wheel functionality
  const handleDJMouseDown = (e) => {
    if (!onSeekToTime) return;
    
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartTime(currentTime);
    setLastDragTime(Date.now());
    
    // Notify parent about jog start
    if (onJogStart) {
      onJogStart();
    }
    
    // Prevent text selection during drag
    e.preventDefault();
  };

  const handleDJMouseMove = (e) => {
    if (!isDragging || !onSeekToTime) return;
    
    const deltaX = e.clientX - dragStartX;
    const visibleDuration = duration / zoomLevel;
    const deltaTime = -(deltaX / 800) * visibleDuration; // Negative for correct direction
    const newTime = Math.max(0, Math.min(duration, dragStartTime + deltaTime));
    
    // Optimized scrolling: update immediately for responsive feel
    const now = Date.now();
    if (now - lastDragTime > 8) { // 120fps for ultra-smooth scrolling
      setIsScrolling(true);
      onSeekToTime(newTime);
      setLastDragTime(now);
    }
  };

  const handleDJMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      setIsScrolling(false);
      
      // Notify parent about jog end
      if (onJogEnd) {
        onJogEnd();
      }
    }
  };

  const handleDJMouseLeave = () => {
    handleDJMouseUp();
  };

  // Global mouse event handlers for smooth dragging
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e) => {
        handleDJMouseMove(e);
      };
      
      const handleGlobalMouseUp = () => {
        handleDJMouseUp();
      };
      
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging, dragStartX, dragStartTime, duration, zoomLevel, onSeekToTime]);

  // Performance optimization: smart throttling and data downsampling
  useEffect(() => {
    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTime;
    
    // Check if track is playing (currentTime is changing)
    const isPlaying = Math.abs(currentTime - lastCurrentTime) > 0.01;
    setLastCurrentTime(currentTime);
    
    // Adaptive throttling based on zoom level and view mode
    let throttleTime = 50; // Default 20fps
    
    if (viewMode === 'dj') {
      if (isScrolling) {
        // Ultra-fast rendering during scrolling for immediate response
        throttleTime = 8; // 120fps during scrolling
      } else if (isPlaying) {
        // Smooth playback rendering
        throttleTime = 16; // 60fps during playback for smooth movement
      } else {
        // DJ view needs more frequent updates for smooth scrolling
        throttleTime = zoomLevel >= 4 ? 33 : 50; // 30fps for high zoom, 20fps for low zoom
      }
    } else {
      if (isPlaying) {
        // Reduced frequency for traditional view to prevent lag
        throttleTime = 33; // 30fps during playback (reduced from 60fps)
      } else {
        // Traditional view can be less frequent
        throttleTime = 100; // 10fps for traditional view (reduced from 15fps)
      }
    }
    
    if (timeSinceLastRender > throttleTime) {
      if (viewMode === 'traditional') {
        drawTraditionalWaveform();
      } else if (viewMode === 'dj') {
        drawDJWaveform();
      }
      setLastRenderTime(now);
    }
  }, [drawTraditionalWaveform, drawDJWaveform, viewMode, lastRenderTime, zoomLevel, isScrolling, currentTime]);

  // Re-render when waveform mode changes
  useEffect(() => {
    if (viewMode === 'traditional') {
      drawTraditionalWaveform();
    } else if (viewMode === 'dj') {
      drawDJWaveform();
    }
  }, [waveformMode, viewMode, drawTraditionalWaveform, drawDJWaveform]);

  const handleSeek = (e) => {
    if (!onSeekToTime) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;
    
    onSeekToTime(newTime);
  };

  const lastCurrentTimeRef = useRef(currentTime);
  const lastWallClockRef = useRef(performance.now());
  const interpolatedTimeRef = useRef(currentTime);

  // Update refs when currentTime changes
  useEffect(() => {
    lastCurrentTimeRef.current = currentTime;
    lastWallClockRef.current = performance.now();
  }, [currentTime]);

  // Animation loop for smooth DJ view
  useEffect(() => {
    if (viewMode !== 'dj') return;
    let running = true;
    function animate() {
      if (!running) return;
      const now = performance.now();
      const elapsed = (now - lastWallClockRef.current) / 1000;
      interpolatedTimeRef.current = lastCurrentTimeRef.current + elapsed;
      drawDJWaveform(interpolatedTimeRef.current); // pass the interpolated time directly
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
    return () => { running = false; };
  }, [viewMode, currentTime, drawDJWaveform]);

  // Use interpolatedTime for DJ view, currentTime for traditional
  const renderTime = viewMode === 'dj' ? interpolatedTimeRef.current : currentTime;

  return (
    <div className="waveform-component">
      {/* Traditional Waveform View */}
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

      {/* DJ Waveform View */}
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
            onMouseLeave={handleDJMouseLeave}
          />
        </div>
      )}
    </div>
  );
};

export default Waveform; 