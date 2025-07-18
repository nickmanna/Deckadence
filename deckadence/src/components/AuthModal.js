import React, { useState } from 'react';
import './AuthModal.css';

const AuthModal = ({ isOpen, onClose, onSignIn, onSignUp }) => {
  const [authMode, setAuthMode] = useState('signin');

  const handleSignIn = (e) => {
    e.preventDefault();
    console.log('Sign in submitted');
    onSignIn();
  };

  const handleSignUp = (e) => {
    e.preventDefault();
    console.log('Sign up submitted');
    onSignUp();
  };

  if (!isOpen) return null;

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal">
        <div className="auth-modal-header">
          <h2 className="auth-modal-title">Welcome to Deckadence</h2>
          <button className="auth-close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="auth-modal-content">
          <div className="form-tabs">
            <button 
              className={`tab ${authMode === 'signin' ? 'active' : ''}`}
              onClick={() => setAuthMode('signin')}
            >
              Sign In
            </button>
            <button 
              className={`tab ${authMode === 'signup' ? 'active' : ''}`}
              onClick={() => setAuthMode('signup')}
            >
              Sign Up
            </button>
          </div>

          {authMode === 'signin' && (
            <form className="auth-form" onSubmit={handleSignIn}>
              <div className="form-group">
                <input 
                  type="email" 
                  placeholder="Email" 
                  className="form-input"
                  required
                />
              </div>
              <div className="form-group">
                <input 
                  type="password" 
                  placeholder="Password" 
                  className="form-input"
                  required
                />
              </div>
              <button type="submit" className="auth-submit-btn">
                Sign In
              </button>
            </form>
          )}

          {authMode === 'signup' && (
            <form className="auth-form" onSubmit={handleSignUp}>
              <div className="form-group">
                <input 
                  type="text" 
                  placeholder="Full Name" 
                  className="form-input"
                  required
                />
              </div>
              <div className="form-group">
                <input 
                  type="email" 
                  placeholder="Email" 
                  className="form-input"
                  required
                />
              </div>
              <div className="form-group">
                <input 
                  type="password" 
                  placeholder="Password" 
                  className="form-input"
                  required
                />
              </div>
              <div className="form-group">
                <input 
                  type="password" 
                  placeholder="Confirm Password" 
                  className="form-input"
                  required
                />
              </div>
              <button type="submit" className="auth-submit-btn">
                Create Account
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal; 