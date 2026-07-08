import React, { useState } from 'react';
import Waveform from './Waveform';
import { useDdjFlx4Controller } from '../hooks/useDdjFlx4';
import { useDeckPlayer } from '../hooks/useDeckPlayer';
import './TrackPlayer.css';

const TrackPlayer = ({ track, onClose }) => {
  const [showWaveform] = useState(true);
  const [showBeatgrid] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1.0); // Initial zoom level (1x)
  const [viewMode, setViewMode] = useState('traditional'); // 'traditional' or 'dj'

  const {
    audioRef,
    isPlaying, togglePlay,
    currentTime, duration,
    volume, setVolume,
    cuePoint, loop, quantize, setQuantize,
    playbackRate, setPlaybackRate,
    id3Data, albumCover,
    handleJogStart, handleJogEnd, handleSeekToTime,
    handleCuePress, handleCueRelease,
    handleLoopIn, handleLoopOut, handleLoop4BeatOrExit, handleLoopCallLeft, handleLoopCallRight,
  } = useDeckPlayer(track);

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
    setVolume(parseFloat(e.target.value));
  };

  const handlePlaybackRateChange = (e) => {
    setPlaybackRate(parseFloat(e.target.value));
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
          preload="auto"
        />
      </div>
    </div>
  );
};

export default TrackPlayer; 