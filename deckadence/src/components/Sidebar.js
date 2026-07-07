import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FEATURES } from '../config/features';
import AuthModal from './AuthModal';
import './Sidebar.css';

const NAV_ITEMS = [
  { to: '/', label: 'Discover', end: true },
  { to: '/library', label: 'Track Library' },
  { to: '/analyze', label: 'Track Analysis' },
  { to: '/green-room', label: 'Green Room', flag: 'greenRoom' },
  { to: '/games', label: 'Games', flag: 'games' }
];

const Sidebar = () => {
  const { currentUser, logout } = useAuth();
  const [authMode, setAuthMode] = useState(null); // null | 'signin' | 'signup'

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <>
      <aside className="sidebar">
        <Link to="/" className="sidebar-brand">
          Deckadence
        </Link>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => {
            const disabled = item.flag && !FEATURES[item.flag];
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `sidebar-nav-item${isActive ? ' active' : ''}${disabled ? ' disabled' : ''}`
                }
              >
                <span className="sidebar-nav-label">{item.label}</span>
                {disabled && <span className="sidebar-soon-badge">Soon</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-auth">
          {currentUser ? (
            <>
              <div className="sidebar-user">
                <span className="sidebar-user-avatar">
                  {(currentUser.displayName || currentUser.email || '?').charAt(0).toUpperCase()}
                </span>
                <span className="sidebar-user-name">
                  {currentUser.displayName || currentUser.email}
                </span>
              </div>
              <button className="sidebar-logout-btn" onClick={handleLogout}>
                Log Out
              </button>
            </>
          ) : (
            <>
              <button className="sidebar-signin-btn" onClick={() => setAuthMode('signin')}>
                Sign In
              </button>
              <button className="sidebar-signup-btn" onClick={() => setAuthMode('signup')}>
                Sign Up
              </button>
            </>
          )}
        </div>
      </aside>

      <AuthModal
        isOpen={authMode !== null}
        initialMode={authMode || 'signin'}
        onClose={() => setAuthMode(null)}
      />
    </>
  );
};

export default Sidebar;
