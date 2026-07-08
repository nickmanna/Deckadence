import React, { useState, useRef, useEffect, useCallback } from 'react';
import Waveform from './Waveform';
import { TrackService } from '../services/trackService';
import { useDdjFlx4Controller } from '../hooks/useDdjFlx4';
import { estimateLocalBeatInterval, findNearestBeatIndex, quantizeTimeToBeat } from '../utils/beatQuantize';
import './TrackPlayer.css';

const TrackPlayer = ({ track, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [cuePoint, setCuePoint] = useState(0);
  const [loop, setLoop] = useState({ start: null, end: null });
  const [quantize, setQuantize] = useState(true);
  const cuePreviewRef = useRef(false);
  const [showWaveform, setShowWaveform] = useState(true);
  const [showBeatgrid, setShowBeatgrid] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [id3Data, setId3Data] = useState(null);
  const [albumCover, setAlbumCover] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1.0); // Initial zoom level (1x)
  const [viewMode, setViewMode] = useState('traditional'); // 'traditional' or 'dj'
  const audioRef = useRef(null);

  // Handle jog wheel start
  const handleJogStart = useCallback(() => {
    // Pause audio during jogging
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, []);

  // Handle jog wheel end
  const handleJogEnd = useCallback(() => {
    // Resume audio if it was playing before jogging
    if (audioRef.current && isPlaying) {
      audioRef.current.play().catch(console.error);
    }
  }, [isPlaying]);

  // Handle seek to specific time
  const handleSeekToTime = useCallback((newTime) => {
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, []);

  const loadID3Tags = (file) => {
    // Simple browser-compatible ID3 tag reading
    const reader = new FileReader();
    
    reader.onload = function(e) {
      try {
        const arrayBuffer = e.target.result;
        const dataView = new DataView(arrayBuffer);
        
        // Check for ID3v2 tag
        if (dataView.getUint32(0) === 0x49443300) { // "ID3"
          const id3Data = parseID3v2(dataView);
          if (id3Data.metadata && Object.keys(id3Data.metadata).length > 0) {
            setId3Data(id3Data.metadata);
          }
          if (id3Data.picture) {
            setAlbumCover(id3Data.picture);
          }
        }
      } catch (error) {
        console.log('Error reading ID3 tags:', error);
        // Continue without ID3 data
      }
    };
    
    reader.onerror = function() {
      console.log('Error reading file for ID3 tags');
    };
    
    reader.readAsArrayBuffer(file);
  };
  
  const parseID3v2 = (dataView) => {
    const metadata = {};
    let picture = null;
    
    try {
      // Read ID3v2 header
      const version = dataView.getUint8(3);
      const flags = dataView.getUint8(4);
      const size = dataView.getUint32(6) & 0x7FFFFFFF; // Remove sync bytes
      
      let offset = 10; // Skip header
      
      // Parse frames
      while (offset < size) {
        if (offset + 4 > dataView.byteLength) break;
        
        const frameId = String.fromCharCode(
          dataView.getUint8(offset),
          dataView.getUint8(offset + 1),
          dataView.getUint8(offset + 2),
          dataView.getUint8(offset + 3)
        );
        
        if (frameId === '\x00\x00\x00\x00') break; // Padding
        
        const frameSize = dataView.getUint32(offset + 4);
        const frameFlags = dataView.getUint16(offset + 8);
        
        if (offset + 10 + frameSize > dataView.byteLength) break;
        
        // Read frame data
        const frameData = new Uint8Array(dataView.buffer, offset + 10, frameSize);
        
        // Parse common frames
        switch (frameId) {
          case 'TIT2': // Title
            metadata.title = decodeID3Text(frameData);
            break;
          case 'TPE1': // Artist
            metadata.artist = decodeID3Text(frameData);
            break;
          case 'TALB': // Album
            metadata.album = decodeID3Text(frameData);
            break;
          case 'TYER': // Year
            metadata.year = decodeID3Text(frameData);
            break;
          case 'TCON': // Genre
            metadata.genre = decodeID3Text(frameData);
            break;
          case 'APIC': // Picture
            picture = decodeID3Picture(frameData);
            break;
        }
        
        offset += 10 + frameSize;
      }
    } catch (error) {
      console.log('Error parsing ID3v2:', error);
    }
    
    return { metadata, picture };
  };
  
  const decodeID3Text = (data) => {
    if (data.length === 0) return '';
    
    const encoding = data[0];
    const textData = data.slice(1);
    
    switch (encoding) {
      case 0: // ISO-8859-1
        return new TextDecoder('latin1').decode(textData);
      case 1: // UTF-16 with BOM
      case 2: // UTF-16BE without BOM
        return new TextDecoder('utf-16').decode(textData);
      case 3: // UTF-8
        return new TextDecoder('utf-8').decode(textData);
      default:
        return new TextDecoder('latin1').decode(textData);
    }
  };
  
  const decodeID3Picture = (data) => {
    if (data.length < 5) return null;
    
    const encoding = data[0];
    const mimeTypeEnd = data.indexOf(0, 1);
    if (mimeTypeEnd === -1) return null;
    
    const mimeType = new TextDecoder('latin1').decode(data.slice(1, mimeTypeEnd));
    const pictureType = data[mimeTypeEnd + 1];
    const descriptionEnd = data.indexOf(0, mimeTypeEnd + 2);
    if (descriptionEnd === -1) return null;
    
    const pictureData = data.slice(descriptionEnd + 1);
    const base64 = btoa(String.fromCharCode(...pictureData));
    
    return `data:${mimeType};base64,${base64}`;
  };

  // Load ID3 tags when track changes and create audio URL
  useEffect(() => {
    let audioUrl = null;
    
    console.log('TrackPlayer received track:', track);
    console.log('Track keys:', track ? Object.keys(track) : 'No track');
    console.log('Track waveform data:', track?.waveformData);
    console.log('Track duration:', track?.duration);
    
    const loadAudioFile = async () => {
      try {
        if (track && track.file) {
          // If track has a file object (from upload), use it directly
          loadID3Tags(track.file);
          audioUrl = URL.createObjectURL(track.file);
          if (audioRef.current) {
            audioRef.current.src = audioUrl;
          }
        } else if (track && (track.downloadURL || track.storagePath)) {
          // If track has storage references, use the download URL directly
          console.log('Using audio file from storage...');
          console.log('Track storage info:', { downloadURL: track.downloadURL, storagePath: track.storagePath });
          
          // Use download URL directly for audio element (avoids CORS issues)
          if (track.downloadURL) {
            if (audioRef.current) {
              audioRef.current.src = track.downloadURL;
            }
            console.log('Audio file loaded from download URL');
          } else {
            // Fallback to fetching file if no download URL
            try {
              const audioFile = await TrackService.getAudioFile(track);
              console.log('Audio file retrieved:', audioFile);
              loadID3Tags(audioFile);
              audioUrl = URL.createObjectURL(audioFile);
              if (audioRef.current) {
                audioRef.current.src = audioUrl;
              }
              console.log('Audio file loaded from storage');
            } catch (error) {
              console.error('Failed to fetch audio file, using download URL directly');
              if (audioRef.current) {
                audioRef.current.src = track.downloadURL;
              }
            }
          }
          
          // Set duration immediately if track has it
          if (track.duration) {
            setDuration(track.duration);
            console.log('Duration set immediately from track:', track.duration);
          } else if (track.waveformData?.duration) {
            // Fallback to waveform data duration
            setDuration(track.waveformData.duration);
            console.log('Duration set from waveform data:', track.waveformData.duration);
          }
        } else {
          // Reset ID3 data when no file is available
          setId3Data(null);
          setAlbumCover(null);
          if (audioRef.current) {
            audioRef.current.src = '';
          }
        }
      } catch (error) {
        console.error('Error loading audio file:', error);
        // Reset ID3 data on error
        setId3Data(null);
        setAlbumCover(null);
        if (audioRef.current) {
          audioRef.current.src = '';
        }
      }
    };
    
    loadAudioFile();
    
    // Cleanup function to revoke object URL
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [track]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      // Use track duration if available, otherwise use audio duration
      const trackDuration = track?.duration || audio.duration;
      setDuration(trackDuration);
      console.log('Duration set:', trackDuration, 'from track:', track?.duration, 'from audio:', audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [track]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Reset cue/loop state whenever a different track is loaded.
  useEffect(() => {
    setCuePoint(0);
    setLoop({ start: null, end: null });
    cuePreviewRef.current = false;
  }, [track]);

  // Getting this from track props fresh each call (rather than useMemo)
  // keeps it trivially in sync if the track prop ever changes underneath
  // an open player, at negligible cost - it's just a property read.
  const getBeatgrid = () => track?.beatgrid || track?.beatGrid || [];

  // Manual loop/cue points landing a few ms off the real beat is exactly
  // what makes hand-set loops sound "off" on every repeat - snapping to
  // the nearest detected beat (real detected positions, not an assumed
  // constant tempo) is what a hardware CDJ's quantize does too.
  const quantizePoint = (time) => (quantize ? quantizeTimeToBeat(time, getBeatgrid()) : time);

  // Standard CDJ-style CUE behavior:
  // - pressed while playing: stop and jump back to the cue point.
  // - pressed while paused, already at the cue point: preview-play for as
  //   long as the button is held.
  // - pressed while paused elsewhere (e.g. after seeking on the waveform):
  //   drop a new cue point at the current position.
  const handleCuePress = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      audio.currentTime = cuePoint;
      setCurrentTime(cuePoint);
      setIsPlaying(false);
      return;
    }
    const atCue = Math.abs(audio.currentTime - cuePoint) < 0.05;
    if (atCue) {
      cuePreviewRef.current = true;
      audio.play().catch(console.error);
      setIsPlaying(true);
    } else {
      setCuePoint(quantizePoint(audio.currentTime));
    }
  };

  const handleCueRelease = () => {
    if (!cuePreviewRef.current) return;
    cuePreviewRef.current = false;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = cuePoint;
      setCurrentTime(cuePoint);
    }
    setIsPlaying(false);
  };

  const handleLoopIn = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setLoop({ start: quantizePoint(audio.currentTime), end: null });
  };

  // A loop's length is the difference of two beat positions, so unlike a
  // single cue point, it inherits detection noise from BOTH endpoints -
  // measured on a real analyzed track, using the raw beatgrid positions
  // directly made "4 beat" loops vary by up to 95ms std (350ms range)
  // beat-to-beat, an audible stutter on every repeat. Instead, anchor the
  // loop's START on a real quantized beat, but derive its LENGTH from the
  // local median beat interval (de-jittered) times a whole number of
  // beats - this keeps the loop internally consistent/seamless regardless
  // of how noisy any one individual detected beat position is.
  const quantizedLoopLength = (startTime, beatCount) => {
    const beatgrid = getBeatgrid();
    if (beatgrid.length > 1) {
      const startIdx = findNearestBeatIndex(beatgrid, startTime);
      const interval = estimateLocalBeatInterval(beatgrid, startIdx);
      if (interval) return interval * beatCount;
    }
    return track?.bpm ? (60 / track.bpm) * beatCount : null;
  };

  const handleLoopOut = () => {
    const audio = audioRef.current;
    if (!audio || loop.start == null) return;
    if (!quantize) {
      const end = audio.currentTime;
      if (end <= loop.start) return;
      setLoop({ start: loop.start, end });
      return;
    }
    const rawLength = audio.currentTime - loop.start;
    const interval = quantizedLoopLength(loop.start, 1);
    if (!interval) return;
    const beatCount = Math.max(1, Math.round(rawLength / interval));
    setLoop({ start: loop.start, end: loop.start + interval * beatCount });
  };

  // Single physical button: creates an instant 4-beat loop from the
  // current position when nothing is looping, exits the active loop
  // otherwise - matches the DDJ-FLX4's "4 BEAT / EXIT" labeling.
  const handleLoop4BeatOrExit = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (loop.start != null && loop.end != null) {
      setLoop({ start: null, end: null });
      return;
    }
    if (quantize) {
      const start = quantizePoint(audio.currentTime);
      const length = quantizedLoopLength(start, 4);
      if (length) {
        setLoop({ start, end: start + length });
        return;
      }
    }
    if (!track?.bpm) return;
    const beatLength = 60 / track.bpm;
    const start = audio.currentTime;
    setLoop({ start, end: start + beatLength * 4 });
  };

  const handleLoopCallLeft = () => {
    if (loop.start == null || loop.end == null) return;
    const newLength = (loop.end - loop.start) / 2;
    if (newLength < 0.05) return;
    setLoop({ start: loop.start, end: loop.start + newLength });
  };

  const handleLoopCallRight = () => {
    if (loop.start == null || loop.end == null) return;
    setLoop({ start: loop.start, end: loop.start + (loop.end - loop.start) * 2 });
  };

  // Enforce the active loop with requestAnimationFrame rather than the
  // audio element's own (coarse, browser-throttled) timeupdate event, so
  // the loop-back is tight enough to actually be usable for DJ mixing.
  useEffect(() => {
    if (!isPlaying || loop.start == null || loop.end == null) return undefined;
    let raf;
    const checkLoop = () => {
      const audio = audioRef.current;
      if (audio && audio.currentTime >= loop.end) {
        audio.currentTime = loop.start;
      }
      raf = requestAnimationFrame(checkLoop);
    };
    raf = requestAnimationFrame(checkLoop);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, loop.start, loop.end]);

  const midiStatus = useDdjFlx4Controller({
    onPlayPause: togglePlay,
    onCuePress: handleCuePress,
    onCueRelease: handleCueRelease,
    onLoopIn: handleLoopIn,
    onLoopOut: handleLoopOut,
    onLoop4BeatOrExit: handleLoop4BeatOrExit,
    onLoopCallLeft: handleLoopCallLeft,
    onLoopCallRight: handleLoopCallRight,
  });

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    audioRef.current.volume = newVolume;
  };

  const handlePlaybackRateChange = (e) => {
    const newRate = parseFloat(e.target.value);
    setPlaybackRate(newRate);
  };

  const handleZoomChange = (newZoom) => {
    setZoomLevel(newZoom);
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };





  const getKeyColor = (key, mode) => {
    const keyColors = {
      'C': '#FF6B6B', 'C#': '#4ECDC4', 'D': '#45B7D1',
      'D#': '#96CEB4', 'E': '#FFEAA7', 'F': '#DDA0DD',
      'F#': '#98D8C8', 'G': '#F7DC6F', 'G#': '#BB8FCE',
      'A': '#85C1E9', 'A#': '#F8C471', 'B': '#82E0AA'
    };
    return keyColors[key] || '#00AEEF';
  };

  return (
    <div className="track-player-overlay">
      <div className="track-player-modal">
        <div className="player-header">
          <div className="track-info">
            <div className="track-header">
              {albumCover && (
                <div className="album-cover">
                  <img src={albumCover} alt="Album Cover" />
                </div>
              )}
              <div className="track-details">
                <h2>{id3Data?.title || track.fileName}</h2>
                {id3Data?.artist && <p className="artist">{id3Data.artist}</p>}
                {id3Data?.album && <p className="album">{id3Data.album}</p>}
                {!id3Data?.title && !id3Data?.artist && (
                  <p className="no-metadata">No metadata available</p>
                )}
              </div>
            </div>
            <div className="track-metadata">
              <span className="bpm">BPM: {track.bpm}</span>
              <span 
                className="key"
                style={{ color: getKeyColor(track.key, track.mode) }}
              >
                Key: {track.key} {track.mode} ({track.camelot})
              </span>
              <span className="duration">{formatTime(duration)}</span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="player-content">
          {/* View Mode Selector */}
          <div className="view-mode-selector">
            <button 
              className={`view-btn ${viewMode === 'traditional' ? 'active' : ''}`}
              onClick={() => setViewMode('traditional')}
            >
              Traditional View
            </button>
            <button 
              className={`view-btn ${viewMode === 'dj' ? 'active' : ''}`}
              onClick={() => setViewMode('dj')}
            >
              DJ View
            </button>
          </div>

          {/* Waveform Controls */}
          <div className="waveform-controls">
            {viewMode === 'dj' && (
              <div className="control-group">
                <label>Zoom:</label>
                <div className="zoom-buttons">
                  <button
                    className={`zoom-btn ${zoomLevel === 8.0 ? 'active' : ''}`}
                    onClick={() => handleZoomChange(8.0)}
                  >
                    1x
                  </button>
                  <button
                    className={`zoom-btn ${zoomLevel === 16.0 ? 'active' : ''}`}
                    onClick={() => handleZoomChange(16.0)}
                  >
                    2x
                  </button>
                  <button
                    className={`zoom-btn ${zoomLevel === 32.0 ? 'active' : ''}`}
                    onClick={() => handleZoomChange(32.0)}
                  >
                    4x
                  </button>
                  <button
                    className={`zoom-btn ${zoomLevel === 64.0 ? 'active' : ''}`}
                    onClick={() => handleZoomChange(64.0)}
                  >
                    8x
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Waveform Component */}
          <Waveform
            track={track}
            currentTime={currentTime}
            duration={duration}
            viewMode={viewMode}
            zoomLevel={zoomLevel}
            showWaveform={showWaveform}
            showBeatgrid={showBeatgrid}
            onSeekToTime={handleSeekToTime}
            onJogStart={handleJogStart}
            onJogEnd={handleJogEnd}
            isPlaying={isPlaying}
            cuePoint={cuePoint}
            loop={loop}
          />

          {/* Playback Controls */}
          <div className="playback-controls">
            <div className="main-controls">
              <button
                className="play-btn"
                onClick={togglePlay}
              >
                {isPlaying ? '⏸️' : '▶️'}
              </button>

              <button
                className="cue-btn"
                onMouseDown={handleCuePress}
                onMouseUp={handleCueRelease}
                onMouseLeave={handleCueRelease}
              >
                CUE
              </button>

              <div className="time-display">
                <span>{formatTime(currentTime)}</span>
                <span>/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="loop-controls">
              <span className="control-label-text">Loop:</span>
              <button className="loop-btn" onClick={handleLoopIn}>IN</button>
              <button className="loop-btn" onClick={handleLoopOut} disabled={loop.start == null}>OUT</button>
              <button className="loop-btn" onClick={handleLoop4BeatOrExit}>
                {loop.start != null && loop.end != null ? 'EXIT' : '4 BEAT'}
              </button>
              <button className="loop-btn" onClick={handleLoopCallLeft} disabled={loop.end == null}>◁ 1/2</button>
              <button className="loop-btn" onClick={handleLoopCallRight} disabled={loop.end == null}>▷ x2</button>
              {loop.start != null && loop.end != null && (
                <span className="loop-length">{(loop.end - loop.start).toFixed(2)}s</span>
              )}
              <button
                className={`quantize-btn ${quantize ? 'active' : ''}`}
                onClick={() => setQuantize((q) => !q)}
                title="Snap cue/loop points to the beat grid"
              >
                Q
              </button>
            </div>

            <div className="midi-panel">
              {midiStatus.connected ? (
                <span className="midi-status connected">
                  🎛️ Connected: {midiStatus.deviceNames.join(', ')}
                </span>
              ) : (
                <>
                  <span className="midi-status">
                    {midiStatus.supported ? 'No MIDI controller connected' : 'MIDI not supported in this browser'}
                  </span>
                  {midiStatus.supported && (
                    <button className="midi-connect-btn" onClick={midiStatus.connect}>
                      Connect MIDI Controller
                    </button>
                  )}
                </>
              )}
              {midiStatus.error && <span className="midi-error">Error: {midiStatus.error}</span>}
              {midiStatus.lastMessage && (
                <span className="midi-last-message">
                  Last MIDI in: {midiStatus.lastMessage.hex} ({Math.round((Date.now() - midiStatus.lastMessage.at) / 1000)}s ago)
                </span>
              )}
            </div>

            <div className="secondary-controls">
              <div className="control-group">
                <label>Speed:</label>
                <select 
                  value={playbackRate} 
                  onChange={handlePlaybackRateChange}
                  className="rate-select"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={0.75}>0.75x</option>
                  <option value={1.0}>1.0x</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2.0}>2.0x</option>
                </select>
              </div>

              <div className="control-group">
                <label>Volume:</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="volume-slider"
                />
                <span className="volume-value">{Math.round(volume * 100)}%</span>
              </div>
            </div>
          </div>

          {/* Analysis Details */}
          <div className="analysis-details">
            <h3>Analysis Details</h3>
            <div className="details-grid">
              <div className="detail-item">
                <label>Confidence (BPM)</label>
                <div className="confidence-bar">
                  <div 
                    className="confidence-fill"
                    style={{ width: `${track.confidence.bpm * 100}%` }}
                  ></div>
                </div>
                <span>{Math.round(track.confidence.bpm * 100)}%</span>
              </div>
              <div className="detail-item">
                <label>Confidence (Key)</label>
                <div className="confidence-bar">
                  <div 
                    className="confidence-fill"
                    style={{ width: `${track.confidence.key * 100}%` }}
                  ></div>
                </div>
                <span>{Math.round(track.confidence.key * 100)}%</span>
              </div>
              <div className="detail-item">
                <label>Total Beats</label>
                <span>{track.beatgrid.length}</span>
              </div>
              <div className="detail-item">
                <label>Analysis Date</label>
                <span>{new Date(track.analysisDate).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hidden Audio Element */}
        <audio
          ref={audioRef}
          preload="metadata"
        />
      </div>
    </div>
  );
};

export default TrackPlayer; 