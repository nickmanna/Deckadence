import React, { useState } from 'react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import Auth from './Auth';
import Dashboard from './Dashboard';
import './App.css';

const AppContent = () => {
  const [showAuth, setShowAuth] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const { currentUser, logout } = useAuth();

  const handleGetStarted = () => {
    setShowAuth(true);
  };

  const handleBackToHome = () => {
    setShowAuth(false);
  };

  const handleGuestMode = () => {
    setIsGuest(true);
  };

  const handleSignIn = () => {
    // Handle successful sign in
    setIsGuest(false);
  };

  const handleSignUp = () => {
    // Handle successful sign up
    setIsGuest(false);
  };

  const handleLogout = async () => {
    try {
      await logout();
      setIsGuest(false);
      setShowAuth(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleShowAuth = () => {
    setShowAuth(true);
  };

  // Show Dashboard if authenticated
  if (currentUser || isGuest) {
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

const App = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;