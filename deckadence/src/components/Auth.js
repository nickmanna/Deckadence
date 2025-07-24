import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Auth.css';

const Auth = ({ onBack, onGuestMode, onSignIn, onSignUp }) => {
  const [authMode, setAuthMode] = useState('');
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { signup, signin, signInWithGoogle } = useAuth();

  const handleGuestMode = () => {
    console.log('Guest mode activated');
    onGuestMode();
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError(''); // Clear error when user starts typing
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signin(formData.email, formData.password);
      onSignIn();
    } catch (error) {
      setError(getErrorMessage(error.code));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password length
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);

    try {
      await signup(formData.email, formData.password, formData.fullName);
      onSignUp();
    } catch (error) {
      setError(getErrorMessage(error.code));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      await signInWithGoogle();
      onSignIn();
    } catch (error) {
      setError(getErrorMessage(error.code));
    } finally {
      setLoading(false);
    }
  };

  const getErrorMessage = (errorCode) => {
    switch (errorCode) {
      case 'auth/email-already-in-use':
        return 'An account with this email already exists';
      case 'auth/invalid-email':
        return 'Invalid email address';
      case 'auth/weak-password':
        return 'Password is too weak';
      case 'auth/user-not-found':
        return 'No account found with this email';
      case 'auth/wrong-password':
        return 'Incorrect password';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later';
      case 'auth/popup-closed-by-user':
        return 'Sign in was cancelled';
      default:
        return 'An error occurred. Please try again';
    }
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
                    name="email"
                    placeholder="Email" 
                    className="form-input"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <input 
                    type="password" 
                    name="password"
                    placeholder="Password" 
                    className="form-input"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                {error && <div className="error-message">{error}</div>}
                <button type="submit" className="auth-submit-btn" disabled={loading}>
                  {loading ? 'Signing In...' : 'Sign In'}
                </button>
                
                <div className="divider">
                  <span>or</span>
                </div>
                
                <button 
                  type="button" 
                  className="google-signin-btn"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                >
                  <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google" />
                  Sign in with Google
                </button>
              </form>
            )}

            {authMode === 'signup' && (
              <form className="auth-form" onSubmit={handleSignUp}>
                <div className="form-group">
                  <input 
                    type="text" 
                    name="fullName"
                    placeholder="Full Name" 
                    className="form-input"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <input 
                    type="email" 
                    name="email"
                    placeholder="Email" 
                    className="form-input"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <input 
                    type="password" 
                    name="password"
                    placeholder="Password" 
                    className="form-input"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <input 
                    type="password" 
                    name="confirmPassword"
                    placeholder="Confirm Password" 
                    className="form-input"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                {error && <div className="error-message">{error}</div>}
                <button type="submit" className="auth-submit-btn" disabled={loading}>
                  {loading ? 'Creating Account...' : 'Create Account'}
                </button>
                
                <div className="divider">
                  <span>or</span>
                </div>
                
                <button 
                  type="button" 
                  className="google-signin-btn"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                >
                  <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google" />
                  Sign up with Google
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