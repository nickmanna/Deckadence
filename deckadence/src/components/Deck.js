import React from 'react';
import Waveform from './Waveform';
import { useDeckPlayer } from '../hooks/useDeckPlayer';

/**
 * One channel strip in Green Room: a fully working single-deck engine
 * (via useDeckPlayer, the same hook TrackPlayer.js uses) wrapped in a
 * compact Rekordbox-style layout instead of TrackPlayer's full-screen
 * modal chrome. `volume` is an externally-computed value (channel fader x
 * crossfader position, from the parent mixer) rather than deck-owned
 * state, since the mixer needs to be the source of truth for gain across
 * all decks at once.
 */
const Deck = ({ deckNumber, track, volume, zoomLevel, onDragOver, onDragLeave, onDrop }) => {
  const {
    audioRef,
    isPlaying, togglePlay,
    currentTime, duration,
    cuePoint, loop, quantize, setQuantize,
    playbackRate, setPlaybackRate,
    handleJogStart, handleJogEnd, handleSeekToTime,
    handleCuePress, handleCueRelease,
    handleLoopIn, handleLoopOut, handleLoop4BeatOrExit, handleLoopCallLeft, handleLoopCallRight,
  } = useDeckPlayer(track, { externalVolume: volume });

  return (
    <div className="deck">
      <div className="deck-header">
        <span className="deck-number">{deckNumber}</span>
        <div className="deck-track-info">
          <span className="deck-track-title">{track ? (track.fileName || track.title || 'Untitled') : 'No track loaded'}</span>
          {track && (
            <span className="deck-track-meta">
              {track.bpm ? `${Math.round(track.bpm)} BPM` : ''}
              {track.key ? ` · ${track.key}${track.mode === 'minor' ? 'm' : ''}` : ''}
            </span>
          )}
        </div>
      </div>

      <div
        className="waveform-drop-zone"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <Waveform
          track={track}
          currentTime={currentTime}
          duration={duration}
          viewMode="dj"
          zoomLevel={zoomLevel}
          showWaveform
          showBeatgrid
          onSeekToTime={handleSeekToTime}
          onJogStart={handleJogStart}
          onJogEnd={handleJogEnd}
          isPlaying={isPlaying}
          cuePoint={cuePoint}
          loop={loop}
        />
      </div>

      <div className="deck-transport">
        <button className={`deck-btn deck-play-btn ${isPlaying ? 'playing' : ''}`} onClick={togglePlay} disabled={!track}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          className="deck-btn"
          onMouseDown={handleCuePress}
          onMouseUp={handleCueRelease}
          onMouseLeave={handleCueRelease}
          disabled={!track}
        >
          CUE
        </button>
        <div className="deck-loop-controls">
          <button className="deck-btn deck-loop-btn" onClick={handleLoopIn} disabled={!track}>IN</button>
          <button className="deck-btn deck-loop-btn" onClick={handleLoopOut} disabled={!track || loop.start == null}>OUT</button>
          <button className="deck-btn deck-loop-btn" onClick={handleLoop4BeatOrExit} disabled={!track}>
            {loop.start != null && loop.end != null ? 'EXIT' : '4'}
          </button>
          <button className="deck-btn deck-loop-btn" onClick={handleLoopCallLeft} disabled={!track || loop.end == null}>½</button>
          <button className="deck-btn deck-loop-btn" onClick={handleLoopCallRight} disabled={!track || loop.end == null}>×2</button>
          <button
            className={`deck-btn deck-quantize-btn ${quantize ? 'active' : ''}`}
            onClick={() => setQuantize((q) => !q)}
            title="Snap cue/loop points to the beat grid"
            disabled={!track}
          >
            Q
          </button>
        </div>
        <div className="deck-pitch-control">
          <label>Pitch</label>
          <input
            type="range"
            min="0.9"
            max="1.1"
            step="0.001"
            value={playbackRate}
            onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
            disabled={!track}
          />
          <span className="deck-pitch-value">{playbackRate >= 1 ? '+' : ''}{Math.round((playbackRate - 1) * 100)}%</span>
        </div>
      </div>

      <audio ref={audioRef} preload="auto" />
    </div>
  );
};

export default Deck;
