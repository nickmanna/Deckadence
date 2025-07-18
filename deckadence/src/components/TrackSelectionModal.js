import React, { useState } from 'react';
import './TrackSelectionModal.css';

const TrackSelectionModal = ({ isOpen, onClose, onStartChallenge }) => {
  const [selectedTrackCount, setSelectedTrackCount] = useState(2);
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedBPM, setSelectedBPM] = useState('');

  const trackCountOptions = [2, 3, 4];
  
  const genreOptions = [
    'House',
    'Techno',
    'Trance',
    'Drum & Bass',
    'Dubstep',
    'Progressive House',
    'Deep House',
    'Tech House',
    'Electro',
    'Breaks',
    'Hardstyle',
    'Trap',
    'Future Bass',
    'Ambient',
    'Chillout'
  ];

  const bpmRanges = [
    { label: 'Slow (120-130 BPM)', value: 'slow', range: '120-130' },
    { label: 'Medium (130-140 BPM)', value: 'medium', range: '130-140' },
    { label: 'Fast (140-150 BPM)', value: 'fast', range: '140-150' },
    { label: 'Very Fast (150-160 BPM)', value: 'very-fast', range: '150-160' },
    { label: 'Any BPM', value: 'any', range: '120-160' }
  ];

  const handleStartChallenge = () => {
    if (!selectedGenre || !selectedBPM) {
      alert('Please select both a genre and BPM range to continue.');
      return;
    }

    const challengeConfig = {
      trackCount: selectedTrackCount,
      genre: selectedGenre,
      bpmRange: selectedBPM,
      bpmLabel: bpmRanges.find(bpm => bpm.value === selectedBPM)?.label || 'Any BPM'
    };

    onStartChallenge(challengeConfig);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="track-selection-modal">
        <div className="modal-header">
          <h2>Blind Blend Challenge Setup</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          {/* Track Count Selection */}
          <div className="selection-section">
            <h3>Number of Channels</h3>
            <p>Choose how many channels you want to mix in this challenge:</p>
            <div className="track-count-options">
              {trackCountOptions.map(count => (
                <button
                  key={count}
                  className={`track-count-btn ${selectedTrackCount === count ? 'selected' : ''}`}
                  onClick={() => setSelectedTrackCount(count)}
                >
                  <span className="count-number">{count}</span>
                  <span className="count-label">Channels</span>
                </button>
              ))}
            </div>
          </div>

          {/* Genre Selection */}
          <div className="selection-section">
            <h3>Genre</h3>
            <p>Select a genre for your challenge tracks:</p>
            <div className="genre-grid">
              {genreOptions.map(genre => (
                <button
                  key={genre}
                  className={`genre-btn ${selectedGenre === genre ? 'selected' : ''}`}
                  onClick={() => setSelectedGenre(genre)}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>

          {/* BPM Selection */}
          <div className="selection-section">
            <h3>BPM Range</h3>
            <p>Choose the tempo range for your tracks:</p>
            <div className="bpm-options">
              {bpmRanges.map(bpm => (
                <button
                  key={bpm.value}
                  className={`bpm-btn ${selectedBPM === bpm.value ? 'selected' : ''}`}
                  onClick={() => setSelectedBPM(bpm.value)}
                >
                  <span className="bpm-label">{bpm.label}</span>
                  <span className="bpm-range">{bpm.range}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Challenge Preview */}
          <div className="challenge-preview">
            <h3>Challenge Summary</h3>
            <div className="preview-content">
              <div className="preview-item">
                <span className="preview-label">Channels:</span>
                <span className="preview-value">{selectedTrackCount}</span>
              </div>
              <div className="preview-item">
                <span className="preview-label">Genre:</span>
                <span className="preview-value">{selectedGenre || 'Not selected'}</span>
              </div>
              <div className="preview-item">
                <span className="preview-label">BPM:</span>
                <span className="preview-value">
                  {bpmRanges.find(bpm => bpm.value === selectedBPM)?.label || 'Not selected'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="start-challenge-btn"
            onClick={handleStartChallenge}
            disabled={!selectedGenre || !selectedBPM}
          >
            Start Blind Blend Challenge
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrackSelectionModal; 