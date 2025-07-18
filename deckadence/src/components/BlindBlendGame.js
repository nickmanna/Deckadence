import React, { useState, useEffect } from 'react';
import TrackWaveform from './TrackWaveform';
import './BlindBlendGame.css';

const BlindBlendGame = ({ challengeConfig, onBackToDashboard }) => {
  const [tracks, setTracks] = useState([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [gameState, setGameState] = useState('loading');
  const [score, setScore] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(300);
  const [isGameActive, setIsGameActive] = useState(false);
  const [masterDeck, setMasterDeck] = useState(1);

  // Generate mock tracks based on challenge config
  const generateTracks = () => {
    const mockTracks = [];
    const { trackCount, genre, bpmRange } = challengeConfig;
    
    const bpmRanges = {
      'slow': [120, 130],
      'medium': [130, 140],
      'fast': [140, 150],
      'very-fast': [150, 160],
      'any': [120, 160]
    };

    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const camelotKeys = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B'];
    
    for (let i = 0; i < trackCount; i++) {
      const bpmRangeValues = bpmRanges[bpmRange];
      const bpm = Math.floor(Math.random() * (bpmRangeValues[1] - bpmRangeValues[0])) + bpmRangeValues[0];
      const keyIndex = Math.floor(Math.random() * keys.length);
      const key = keys[keyIndex];
      const camelotKey = camelotKeys[keyIndex];
      const duration = Math.floor(Math.random() * 120) + 180;
      
      mockTracks.push({
        id: i + 1,
        name: `${genre} Track ${i + 1}`,
        artist: `Artist ${i + 1}`,
        genre: genre,
        bpm: bpm,
        key: key,
        camelotKey: camelotKey,
        duration: duration,
        level: Math.floor(Math.random() * 30) + 70,
        albumArt: null
      });
    }
    
    return mockTracks;
  };

  useEffect(() => {
    const generatedTracks = generateTracks();
    setTracks(generatedTracks);
    setGameState('ready');
  }, [challengeConfig]);

  useEffect(() => {
    let timer;
    if (isGameActive && timeRemaining > 0) {
      timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            setIsGameActive(false);
            setGameState('finished');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isGameActive, timeRemaining]);

  const startGame = () => {
    setGameState('playing');
    setIsGameActive(true);
  };

  const handleTrackPlayPause = (trackId) => {
    console.log(`Track ${trackId} play/pause`);
  };

  const handleTimeUpdate = (trackId, newTime) => {
    console.log(`Track ${trackId} time update: ${newTime}`);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const calculateScore = () => {
    const baseScore = 1000;
    const timeBonus = Math.floor((300 - timeRemaining) / 30) * 100;
    const trackBonus = tracks.length * 200;
    return baseScore + timeBonus + trackBonus;
  };

  const isHarmonicallyCompatible = (trackKey, masterKey) => {
    // Simple harmonic compatibility check
    const compatibleKeys = {
      'C': ['C', 'F', 'G', 'Am'],
      'C#': ['C#', 'F#', 'G#', 'A#m'],
      'D': ['D', 'G', 'A', 'Bm'],
      'D#': ['D#', 'G#', 'A#', 'Cm'],
      'E': ['E', 'A', 'B', 'C#m'],
      'F': ['F', 'Bb', 'C', 'Dm'],
      'F#': ['F#', 'B', 'C#', 'D#m'],
      'G': ['G', 'C', 'D', 'Em'],
      'G#': ['G#', 'C#', 'D#', 'Fm'],
      'A': ['A', 'D', 'E', 'F#m'],
      'A#': ['A#', 'D#', 'F', 'Gm'],
      'B': ['B', 'E', 'F#', 'G#m']
    };
    return compatibleKeys[masterKey]?.includes(trackKey) || false;
  };

  if (gameState === 'loading') {
    return (
      <div className="rekordbox-app">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <h2>Loading Rekordbox Performance Mode...</h2>
          <p>Preparing your DJ interface</p>
        </div>
      </div>
    );
  }

  if (gameState === 'finished') {
    const finalScore = calculateScore();
    return (
      <div className="rekordbox-app">
        <div className="game-header">
          <h1>Challenge Complete!</h1>
          <button className="back-btn" onClick={onBackToDashboard}>
            ← Back to Dashboard
          </button>
        </div>
        
        <div className="results-screen">
          <div className="score-display">
            <h2>Final Score</h2>
            <div className="score-number">{finalScore}</div>
            <div className="score-breakdown">
              <div className="score-item">
                <span>Base Score:</span>
                <span>1000</span>
              </div>
              <div className="score-item">
                <span>Time Bonus:</span>
                <span>+{Math.floor((300 - timeRemaining) / 30) * 100}</span>
              </div>
              <div className="score-item">
                <span>Track Bonus:</span>
                <span>+{tracks.length * 200}</span>
              </div>
            </div>
          </div>
          
          <div className="challenge-summary">
            <h3>Challenge Summary</h3>
            <div className="summary-grid">
              <div className="summary-item">
                <span className="summary-label">Tracks Mixed:</span>
                <span className="summary-value">{tracks.length}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Genre:</span>
                <span className="summary-value">{challengeConfig.genre}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">BPM Range:</span>
                <span className="summary-value">{challengeConfig.bpmLabel}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Time Used:</span>
                <span className="summary-value">{formatTime(300 - timeRemaining)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'ready') {
    return (
      <div className="rekordbox-app">
        <div className="game-header">
          <div className="header-left">
            <h1>Blind Blend Challenge</h1>
            <div className="challenge-info">
              <span className="info-item">Genre: {challengeConfig.genre}</span>
              <span className="info-item">BPM: {challengeConfig.bpmLabel}</span>
              <span className="info-item">Tracks: {tracks.length}</span>
            </div>
          </div>
          
          <div className="header-right">
            <div className="game-timer">
              <span className="timer-label">Time Remaining</span>
              <span className="timer-value">{formatTime(timeRemaining)}</span>
            </div>
            <div className="game-score">
              <span className="score-label">Score</span>
              <span className="score-value">{score}</span>
            </div>
            <button className="back-btn" onClick={onBackToDashboard}>
              ← Back
            </button>
          </div>
        </div>

        <div className="game-start-screen">
          <div className="start-content">
            <h2>Ready to Start?</h2>
            <p>You'll be mixing {tracks.length} {challengeConfig.genre} tracks</p>
            <div className="track-preview">
              {tracks.map((track, index) => (
                <div key={track.id} className="preview-track">
                  <span className="track-number">Track {index + 1}</span>
                  <span className="track-bpm">{track.bpm} BPM</span>
                  <span className="track-key">Key: {track.camelotKey}</span>
                </div>
              ))}
            </div>
            <div className="controller-notice">
              <div className="notice-icon">🎛️</div>
              <h3>Connect Your DJ Controller</h3>
              <p>Make sure your Pioneer DDJ controller is connected and ready for the challenge!</p>
            </div>
            <button className="start-game-btn" onClick={startGame}>
              Start Challenge
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rekordbox-app">
      {/* Game Header */}
      <div className="game-header">
        <div className="header-left">
          <h1>Blind Blend Challenge</h1>
          <div className="challenge-info">
            <span className="info-item">Genre: {challengeConfig.genre}</span>
            <span className="info-item">BPM: {challengeConfig.bpmLabel}</span>
            <span className="info-item">Tracks: {tracks.length}</span>
          </div>
        </div>
        
        <div className="header-right">
          <div className="game-timer">
            <span className="timer-label">Time Remaining</span>
            <span className="timer-value">{formatTime(timeRemaining)}</span>
          </div>
          <div className="game-score">
            <span className="score-label">Score</span>
            <span className="score-value">{score}</span>
          </div>
          <button className="back-btn" onClick={onBackToDashboard}>
            ← Back
          </button>
        </div>
      </div>

      {/* Main Game Interface */}
      <div className="game-interface">
        <div className="tracks-container">
          {tracks.map((track, index) => (
            <div key={track.id} className={`track-section ${masterDeck === index + 1 ? 'master' : ''}`}>
              {/* Track Info */}
              <div className="track-info-section">
                <div className="album-art">
                  <div className="placeholder-art"></div>
                </div>
                <div className="track-details">
                  <div className="track-title">{track.name}</div>
                  <div className="track-artist">{track.artist}</div>
                </div>
              </div>

              {/* Tall Waveform */}
              <div className="tall-waveform">
                <TrackWaveform
                  track={track}
                  isPlaying={currentTrackIndex === index && isGameActive}
                  currentTime={0}
                  duration={track?.duration || 0}
                  onTimeUpdate={(time) => handleTimeUpdate(track?.id, time)}
                  onPlayPause={() => handleTrackPlayPause(track?.id)}
                  deckNumber={index + 1}
                  isMaster={masterDeck === index + 1}
                />
              </div>

              {/* Beatpad */}
              <div className="beatpad-section">
                <div className="beatpad-grid">
                  {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((pad) => (
                    <button key={pad} className="beatpad-button">
                      {pad}
                    </button>
                  ))}
                </div>
                <div className="beatpad-mode">
                  <select className="mode-selector">
                    <option>HOT CUE</option>
                    <option>BEAT JUMP</option>
                    <option>SAMPLER</option>
                    <option>PAD FX</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Center Mixer Section */}
        <div className="center-mixer">
          <div className="mixer-channels">
            {tracks.map((track, index) => (
              <div key={track.id} className="mixer-channel">
                <div className="channel-header">
                  <span className="channel-label">CH {index + 1}</span>
                </div>
                
                <div className="channel-controls">
                  <div className="hi-eq-knob">
                    <div className="knob-label">HI</div>
                    <div className="knob"></div>
                  </div>
                  
                  <div className="mid-eq-knob">
                    <div className="knob-label">MID</div>
                    <div className="knob"></div>
                  </div>
                  
                  <div className="low-eq-knob">
                    <div className="knob-label">LOW</div>
                    <div className="knob"></div>
                  </div>
                  
                  <div className="filter-knob">
                    <div className="knob-label">FILTER</div>
                    <div className="knob blue"></div>
                  </div>
                  
                  <div className="channel-fader">
                    <div className="fader-track">
                      <div className="fader-handle" style={{ bottom: '60%' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="master-section">
            <div className="master-controls">
              <div className="crossfader">
                <div className="fader-track horizontal">
                  <div className="fader-handle" style={{ left: '50%' }}></div>
                </div>
              </div>
              
              <div className="master-level">
                <div className="knob-label">MASTER</div>
                <div className="knob"></div>
              </div>
              
              <div className="headphone-controls">
                <div className="hp-knob">
                  <div className="knob-label">HP</div>
                  <div className="knob"></div>
                </div>
                <div className="cue-mix-knob">
                  <div className="knob-label">CUE/MIX</div>
                  <div className="knob"></div>
                </div>
              </div>
              
              <div className="master-meter">
                <div className="meter-bar stereo" style={{ height: '80%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>


    </div>
  );
};

export default BlindBlendGame; 