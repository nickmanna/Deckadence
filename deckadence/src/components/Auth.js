import React, { useState } from 'react';
import './Auth.css';

const Auth = ({ onBack, onGuestMode, onSignIn, onSignUp }) => {
  const [authMode, setAuthMode] = useState('');

  const handleGuestMode = () => {
    console.log('Guest mode activated');
    onGuestMode();
  };

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

    return (
    <div className="app">
      <div className="auth-container">
        <div className="auth-header">
          <h1 className="auth-title">Welcome to Deckadence</h1>
          <p className="auth-subtitle">Choose how you'd like to get started</p>
        </div>
        
        <div className="auth-options">
          <button 
            className="auth-option guest-option" 
            onClick={handleGuestMode}
          >
            <div className="option-icon">🎵</div>
            <h3>Continue as Guest</h3>
            <p>Start learning immediately with limited features</p>
          </button>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <div className="auth-forms">
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

        <button className="back-btn" onClick={onBack}>
          ← Back to Home
        </button>
      </div>
        </div>
    );
};

export default Auth;