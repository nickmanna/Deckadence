import React, { forwardRef, useImperativeHandle } from 'react';
import Waveform from './Waveform';
import { useDeckPlayer } from '../hooks/useDeckPlayer';

/**
 * One channel's full engine (via useDeckPlayer, the same hook TrackPlayer.js
 * uses). Renders as a Fragment rather than one wrapped element - Green
 * Room's layout mirrors the DDJ-FLX4's physical console (all waveforms
 * stacked in one column, all decks' transport controls in a single row
 * below flanking a central mixer, jog wheel on the outer edge of each
 * deck's own control block), so this component's two visual halves need to
 * land in different rows/columns of GreenRoom's CSS grid rather than
 * staying nested inside one wrapper div. `waveformRow`/`controlsRow`/
 * `controlsColumn` are grid placement handed down from GreenRoom; `side`
 * picks which edge of this deck's control block the jog wheel sits on
 * (left-of-mixer decks show it on their left, right-of-mixer decks on
 * their right).
 *
 * `volume` is an externally-computed value (channel fader x crossfader
 * position, from the parent mixer) rather than deck-owned state, since the
 * mixer needs to be the source of truth for gain across all decks at once.
 *
 * Transport handlers are also exposed imperatively via `ref` (see
 * useImperativeHandle below) so Green Room can wire one shared DDJ-FLX4
 * controller instance to whichever channel is mapped to its left/right
 * physical deck, without this component needing to know MIDI exists.
 */
const Deck = forwardRef(({
  deckNumber, track, volume, zoomLevel, side = 'left',
  waveformRow, controlsRow, controlsColumn,
  onDragOver, onDragLeave, onDrop,
}, ref) => {
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

  useImperativeHandle(ref, () => ({
    togglePlay,
    handleCuePress,
    handleCueRelease,
    handleLoopIn,
    handleLoopOut,
    handleLoop4BeatOrExit,
    handleLoopCallLeft,
    handleLoopCallRight,
    setPlaybackRate,
  }), [togglePlay, handleCuePress, handleCueRelease, handleLoopIn, handleLoopOut, handleLoop4BeatOrExit, handleLoopCallLeft, handleLoopCallRight, setPlaybackRate]);

  // The jog wheel's readout is the track's stored BPM adjusted live by the
  // pitch fader, exactly like a real deck's tempo display - not the raw
  // stored BPM, which would stay static while the fader is moved.
  const displayBpm = track?.bpm ? Math.round(track.bpm * playbackRate * 10) / 10 : null;

  const jogWheel = (
    <div className={`deck-jog-wheel ${isPlaying ? 'spinning' : ''}`} key="jog">
      <div className="deck-jog-marker" />
      <div className="deck-jog-readout">
        <span className="deck-jog-bpm">{displayBpm ?? '--'}</span>
        <span className="deck-jog-bpm-label">BPM</span>
      </div>
    </div>
  );

  return (
    <>
      <div className="deck-waveform-row" style={{ gridRow: waveformRow }}>
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
      </div>

      <div
        className={`deck-controls-block deck-controls-${side}`}
        style={{ gridRow: controlsRow, gridColumn: controlsColumn }}
      >
        {side === 'left' && jogWheel}

        <div className="deck-transport">
          <div className="deck-transport-buttons">
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

        {side === 'right' && jogWheel}

        <audio ref={audioRef} preload="auto" />
      </div>
    </>
  );
});

Deck.displayName = 'Deck';

export default Deck;
