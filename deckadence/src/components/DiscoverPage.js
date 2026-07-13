import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTrackCache } from '../contexts/TrackCacheContext';
import { FEATURES } from '../config/features';
import './DiscoverPage.css';

const QUICK_LINKS = [
  { to: '/analyze', title: 'Track Analysis', description: 'Upload a track and get BPM, key, and beatgrid.' },
  { to: '/library', title: 'Track Library', description: 'Browse and preview your analyzed tracks.' },
  { to: '/green-room', title: 'Green Room', description: 'Practice mixing in the studio.', flag: 'greenRoom' },
  { to: '/games', title: 'Games', description: 'Test your DJ skills.', flag: 'games' }
];

const DiscoverPage = () => {
  const { currentUser } = useAuth();
  // Stats are derived from the same cached track list Library/Green Room
  // already read - no dedicated fetch needed here anymore (see
  // TrackCacheContext). `loading` gates the stats block exactly like the
  // old dedicated-fetch version did, so it doesn't flash "0 tracks" while
  // the very first load of a session is still in flight.
  const { stats, loading } = useTrackCache();

  return (
    <div className="discover-page">
      <section className="discover-hero">
        <h1>
          {currentUser ? `Welcome back, ${currentUser.displayName || currentUser.email}` : 'Welcome to Deckadence'}
        </h1>
        <p className="discover-subtitle">The first step in learning to DJ</p>

        {currentUser && !loading && (
          <div className="discover-stats">
            <div className="discover-stat">
              <span className="discover-stat-value">{stats.totalTracks}</span>
              <span className="discover-stat-label">Tracks Analyzed</span>
            </div>
            <div className="discover-stat">
              <span className="discover-stat-value">{Math.round(stats.averageBPM) || '—'}</span>
              <span className="discover-stat-label">Average BPM</span>
            </div>
            <div className="discover-stat">
              <span className="discover-stat-value">{stats.totalLikes}</span>
              <span className="discover-stat-label">Likes</span>
            </div>
          </div>
        )}

        {!currentUser && (
          <p className="discover-guest-notice">
            Browsing as a guest — sign in to save tracks to your own library.
          </p>
        )}
      </section>

      <section className="discover-quick-links">
        {QUICK_LINKS.map(link => {
          const disabled = link.flag && !FEATURES[link.flag];
          return (
            <Link
              key={link.to}
              to={link.to}
              className={`discover-quick-link${disabled ? ' disabled' : ''}`}
            >
              <div className="discover-quick-link-header">
                <h3>{link.title}</h3>
                {disabled && <span className="discover-soon-badge">Coming Soon</span>}
              </div>
              <p>{link.description}</p>
            </Link>
          );
        })}
      </section>

      <section className="discover-browse">
        <h2>Discover New Music</h2>
        <p>Explore trending tracks, genres, and DJ sets from around the world.</p>
        <div className="discover-browse-grid">
          <div className="discover-browse-item">
            <h3>Trending Tracks</h3>
            <p>Latest hits and popular songs</p>
          </div>
          <div className="discover-browse-item">
            <h3>Genre Explorer</h3>
            <p>Browse by music genre</p>
          </div>
          <div className="discover-browse-item">
            <h3>DJ Sets</h3>
            <p>Professional DJ performances</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default DiscoverPage;
