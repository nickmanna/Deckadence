import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { TrackService } from '../services/trackService';
import { FEATURES } from '../config/features';
import './DiscoverPage.css';

const QUICK_LINKS = [
  { to: '/analyze', icon: '📊', title: 'Track Analysis', description: 'Upload a track and get BPM, key, and beatgrid.' },
  { to: '/library', icon: '📚', title: 'Track Library', description: 'Browse and preview your analyzed tracks.' },
  { to: '/green-room', icon: '🎹', title: 'Green Room', description: 'Practice mixing in the studio.', flag: 'greenRoom' },
  { to: '/games', icon: '🕹️', title: 'Games', description: 'Test your DJ skills.', flag: 'games' }
];

const DiscoverPage = () => {
  const { currentUser } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let ignore = false;

    if (!currentUser) {
      setStats(null);
      return;
    }

    TrackService.getUserStats(currentUser.uid)
      .then(result => {
        if (!ignore) setStats(result);
      })
      .catch(error => console.error('Error loading stats:', error));

    return () => {
      ignore = true;
    };
  }, [currentUser]);

  return (
    <div className="discover-page">
      <section className="discover-hero">
        <h1>
          {currentUser ? `Welcome back, ${currentUser.displayName || currentUser.email}` : 'Welcome to Deckadence'}
        </h1>
        <p className="discover-subtitle">The first step in learning to DJ</p>

        {currentUser && stats && (
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
              <span className="discover-quick-link-icon">{link.icon}</span>
              <h3>{link.title}</h3>
              <p>{link.description}</p>
              {disabled && <span className="discover-soon-badge">Coming Soon</span>}
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
