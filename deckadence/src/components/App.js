import React, { useState } from 'react';
import Auth from './Auth';
import Dashboard from './Dashboard';
import './App.css';

const App = () => {
  const [showAuth, setShowAuth] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleGetStarted = () => {
    setShowAuth(true);
  };

  const handleBackToHome = () => {
    setShowAuth(false);
  };

  const handleGuestMode = () => {
    setIsGuest(true);
    setIsAuthenticated(true);
  };

  const handleSignIn = () => {
    // Handle successful sign in
    setIsGuest(false);
    setIsAuthenticated(true);
  };

  const handleSignUp = () => {
    // Handle successful sign up
    setIsGuest(false);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setIsGuest(false);
    setShowAuth(false);
  };

  const handleShowAuth = () => {
    setShowAuth(true);
  };

  // Show Dashboard if authenticated
  if (isAuthenticated) {
    return (
      <Dashboard 
        isGuest={isGuest}
        onLogout={handleLogout}
        onShowAuth={handleShowAuth}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
      />
    );
  }

  // Show Auth page
  if (showAuth) {
    return (
      <Auth 
        onBack={handleBackToHome}
        onGuestMode={handleGuestMode}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
      />
    );
  }

  // Show Welcome page
  return (
    <div className="app">
      <div className="title-container">
        <h1 className="main-title">Deckadence</h1>
        <h2 className="subtitle">The first step in learning to DJ</h2>
        <button className="get-started-btn" onClick={handleGetStarted}>
          Get Started
        </button>
      </div>
    </div>
  );
};

export default App;