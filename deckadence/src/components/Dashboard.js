import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { TrackService } from '../services/trackService';
import TrackSelectionModal from './TrackSelectionModal';
import BlindBlendGame from './BlindBlendGame';
import AudioUploader from './AudioUploader';
import TrackLibrary from './TrackLibrary';
import AuthModal from './AuthModal';
import './Dashboard.css';

const Dashboard = ({ isGuest, onLogout, onShowAuth, onSignIn, onSignUp }) => {
  const [activeTab, setActiveTab] = useState('blind-blend');
  const [showTrackSelection, setShowTrackSelection] = useState(false);
  const [showAudioUploader, setShowAudioUploader] = useState(false);
  const [showTrackLibrary, setShowTrackLibrary] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [challengeConfig, setChallengeConfig] = useState(null);
  const [gameState, setGameState] = useState('dashboard'); // dashboard, game
  const [analyzedTracks, setAnalyzedTracks] = useState([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [userStats, setUserStats] = useState(null);
  
  const { currentUser } = useAuth();

  const tabs = [
    { id: 'discover', label: 'Discover', icon: '🎵', restricted: true },
    { id: 'create', label: 'Create', icon: '🎧', restricted: true },
    { id: 'blind-blend', label: 'Blind Blend', icon: '🎚️', restricted: false }
  ];

  const handleTabClick = (tabId) => {
    const tab = tabs.find(t => t.id === tabId);
    if (isGuest && tab.restricted) {
      // Show a message or prevent access for restricted tabs
      alert('This feature requires a premium account. Sign up to unlock all features!');
      return;
    }
    setActiveTab(tabId);
  };

  const handleStartBlindBlend = () => {
    setShowTrackSelection(true);
  };

  const handleCloseTrackSelection = () => {
    setShowTrackSelection(false);
  };

  const handleShowAudioUploader = () => {
    setShowAudioUploader(true);
  };

  const handleCloseAudioUploader = () => {
    setShowAudioUploader(false);
  };

  const handleShowTrackLibrary = () => {
    setShowTrackLibrary(true);
  };

  const handleCloseTrackLibrary = () => {
    setShowTrackLibrary(false);
  };

  // Load user tracks from Firestore
  const loadUserTracks = async () => {
    if (!currentUser || isGuest) return;
    
    setLoadingTracks(true);
    try {
      const tracks = await TrackService.getUserTracks(currentUser.uid);
      setAnalyzedTracks(tracks);
      
      // Load user stats
      const stats = await TrackService.getUserStats(currentUser.uid);
      setUserStats(stats);
    } catch (error) {
      console.error('Error loading tracks:', error);
    } finally {
      setLoadingTracks(false);
    }
  };

  // Load tracks when user changes or component mounts
  useEffect(() => {
    loadUserTracks();
  }, [currentUser, isGuest]);

  const handleTrackAnalyzed = (trackData) => {
    setAnalyzedTracks(prev => [...prev, trackData]);
    // Reload tracks to get the latest data
    loadUserTracks();
  };

  const handleShowAuthModal = () => {
    setShowAuthModal(true);
  };

  const handleCloseAuthModal = () => {
    setShowAuthModal(false);
  };

  const handleAuthSignIn = () => {
    onSignIn();
    setShowAuthModal(false);
  };

  const handleAuthSignUp = () => {
    onSignUp();
    setShowAuthModal(false);
  };

  const handleStartChallenge = (config) => {
    setChallengeConfig(config);
    setShowTrackSelection(false);
    setGameState('game');
  };

  const handleBackToDashboard = () => {
    setGameState('dashboard');
    setChallengeConfig(null);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'discover':
        return (
          <div className="tab-content">
            <h2>Discover New Music</h2>
            <p>Explore trending tracks, genres, and DJ sets from around the world.</p>
            <div className="feature-placeholder">
              <div className="placeholder-item">
                <h3>Trending Tracks</h3>
                <p>Latest hits and popular songs</p>
              </div>
              <div className="placeholder-item">
                <h3>Genre Explorer</h3>
                <p>Browse by music genre</p>
              </div>
              <div className="placeholder-item">
                <h3>DJ Sets</h3>
                <p>Professional DJ performances</p>
              </div>
            </div>
          </div>
        );
      
      case 'create':
        return (
          <div className="tab-content">
            <h2>Create Your Mix</h2>
            <p>Build your own DJ set with our intuitive mixing tools and track analysis.</p>
            <div className="create-content">
              <div className="create-section">
                <h3>Track Analysis</h3>
                <p>Upload and analyze your audio files to get BPM, key, and beatgrid information.</p>
                <button className="upload-btn" onClick={handleShowAudioUploader}>
                  📤 Upload & Analyze Track
                </button>
              </div>
              
              <div className="create-section">
                <h3>Track Library</h3>
                <p>Browse and manage your analyzed tracks with advanced filtering and search.</p>
                <button className="library-btn" onClick={handleShowTrackLibrary}>
                  📚 Open Track Library
                </button>
                {analyzedTracks.length > 0 && (
                  <span className="track-count">({analyzedTracks.length} tracks analyzed)</span>
                )}
              </div>
              
              <div className="create-section">
                <h3>Mixing Tools</h3>
                <p>Professional DJ controls for seamless mixing and transitions.</p>
                <div className="feature-placeholder">
                  <div className="placeholder-item">
                    <h4>Waveform Visualization</h4>
                    <p>Color-coded frequency analysis</p>
                  </div>
                  <div className="placeholder-item">
                    <h4>Beatgrid Alignment</h4>
                    <p>Precise beat matching</p>
                  </div>
                  <div className="placeholder-item">
                    <h4>Key Compatibility</h4>
                    <p>Harmonic mixing assistance</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'blind-blend':
        return (
          <div className="tab-content">
            <h2>Blind Blend Challenge</h2>
            <p>Test your DJ skills by mixing tracks without knowing what's coming next!</p>
            <div className="blind-blend-content">
              <div className="challenge-info">
                <h3>How it works:</h3>
                <ul>
                  <li>🎵 Tracks are selected randomly</li>
                  <li>🎚️ You control the mixing in real-time</li>
                  <li>⏱️ Limited time to blend tracks</li>
                  <li>🏆 Score based on smoothness and creativity</li>
                </ul>
              </div>
              <div className="game-controls">
                <button className="start-game-btn" onClick={handleStartBlindBlend}>
                  Start Blind Blend Challenge
                </button>
                <button className="practice-btn">
                  Practice Mode
                </button>
              </div>
              {isGuest && (
                <div className="guest-notice">
                  <p>🎉 You're in guest mode! Sign up for full access to Discover and Create features.</p>
                </div>
              )}
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  // Show the game if we're in game state
  if (gameState === 'game' && challengeConfig) {
    return (
      <BlindBlendGame 
        challengeConfig={challengeConfig}
        onBackToDashboard={handleBackToDashboard}
      />
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="header-left">
          <h1 className="dashboard-title">Deckadence</h1>
          <span className="user-status">
            {isGuest ? 'Guest Mode' : 'Premium User'}
          </span>
        </div>
        {isGuest ? (
          <div className="auth-buttons">
            <button className="login-btn" onClick={handleShowAuthModal}>
              Login
            </button>
            <button className="signup-btn" onClick={handleShowAuthModal}>
              Sign Up
            </button>
          </div>
        ) : (
          <button className="logout-btn" onClick={onLogout}>
            Logout
          </button>
        )}
      </div>

      <div className="dashboard-content">
        <div className="tab-navigation">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''} ${
                isGuest && tab.restricted ? 'restricted' : ''
              }`}
              onClick={() => handleTabClick(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
              {isGuest && tab.restricted && (
                <span className="restricted-badge">🔒</span>
              )}
            </button>
          ))}
        </div>

        <div className="tab-container">
          {renderTabContent()}
        </div>
      </div>

      {/* Track Selection Modal */}
      <TrackSelectionModal
        isOpen={showTrackSelection}
        onClose={handleCloseTrackSelection}
        onStartChallenge={handleStartChallenge}
      />

      {/* Audio Uploader Modal */}
      <AudioUploader
        isOpen={showAudioUploader}
        onClose={handleCloseAudioUploader}
        onTrackAnalyzed={handleTrackAnalyzed}
      />

      {/* Track Library Modal */}
      <TrackLibrary
        tracks={analyzedTracks}
        isOpen={showTrackLibrary}
        onClose={handleCloseTrackLibrary}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={handleCloseAuthModal}
        onSignIn={handleAuthSignIn}
        onSignUp={handleAuthSignUp}
      />
    </div>
  );
};

export default Dashboard; 