import React, { useState, useRef, useEffect, useCallback } from 'react';
import Waveform from './Waveform';
import './TrackPlayer.css';

const TrackPlayer = ({ track, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [showWaveform, setShowWaveform] = useState(true);
  const [showBeatgrid, setShowBeatgrid] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [id3Data, setId3Data] = useState(null);
  const [albumCover, setAlbumCover] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1.0); // Initial zoom level (1x)
  const [viewMode, setViewMode] = useState('traditional'); // 'traditional' or 'dj'
  const [waveformMode, setWaveformMode] = useState('3band'); // 'blue', 'rgb', or '3band'
  const [isJogging, setIsJogging] = useState(false);
  const audioRef = useRef(null);

  // Handle jog wheel start
  const handleJogStart = useCallback(() => {
    setIsJogging(true);
    // Pause audio during jogging
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, []);

  // Handle jog wheel end
  const handleJogEnd = useCallback(() => {
    setIsJogging(false);
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
    
    if (track && track.file) {
      loadID3Tags(track.file);
      // Create object URL for audio playback
      audioUrl = URL.createObjectURL(track.file);
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
      }
    } else {
      // Reset ID3 data when no file is available
      setId3Data(null);
      setAlbumCover(null);
      if (audioRef.current) {
        audioRef.current.src = '';
      }
    }
    
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
      setDuration(audio.duration);
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
  }, []);

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

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;
    
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

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
            
            {/* Waveform Mode Selector */}
            <div className="control-group">
              <label>Mode:</label>
              <select 
                value={waveformMode} 
                onChange={(e) => setWaveformMode(e.target.value)}
                className="mode-select"
              >
                <option value="blue">Blue</option>
                <option value="rgb">RGB</option>
                <option value="3band">3-Band</option>
              </select>
            </div>
            
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
            onSeek={handleSeek}
            onSeekToTime={handleSeekToTime}
            waveformMode={waveformMode}
            onJogStart={handleJogStart}
            onJogEnd={handleJogEnd}
            isJogging={isJogging}
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
              
              <div className="time-display">
                <span>{formatTime(currentTime)}</span>
                <span>/</span>
                <span>{formatTime(duration)}</span>
              </div>
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