import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { TrackService } from '../services/trackService';
import WaveformThumbnail from './WaveformThumbnail';
import TrackPlayer from './TrackPlayer';
import './TrackLibraryPage.css';

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
  { label: 'C', value: 'C' },
  { label: 'C#', value: 'C#' },
  { label: 'D', value: 'D' },
  { label: 'D#', value: 'D#' },
  { label: 'E', value: 'E' },
  { label: 'F', value: 'F' },
  { label: 'F#', value: 'F#' },
  { label: 'G', value: 'G' },
  { label: 'G#', value: 'G#' },
  { label: 'A', value: 'A' },
  { label: 'A#', value: 'A#' },
  { label: 'B', value: 'B' }
];

const KEY_COLORS = {
  'C': '#FF6B6B', 'C#': '#4ECDC4', 'D': '#45B7D1',
  'D#': '#96CEB4', 'E': '#FFEAA7', 'F': '#DDA0DD',
  'F#': '#98D8C8', 'G': '#F7DC6F', 'G#': '#BB8FCE',
  'A': '#85C1E9', 'A#': '#F8C471', 'B': '#82E0AA'
};

const getKeyColor = (key) => KEY_COLORS[key] || '#00AEEF';

const getBPMColor = (bpm) => {
  if (bpm < 100) return '#FF6B6B';
  if (bpm < 120) return '#FF8E53';
  if (bpm < 130) return '#FFEAA7';
  if (bpm < 140) return '#4ECDC4';
  return '#BB8FCE';
};

const formatDuration = (seconds) => {
  if (!seconds) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const getDateAdded = (track) => {
  if (track.createdAt?.toDate) return track.createdAt.toDate();
  if (track.createdAt) return new Date(track.createdAt);
  if (track.analysisDate) return new Date(track.analysisDate);
  return null;
};

const COLUMNS = [
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'album', label: 'Album' },
  { key: 'bpm', label: 'BPM' },
  { key: 'key', label: 'Key' },
  { key: 'date', label: 'Date Added' },
  { key: 'duration', label: 'Duration' }
];

const TrackLibraryPage = () => {
  const { currentUser } = useAuth();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBPM, setFilterBPM] = useState('');
  const [filterKey, setFilterKey] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedTrack, setSelectedTrack] = useState(null);

  useEffect(() => {
    let ignore = false;

    if (!currentUser) {
      setTracks([]);
      return;
    }

    setLoading(true);
    TrackService.getUserTracks(currentUser.uid)
      .then(result => {
        if (!ignore) setTracks(result);
      })
      .catch(error => console.error('Error loading tracks from Firestore:', error))
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [currentUser]);

  const filteredTracks = useMemo(() => {
    let result = [...tracks];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(track =>
        (track.fileName || '').toLowerCase().includes(term) ||
        (track.artist || '').toLowerCase().includes(term)
      );
    }

    if (filterBPM) {
      const [minBPM, maxBPM] = filterBPM.split('-').map(Number);
      result = result.filter(track => track.bpm >= minBPM && track.bpm <= maxBPM);
    }

    if (filterKey) {
      result = result.filter(track => track.key === filterKey || track.camelot === filterKey);
    }

    result.sort((a, b) => {
      let aValue, bValue;
      switch (sortBy) {
        case 'title':
          aValue = (a.fileName || '').toLowerCase();
          bValue = (b.fileName || '').toLowerCase();
          break;
        case 'artist':
          aValue = (a.artist || '').toLowerCase();
          bValue = (b.artist || '').toLowerCase();
          break;
        case 'album':
          aValue = (a.album || '').toLowerCase();
          bValue = (b.album || '').toLowerCase();
          break;
        case 'bpm':
          aValue = a.bpm || 0;
          bValue = b.bpm || 0;
          break;
        case 'key':
          aValue = (a.key || '') + (a.mode || '');
          bValue = (b.key || '') + (b.mode || '');
          break;
        case 'duration':
          aValue = a.duration || 0;
          bValue = b.duration || 0;
          break;
        case 'date':
        default:
          aValue = getDateAdded(a) || 0;
          bValue = getDateAdded(b) || 0;
      }

      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      return 0;
    });

    return result;
  }, [tracks, searchTerm, filterBPM, filterKey, sortBy, sortOrder]);

  const handleSort = (columnKey) => {
    if (sortBy === columnKey) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnKey);
      setSortOrder('asc');
    }
  };

  if (!currentUser) {
    return (
      <div className="track-library-page">
        <div className="library-empty-state">
          <h2>Sign in to view your track library</h2>
          <p>Analyzed tracks you save are stored under your account.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="track-library-page">
      <div className="library-header">
        <h1>Track Library</h1>
        <span className="library-track-count">{filteredTracks.length} tracks</span>
      </div>

      <div className="library-toolbar">
        <input
          type="text"
          placeholder="Search by title or artist..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="library-search-input"
        />

        <select
          value={filterBPM}
          onChange={(e) => setFilterBPM(e.target.value)}
          className="library-filter-select"
        >
          {bpmRanges.map(range => (
            <option key={range.value} value={range.value}>{range.label}</option>
          ))}
        </select>

        <select
          value={filterKey}
          onChange={(e) => setFilterKey(e.target.value)}
          className="library-filter-select"
        >
          {keyOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="library-loading">Loading tracks...</div>
      ) : filteredTracks.length === 0 ? (
        <div className="library-empty-state">
          <h2>No tracks yet</h2>
          <p>Analyze your first track to start building your library.</p>
          <Link to="/analyze" className="library-empty-cta">Analyze a Track</Link>
        </div>
      ) : (
        <div className="library-table-wrapper">
          <table className="library-table">
            <thead>
              <tr>
                <th className="waveform-col">Waveform</th>
                {COLUMNS.map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)} className="sortable-col">
                    {col.label}
                    {sortBy === col.key && (
                      <span className="sort-indicator">{sortOrder === 'asc' ? ' ↑' : ' ↓'}</span>
                    )}
                  </th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTracks.map(track => {
                const dateAdded = getDateAdded(track);
                return (
                  <tr key={track.trackID}>
                    <td className="waveform-col">
                      <WaveformThumbnail track={track} />
                    </td>
                    <td className="title-col">{track.fileName || 'Unknown Track'}</td>
                    <td>{track.artist || 'Unknown Artist'}</td>
                    <td>{track.album || '—'}</td>
                    <td>
                      <span className="bpm-badge" style={{ backgroundColor: getBPMColor(track.bpm) }}>
                        {track.bpm || '—'}
                      </span>
                    </td>
                    <td>
                      <span className="key-badge" style={{ color: getKeyColor(track.key) }}>
                        {track.key || '—'} {track.camelot ? `(${track.camelot})` : ''}
                      </span>
                    </td>
                    <td>{dateAdded ? dateAdded.toLocaleDateString() : '—'}</td>
                    <td>{formatDuration(track.duration)}</td>
                    <td>
                      <button className="preview-btn" onClick={() => setSelectedTrack(track)}>
                        ▶ Preview
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedTrack && (
        <TrackPlayer
          track={selectedTrack}
          onClose={() => setSelectedTrack(null)}
        />
      )}
    </div>
  );
};

export default TrackLibraryPage;
