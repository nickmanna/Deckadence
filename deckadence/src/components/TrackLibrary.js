import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { TrackService } from '../services/trackService';
import TrackPlayer from './TrackPlayer';
import './TrackLibrary.css';

const TrackLibrary = ({ tracks = [], isOpen, onClose }) => {
  const [filteredTracks, setFilteredTracks] = useState(tracks);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBPM, setFilterBPM] = useState('');
  const [filterKey, setFilterKey] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userStats, setUserStats] = useState(null);
  
  const { currentUser } = useAuth();

  // Mock tracks for demonstration
  const mockTracks = [
    {
      id: 1,
      fileName: 'SpotiDownloader.com - Baddadan (feat. IRAH, Flowdan, Trigga & Takura) - Chase & Status.mp3',
      bpm: 88,
      key: 'C#',
      mode: 'minor',
      camelot: '1A',
      duration: 177,
      confidence: { bpm: 0.94, key: 0.86 },
      analysisDate: '2024-01-15T10:30:00Z',
      waveformData: { times: [], amplitudes: [], colors: [] },
      beatgrid: []
    },
    {
      id: 2,
      fileName: 'Deep House Groove.mp3',
      bpm: 128,
      key: 'A',
      mode: 'minor',
      camelot: '8A',
      duration: 245,
      confidence: { bpm: 0.95, key: 0.88 },
      analysisDate: '2024-01-14T15:45:00Z',
      waveformData: { times: [], amplitudes: [], colors: [] },
      beatgrid: []
    },
    {
      id: 3,
      fileName: 'Tech House Beat.mp3',
      bpm: 130,
      key: 'F',
      mode: 'major',
      camelot: '7B',
      duration: 312,
      confidence: { bpm: 0.92, key: 0.85 },
      analysisDate: '2024-01-13T09:20:00Z',
      waveformData: { times: [], amplitudes: [], colors: [] },
      beatgrid: []
    },
    {
      id: 4,
      fileName: 'Progressive Trance.mp3',
      bpm: 138,
      key: 'C',
      mode: 'major',
      camelot: '8B',
      duration: 456,
      confidence: { bpm: 0.89, key: 0.82 },
      analysisDate: '2024-01-12T14:15:00Z',
      waveformData: { times: [], amplitudes: [], colors: [] },
      beatgrid: []
    }
  ];

  // Load tracks from Firestore if user is authenticated
  const loadTracksFromFirestore = async () => {
    if (!currentUser) return;
    
    setLoading(true);
    try {
      const firestoreTracks = await TrackService.getUserTracks(currentUser.uid);
      setFilteredTracks(firestoreTracks);
      
      // Load user stats
      const stats = await TrackService.getUserStats(currentUser.uid);
      setUserStats(stats);
    } catch (error) {
      console.error('Error loading tracks from Firestore:', error);
    } finally {
      setLoading(false);
    }
  };

  // Use useMemo to prevent recreation of allTracks on every render
  const allTracks = React.useMemo(() => {
    if (currentUser && tracks.length === 0) {
      // Load from Firestore if no tracks provided and user is authenticated
      loadTracksFromFirestore();
      return [];
    }
    return tracks.length > 0 ? tracks : mockTracks;
  }, [tracks, currentUser]);

  useEffect(() => {
    let filtered = [...allTracks];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(track =>
        track.fileName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply BPM filter
    if (filterBPM) {
      const [minBPM, maxBPM] = filterBPM.split('-').map(Number);
      filtered = filtered.filter(track => 
        track.bpm >= minBPM && track.bpm <= maxBPM
      );
    }

    // Apply key filter
    if (filterKey) {
      filtered = filtered.filter(track => 
        track.key === filterKey || track.camelot === filterKey
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'name':
          aValue = a.fileName.toLowerCase();
          bValue = b.fileName.toLowerCase();
          break;
        case 'bpm':
          aValue = a.bpm;
          bValue = b.bpm;
          break;
        case 'key':
          aValue = a.key + a.mode;
          bValue = b.key + b.mode;
          break;
        case 'duration':
          aValue = a.duration;
          bValue = b.duration;
          break;
        case 'date':
          aValue = new Date(a.analysisDate);
          bValue = new Date(b.analysisDate);
          break;
        default:
          aValue = a.fileName.toLowerCase();
          bValue = b.fileName.toLowerCase();
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredTracks(filtered);
  }, [allTracks, searchTerm, filterBPM, filterKey, sortBy, sortOrder]);

  const handleTrackClick = (track) => {
    setSelectedTrack(track);
  };

  const handleClosePlayer = () => {
    setSelectedTrack(null);
  };

  const formatDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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

  const getBPMColor = (bpm) => {
    if (bpm < 100) return '#FF6B6B'; // Very Slow
    if (bpm < 120) return '#FF8E53'; // Slow
    if (bpm < 130) return '#FFEAA7'; // Medium
    if (bpm < 140) return '#4ECDC4'; // Fast
    return '#BB8FCE'; // Very Fast
  };

  const bpmRanges = [
    { label: 'All BPM', value: '' },
    { label: 'Very Slow (80-100)', value: '80-100' },
    { label: 'Slow (100-120)', value: '100-120' },
    { label: 'Medium (120-130)', value: '120-130' },
    { label: 'Fast (130-140)', value: '130-140' },
    { label: 'Very Fast (140+)', value: '140-200' }
  ];

  const keyOptions = [
    { label: 'All Keys', value: '' },
    { label: 'C Major', value: 'C' },
    { label: 'C# Major', value: 'C#' },
    { label: 'D Major', value: 'D' },
    { label: 'D# Major', value: 'D#' },
    { label: 'E Major', value: 'E' },
    { label: 'F Major', value: 'F' },
    { label: 'F# Major', value: 'F#' },
    { label: 'G Major', value: 'G' },
    { label: 'G# Major', value: 'G#' },
    { label: 'A Major', value: 'A' },
    { label: 'A# Major', value: 'A#' },
    { label: 'B Major', value: 'B' }
  ];

  if (!isOpen) return null;

  return (
    <div className="track-library-overlay">
      <div className="track-library-modal">
        <div className="library-header">
          <div className="header-left">
            <h2>Track Library</h2>
            <span className="track-count">{filteredTracks.length} tracks</span>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="library-content">
          {/* Filters */}
          <div className="filters-section">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search tracks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>

            <div className="filter-controls">
              <div className="filter-group">
                <label>BPM Range:</label>
                <select
                  value={filterBPM}
                  onChange={(e) => setFilterBPM(e.target.value)}
                  className="filter-select"
                >
                  {bpmRanges.map(range => (
                    <option key={range.value} value={range.value}>
                      {range.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>Key:</label>
                <select
                  value={filterKey}
                  onChange={(e) => setFilterKey(e.target.value)}
                  className="filter-select"
                >
                  {keyOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="filter-select"
                >
                  <option value="name">Name</option>
                  <option value="bpm">BPM</option>
                  <option value="key">Key</option>
                  <option value="duration">Duration</option>
                  <option value="date">Date</option>
                </select>
              </div>

              <button
                className="sort-order-btn"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>

          {/* Track Grid */}
          <div className="tracks-grid">
            {filteredTracks.length === 0 ? (
              <div className="no-tracks">
                <div className="no-tracks-icon">🎵</div>
                <h3>No tracks found</h3>
                <p>Try adjusting your search or filters</p>
              </div>
            ) : (
              filteredTracks.map(track => (
                <div
                  key={track.trackID}
                  className="track-card"
                  onClick={() => handleTrackClick(track)}
                >
                  <div className="track-card-header">
                    <div className="track-icon">🎵</div>
                    <div className="track-title">
                      <h4>{track.fileName}</h4>
                      <span className="track-duration">
                        {formatDuration(track.duration)}
                      </span>
                    </div>
                  </div>

                  <div className="track-metadata">
                    <div className="metadata-item">
                      <span 
                        className="bpm-badge"
                        style={{ backgroundColor: getBPMColor(track.bpm) }}
                      >
                        {track.bpm} BPM
                      </span>
                    </div>
                    <div className="metadata-item">
                      <span 
                        className="key-badge"
                        style={{ color: getKeyColor(track.key, track.mode) }}
                      >
                        {track.key} {track.mode} ({track.camelot})
                      </span>
                    </div>
                  </div>

                  <div className="confidence-indicators">
                    <div className="confidence-item">
                      <span className="confidence-label">BPM</span>
                      <div className="confidence-bar">
                        <div 
                          className="confidence-fill"
                          style={{ width: `${track.confidence.bpm * 100}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="confidence-item">
                      <span className="confidence-label">Key</span>
                      <div className="confidence-bar">
                        <div 
                          className="confidence-fill"
                          style={{ width: `${track.confidence.key * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  <div className="track-footer">
                    <span className="analysis-date">
                      {new Date(track.analysisDate).toLocaleDateString()}
                    </span>
                    <button className="play-btn">▶️</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Track Player Modal */}
      {selectedTrack && (
        <TrackPlayer
          track={selectedTrack}
          onClose={handleClosePlayer}
        />
      )}
    </div>
  );
};

export default TrackLibrary; 