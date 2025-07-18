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
  
  // Performance optimization: cache waveform data
  const [waveformCache, setWaveformCache] = useState(null);
  const [lastRenderTime, setLastRenderTime] = useState(0);

  // Memoize waveform data processing
  const processedWaveformData = useMemo(() => {
    if (!track?.waveformData) return null;
    
    const { times, amplitudes, frequency_bands } = track.waveformData;
    
    // Process data based on waveform mode
    switch (waveformMode) {
      case 'blue':
        // Classic blue waveform - use different shades of blue based on amplitude
        return {
          times,
          amplitudes,
          colors: amplitudes.map(amp => {
            // Create different shades of blue based on amplitude
            const intensity = Math.min(1, amp * 2); // Scale amplitude for better color variation
            const baseBlue = 0.5 + (intensity * 0.5); // 0.5 to 1.0
            const green = 0.3 + (intensity * 0.4); // 0.3 to 0.7 for cyan-blue shades
            const red = 0.1 + (intensity * 0.2); // 0.1 to 0.3 for slight warmth
            return [red, green, baseBlue];
          })
        };
      
      case 'rgb':
        // RGB based on frequency content with enhanced color mapping
        const colors = [];
        for (let i = 0; i < times.length; i++) {
          const low = frequency_bands?.low?.[i] || 0;
          const mid = frequency_bands?.mid?.[i] || 0;
          const high = frequency_bands?.high?.[i] || 0;
          const total = low + mid + high;
          const amplitude = amplitudes[i];
          
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
        return { times, amplitudes, colors };
      
      case '3band': 
      default:
        // 3-band frequency separation (DJ style)
        // Ensure we have valid frequency band data
        const validFrequencyBands = frequency_bands || {
          low: amplitudes.map(() => 0),
          mid: amplitudes.map(() => 0),
          high: amplitudes.map(() => 0)
        };
        
        // If frequency bands are all zeros, use amplitude data as fallback
        const hasValidBands = validFrequencyBands.low.some(val => val > 0) ||
                             validFrequencyBands.mid.some(val => val > 0) ||
                             validFrequencyBands.high.some(val => val > 0);
        
        if (!hasValidBands) {
          // Use amplitude data to create pseudo frequency bands
          return {
            times,
            amplitudes,
            frequency_bands: {
              low: amplitudes.map(amp => amp * 0.8),    // Bass (Blue)
              mid: amplitudes.map(amp => amp * 0.6),    // Midrange (Yellow/Amber)
              high: amplitudes.map(amp => amp * 0.4)  // Treble (White)
            }
          };
        }
        
        return {
          times,
          amplitudes,
          frequency_bands: validFrequencyBands
        };
    }
  }, [track?.waveformData, waveformMode]);

  // Optimized drawing functions with better performance
  const drawTraditionalWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !processedWaveformData) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    const { times, amplitudes, colors, frequency_bands } = processedWaveformData;
    
    if (showWaveform) {
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      
      if (waveformMode === '3band' && frequency_bands) {
        // Draw 3band waveform (DJ style)
        const bandHeight = height / 3;
        
        // Low frequencies (blue) - bottom third
        ctx.strokeStyle = '#00AEEF';
        for (let i = 0; i < times.length - 1; i++) {
          const x1 = (times[i] / duration) * width;
          const x2 = (times[i + 1] / duration) * width;
          const y1 = height - (frequency_bands.low[i] * bandHeight);
          const y2 = height - (frequency_bands.low[i + 1] * bandHeight);
          
          if (times[i] < currentTime) {
            ctx.globalAlpha = 0.3;
          } else {
            ctx.globalAlpha = 1.0;
          }
          
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        
        // Mid frequencies (yellow) - middle third
        ctx.strokeStyle = '#FFAA00';
        for (let i = 0; i < times.length - 1; i++) {
          const x1 = (times[i] / duration) * width;
          const x2 = (times[i + 1] / duration) * width;
          const y1 = height - bandHeight - (frequency_bands.mid[i] * bandHeight);
          const y2 = height - bandHeight - (frequency_bands.mid[i + 1] * bandHeight);
          
          if (times[i] < currentTime) {
            ctx.globalAlpha = 0.3;
          } else {
            ctx.globalAlpha = 1.0;
          }
          
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        
        // High frequencies (white) - top third
        ctx.strokeStyle = '#FFFFFF';
        for (let i = 0; i < times.length - 1; i++) {
          const x1 = (times[i] / duration) * width;
          const x2 = (times[i + 1] / duration) * width;
          const y1 = height - (2 * bandHeight) - (frequency_bands.high[i] * bandHeight);
          const y2 = height - (2 * bandHeight) - (frequency_bands.high[i + 1] * bandHeight);
          
          if (times[i] < currentTime) {
            ctx.globalAlpha = 0.3;
          } else {
            ctx.globalAlpha = 1.0;
          }
          
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      } else {    // Draw single-band waveform (blue or RGB) - layered like 3band
        for (let i = 0; i < times.length - 1; i++) {
          const x1 = (times[i] / duration) * width;
          const x2 = (times[i + 1] / duration) * width;
          const centerY = height / 2;
          
          // Dim played sections
          if (times[i] < currentTime) {
            ctx.globalAlpha = 0.3;
          } else {
            ctx.globalAlpha = 1.0;
          }
          
          if (waveformMode === 'blue') {
            // Create layered blue effect with different intensities
            const amp = amplitudes[i];
            const amp2 = amplitudes[i + 1];
            
            // Base layer (darker blue)
            ctx.fillStyle = '#0066CC';
            ctx.fillRect(x1, centerY, x2 - x1, amp * height / 2 * 0.4);
            ctx.fillRect(x1, centerY - amp * height / 2 * 0.4, x2 - x1, amp * height / 2 * 0.4);
            
            // Middle layer (medium blue)
            ctx.fillStyle = '#0088FF';
            ctx.fillRect(x1, centerY, x2 - x1, amp * height / 2 * 0.7);
            ctx.fillRect(x1, centerY - amp * height / 2 * 0.7, x2 - x1, amp * height / 2 * 0.7);
            
            // Top layer (bright blue)
            ctx.fillStyle = '#00AEEF';
            ctx.fillRect(x1, centerY, x2 - x1, amp * height / 2);
            ctx.fillRect(x1, centerY - amp * height / 2, x2 - x1, amp * height / 2);
          } else if (waveformMode === 'rgb' && colors && colors[i]) {
            // Create layered RGB effect
            const color = colors[i];
            const amp = amplitudes[i];
            const amp2 = amplitudes[i + 1];
            
            // Base layer (darker version of the color)
            const darkColor = [
              color[0] * 0.4,
              color[1] * 0.4,
              color[2] * 0.4
            ];
            ctx.fillStyle = `rgb(${darkColor[0] * 255}, ${darkColor[1] * 255}, ${darkColor[2] * 255})`;
            ctx.fillRect(x1, centerY, x2 - x1, amp * height / 2 * 0.4);
            ctx.fillRect(x1, centerY - amp * height / 2 * 0.4, x2 - x1, amp * height / 2 * 0.4);
            
            // Middle layer (medium version of the color)
            const mediumColor = [
              color[0] * 0.7,
              color[1] * 0.7,
              color[2] * 0.7
            ];
            ctx.fillStyle = `rgb(${mediumColor[0] * 255}, ${mediumColor[1] * 255}, ${mediumColor[2] * 255})`;
            ctx.fillRect(x1, centerY, x2 - x1, amp * height / 2 * 0.7);
            ctx.fillRect(x1, centerY - amp * height / 2 * 0.7, x2 - x1, amp * height / 2 * 0.7);
            
            // Top layer (full color)
            ctx.fillStyle = `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`;
            ctx.fillRect(x1, centerY, x2 - x1, amp * height / 2);
            ctx.fillRect(x1, centerY - amp * height / 2, x2 - x1, amp * height / 2);
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
  }, [processedWaveformData, currentTime, duration, showWaveform, waveformMode]);

  // DJ View rendering function
  const drawDJWaveform = useCallback(() => {
    const canvas = djCanvasRef.current;
    if (!canvas || !processedWaveformData) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Set background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    const { times, amplitudes, colors, frequency_bands } = processedWaveformData;
    const centerY = height / 2;
    
    // Calculate visible range based on current time and zoom
    const visibleDuration = duration / zoomLevel;
    const visibleStart = Math.max(0, currentTime - visibleDuration / 2);
    const visibleEnd = Math.min(duration, currentTime + visibleDuration / 2);
    
    if (waveformMode === '3band' && frequency_bands) {
      // Draw 3-band layered waveform (Rekordbox style) - mirrored
      for (let i = 0; i < times.length - 1; i++) {
        const time = times[i];
        if (time < visibleStart || time > visibleEnd) continue;
        
        // Calculate x position relative to center (waveform scrolls, playhead stays fixed)
        const x1 = width / 2 + ((time - currentTime) / visibleDuration) * width;
        const x2 = width / 2 + ((times[i + 1] - currentTime) / visibleDuration) * width;
        
        const lowAmp = frequency_bands.low[i] || 0;
        const midAmp = frequency_bands.mid[i] || 0;
        const highAmp = frequency_bands.high[i] || 0;
        
        // Dim played sections
        if (time < currentTime) {
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
        const x1 = width / 2 + ((time - currentTime) / visibleDuration) * width;
        const x2 = width / 2 + ((times[i + 1] - currentTime) / visibleDuration) * width;
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
        if (time < currentTime) {
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
    
    // Draw beatgrid
    if (track?.beatgrid && showBeatgrid) {
      const beatgrid = track.beatgrid;
      const visibleDuration = duration / zoomLevel;
      const visibleStart = Math.max(0, currentTime - visibleDuration / 2);
      const visibleEnd = Math.min(duration, currentTime + visibleDuration / 2);
      
      // Find beats in visible range
      const visibleBeats = beatgrid.filter(beat => beat >= visibleStart && beat <= visibleEnd);
      
      visibleBeats.forEach((beat) => {
        // Calculate x position relative to center (same as waveform)
        const x = width / 2 + ((beat - currentTime) / visibleDuration) * width;
        
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
  }, [processedWaveformData, currentTime, duration, waveformMode, zoomLevel, track?.beatgrid, showBeatgrid]);

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
    const deltaTime = (deltaX / 800) * visibleDuration; // 800 is canvas width
    const newTime = Math.max(0, Math.min(duration, dragStartTime + deltaTime));
    
    // Throttle updates for smooth performance
    const now = Date.now();
    if (now - lastDragTime > 16) { // 60fps
      onSeekToTime(newTime);
      setLastDragTime(now);
    }
  };

  const handleDJMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      
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

  // Performance optimization: reduce throttling for smoother rendering
  useEffect(() => {
    const now = Date.now();
    // Increase throttling to reduce lag - only render every 50ms (20fps)
    if (now - lastRenderTime > 50) { // 50ms ~20fps for better performance
      if (viewMode === 'traditional') {
        drawTraditionalWaveform();
      } else if (viewMode === 'dj') {
        drawDJWaveform();
      }
      setLastRenderTime(now);
    }
  }, [drawTraditionalWaveform, drawDJWaveform, viewMode, lastRenderTime]);

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