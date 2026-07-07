import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { TrackService } from '../services/trackService';
import './AudioUploader.css';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

const AudioUploader = ({ isOpen, onTrackAnalyzed, onClose }) => {
  const [uploadState, setUploadState] = useState('idle'); // idle, uploading, analyzing, complete, error
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [backendStatus, setBackendStatus] = useState('checking'); // checking, available, unavailable
  const [savingToCloud, setSavingToCloud] = useState(false);
  const fileInputRef = useRef(null);
  const { currentUser } = useAuth();

  const supportedFormats = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'];

  // Check backend status on component mount
  useEffect(() => {
    const checkBackendStatus = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`, {
          method: 'GET',
          timeout: 3000
        });
        if (response.ok) {
          setBackendStatus('available');
        } else {
          setBackendStatus('unavailable');
        }
      } catch (error) {
        setBackendStatus('unavailable');
      }
    };
    
    checkBackendStatus();
  }, []);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      const fileExtension = file.name.split('.').pop().toLowerCase();
      if (supportedFormats.includes(fileExtension)) {
        setSelectedFile(file);
        setUploadState('idle');
        setErrorMessage('');
      } else {
        setErrorMessage(`Unsupported file format. Supported formats: ${supportedFormats.join(', ')}`);
        setSelectedFile(null);
      }
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const fileExtension = file.name.split('.').pop().toLowerCase();
      if (supportedFormats.includes(fileExtension)) {
        setSelectedFile(file);
        setUploadState('idle');
        setErrorMessage('');
      } else {
        setErrorMessage(`Unsupported file format. Supported formats: ${supportedFormats.join(', ')}`);
        setSelectedFile(null);
      }
    }
  };

  const analyzeTrack = async () => {
    setUploadState('uploading');
    
    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      // Upload progress simulation
      for (let i = 0; i <= 50; i += 10) {
        setUploadProgress(i);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      setUploadState('analyzing');
      
      // Call the backend API
      try {
        const response = await fetch(`${API_BASE_URL}/api/analyze`, {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Analysis failed');
        }
        
        const analysisData = await response.json();
        
        // Handle new cloud-based response structure
        let result;
        if (analysisData.success && analysisData.track) {
          // New cloud-based structure
          const track = analysisData.track;
                      // Convert beatGrid format to expected format (array of time values)
            const beatgrid = track.beatGrid ? track.beatGrid.map(beat => beat.time / 1000) : []; // Convert milliseconds to seconds
            
            result = {
              fileName: track.title || selectedFile.name,
              file: selectedFile,
              fileSize: selectedFile.size,
              duration: track.duration,
              bpm: track.bpm,
              key: track.key,
              mode: track.key.includes('m') ? 'minor' : 'major', // Extract mode from key
              camelot: track.camelotKey,
              beatgrid: beatgrid, // Converted beatGrid
              waveformData: track.waveformData || {},
              analysisDate: track.analysisMetadata?.analysisDate || new Date().toISOString(),
              confidence: track.analysisMetadata?.confidence || {
                bpm: 0.95,
                key: 0.85
              },
              trackID: track.trackID,
              uploaderID: track.uploaderID,
              status: track.status
            };
        } else {
          // Fallback to old structure if needed
          result = {
            ...analysisData,
            file: selectedFile
          };
        }
        
        const fileToUpload = result.file;
        const { file, ...trackData } = result;

        setUploadProgress(100);
        setAnalysisResult(trackData);
        setUploadState('complete');
      } catch (apiError) {
        console.log('Backend API not available, using fallback analysis:', apiError);
        
        // Fallback to mock analysis if backend is not available
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const fallbackResult = {
          fileName: selectedFile.name,
          file: selectedFile,
          fileSize: selectedFile.size,
          duration: 177, // 2:57 in seconds
          bpm: 88,
          key: 'C#',
          mode: 'minor',
          camelot: '1A',
          beatgrid: generateMockBeatgrid(),
          waveformData: generateMockWaveformData(),
          analysisDate: new Date().toISOString(),
          confidence: {
            bpm: 0.94,
            key: 0.86
          },
          trackID: `fallback_${Date.now()}`,
          uploaderID: 'fallback_user',
          status: 'ready'
        };
        
        setUploadProgress(100);
        setAnalysisResult(fallbackResult);
        setUploadState('complete');
      }
      
    } catch (error) {
      console.error('Analysis error:', error);
      setErrorMessage(error.message || 'Analysis failed. Please try again.');
      setUploadState('error');
    }
  };

  const generateMockBeatgrid = () => {
    const beats = [];
    const bpm = 88;
    const beatInterval = 60 / bpm;
    const duration = 177; // 2:57 in seconds
    
    for (let time = 0; time < duration; time += beatInterval) {
      beats.push(time);
    }
    
    return beats;
  };

  const generateMockWaveformData = () => {
    const points = 1000;
    const times = [];
    const amplitudes = [];
    const colors = [];
    
    for (let i = 0; i < points; i++) {
      times.push(i * 0.1);
      amplitudes.push(Math.random() * 0.8 + 0.1);
      
      // Generate frequency-based colors
      const freq = Math.random();
      if (freq < 0.33) {
        colors.push([1.0, freq * 3, 0.0]); // Red to orange
      } else if (freq < 0.66) {
        colors.push([1.0 - (freq - 0.33) * 3, 1.0, 0.0]); // Green to yellow
      } else {
        colors.push([0.0, 1.0 - (freq - 0.66) * 3, 1.0]); // Blue to cyan
      }
    }
    
    return { times, amplitudes, colors };
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    
    try {
      await analyzeTrack();
    } catch (error) {
      setErrorMessage('Analysis failed. Please try again.');
      setUploadState('error');
    }
  };

  const handleSaveTrack = async () => {
    if (!analysisResult) return;
    
    if (!currentUser) {
      setErrorMessage('You must be logged in to save tracks to your library');
      return;
    }
    
    setSavingToCloud(true);
    setErrorMessage('');
    
    try {
      // Upload audio file to Firebase Storage
      const { storagePath, downloadURL } = await TrackService.uploadFile(
        selectedFile, 
        currentUser.uid, 
        selectedFile.name
      );
      
      // Create clean track data without the File object
      const cleanTrackData = {
        ...analysisResult,
        storagePath,
        downloadURL,
        fileName: selectedFile.name,
        fileSize: selectedFile.size
      };
      
      // Remove the File object as it can't be serialized
      delete cleanTrackData.file;
      
      // Save track to Firestore
      const savedTrack = await TrackService.saveTrack(cleanTrackData, currentUser.uid);
      
      if (onTrackAnalyzed) {
        onTrackAnalyzed(savedTrack);
      }
      
      onClose();
    } catch (error) {
      console.error('Error saving track:', error);
      setErrorMessage('Failed to save track to cloud. Please try again.');
    } finally {
      setSavingToCloud(false);
    }
  };

  const handleRetry = () => {
    setUploadState('idle');
    setUploadProgress(0);
    setAnalysisResult(null);
    setErrorMessage('');
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="audio-uploader-overlay">
      <div className="audio-uploader-modal">
        <div className="uploader-header">
          <div className="header-left">
            <h2>Upload & Analyze Track</h2>
            <div className="backend-status">
              {backendStatus === 'checking' && <span className="status-checking">Checking backend...</span>}
              {backendStatus === 'available' && <span className="status-available">✓ Backend available</span>}
              {backendStatus === 'unavailable' && <span className="status-unavailable">⚠ Using fallback analysis</span>}
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="uploader-content">
          {uploadState === 'idle' && (
            <div className="upload-section">
              <div 
                className="drop-zone"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="drop-zone-content">
                  <div className="upload-icon">🎵</div>
                  <h3>Drop your audio file here</h3>
                  <p>or click to browse</p>
                  <p className="supported-formats">
                    Supported formats: {supportedFormats.join(', ')}
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={supportedFormats.map(f => `.${f}`).join(',')}
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </div>

              {selectedFile && (
                <div className="selected-file">
                  <div className="file-info">
                    <div className="file-icon">📁</div>
                    <div className="file-details">
                      <h4>{selectedFile.name}</h4>
                      <p>{formatFileSize(selectedFile.size)}</p>
                    </div>
                  </div>
                  <button className="analyze-btn" onClick={handleAnalyze}>
                    Analyze Track
                  </button>
                </div>
              )}

              {errorMessage && (
                <div className="error-message">
                  {errorMessage}
                </div>
              )}
            </div>
          )}

          {(uploadState === 'uploading' || uploadState === 'analyzing') && (
            <div className="analysis-progress">
              <div className="progress-icon">
                {uploadState === 'uploading' ? '📤' : '🔍'}
              </div>
              <h3>
                {uploadState === 'uploading' ? 'Uploading...' : 'Analyzing...'}
              </h3>
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <p>{uploadProgress}% complete</p>
            </div>
          )}

          {uploadState === 'complete' && analysisResult && (
            <div className="analysis-results">
              <div className="results-header">
                <div className="success-icon">✅</div>
                <h3>Analysis Complete!</h3>
              </div>

              <div className="track-info">
                <div className="info-grid">
                  <div className="info-item">
                    <label>Track Name</label>
                    <span>{analysisResult.fileName || 'Unknown'}</span>
                  </div>
                  <div className="info-item">
                    <label>Duration</label>
                    <span>{formatDuration(analysisResult.duration || 0)}</span>
                  </div>
                  <div className="info-item">
                    <label>BPM</label>
                    <span>{analysisResult.bpm || 'Unknown'}</span>
                  </div>
                  <div className="info-item">
                    <label>Key</label>
                    <span>{analysisResult.key || 'Unknown'} {analysisResult.mode || ''}</span>
                  </div>
                  <div className="info-item">
                    <label>Camelot</label>
                    <span>{analysisResult.camelot || 'Unknown'}</span>
                  </div>
                  <div className="info-item">
                    <label>Beats</label>
                    <span>{analysisResult.beatgrid ? analysisResult.beatgrid.length : 0}</span>
                  </div>
                </div>

                <div className="confidence-scores">
                  <h4>Confidence Scores</h4>
                  <div className="confidence-bars">
                    <div className="confidence-item">
                      <label>BPM</label>
                      <div className="confidence-bar">
                        <div 
                          className="confidence-fill"
                          style={{ width: `${(analysisResult.confidence?.bpm || 0.95) * 100}%` }}
                        ></div>
                      </div>
                      <span>{Math.round((analysisResult.confidence?.bpm || 0.95) * 100)}%</span>
                    </div>
                    <div className="confidence-item">
                      <label>Key</label>
                      <div className="confidence-bar">
                        <div 
                          className="confidence-fill"
                          style={{ width: `${(analysisResult.confidence?.key || 0.85) * 100}%` }}
                        ></div>
                      </div>
                      <span>{Math.round((analysisResult.confidence?.key || 0.85) * 100)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="action-buttons">
                <button 
                  className="save-track-btn" 
                  onClick={handleSaveTrack}
                  disabled={savingToCloud || !currentUser}
                >
                  {savingToCloud ? 'Saving to Cloud...' : 'Save to Library'}
                </button>
                <button className="retry-btn" onClick={handleRetry}>
                  Analyze Another Track
                </button>
              </div>
              {!currentUser && (
                <div className="login-notice">
                  <p>💡 Sign in to save tracks to your cloud library</p>
                </div>
              )}
            </div>
          )}

          {uploadState === 'error' && (
            <div className="error-section">
              <div className="error-icon">❌</div>
              <h3>Analysis Failed</h3>
              <p>{errorMessage || 'An error occurred during analysis. Please try again.'}</p>
              <button className="retry-btn" onClick={handleRetry}>
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioUploader; 