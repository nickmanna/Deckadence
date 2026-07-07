import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { TrackService } from '../services/trackService';
import Waveform from './Waveform';
import './GreenRoom.css';

const GreenRoom = ({ tracks = [] }) => {
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownRefs = useRef({});
  const navigate = useNavigate();
  const [channels, setChannels] = useState([
    { id: 1, name: 'Channel 1', track: null },
    { id: 2, name: 'Channel 2', track: null },
    { id: 3, name: 'Channel 3', track: null },
    { id: 4, name: 'Channel 4', track: null }
  ]);
  const [zoomLevel, setZoomLevel] = useState(32.0);
  const { currentUser } = useAuth();
  const [userStats, setUserStats] = useState(null);
  const [filteredTracks, setFilteredTracks] = useState(tracks);
  const [loading, setLoading] = useState(false);
  
  // Track list resizing state
  const [isResizing, setIsResizing] = useState(false);
  const [trackListHeight, setTrackListHeight] = useState(180);
  const trackListRef = useRef(null);

  // Jogging state for each channel
  const [joggingStates, setJoggingStates] = useState([false, false, false, false]);
  const [currentTimes, setCurrentTimes] = useState([0, 0, 0, 0]);
  
  // Play state for each channel
  const [playingStates, setPlayingStates] = useState([false, false, false, false]);

  const handleTrackClick = (track) => {
    console.log('Track clicked:', track);
  };

  // Drag and drop handlers
  const handleDragStart = (e, track) => {
    console.log('Drag start for track:', track);
    // Set the data to be transferred
    e.dataTransfer.setData('application/json', JSON.stringify(track));
    // Specify that the allowed operation is a "copy"
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e) => {
    // Prevent the default behavior (which is to not allow dropping)
    e.preventDefault();
    // Add visual indicator
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e) => {
    // Only remove visual indicator if we're actually leaving the drop zone
    // Check if we're moving to a child element (like the waveform)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      e.currentTarget.classList.remove('drag-over');
    }
  };

  const handleDrop = (e, channelIndex) => {
    // Prevent the default browser behavior
    e.preventDefault();
    // Remove visual indicator
    e.currentTarget.classList.remove('drag-over');

    // Get the data that was set in the dragstart event
    const trackInfoString = e.dataTransfer.getData('application/json');
    
    // Make sure data was received
    if (trackInfoString) {
      const trackInfo = JSON.parse(trackInfoString);
      console.log('Dropping track into channel', channelIndex + 1, ':', trackInfo);
      
      // Update the channel with the new track
      setChannels(prevChannels => 
        prevChannels.map((channel, index) => 
          index === channelIndex 
            ? { ...channel, track: trackInfo }
            : channel
        )
      );
    }
  };

  // Jogging handlers for each channel
  const handleJogStart = (channelIndex) => {
    console.log('Jog start for channel', channelIndex + 1);
    setJoggingStates(prev => {
      const newStates = [...prev];
      newStates[channelIndex] = true;
      return newStates;
    });
  };

  const handleJogEnd = (channelIndex) => {
    console.log('Jog end for channel', channelIndex + 1);
    setJoggingStates(prev => {
      const newStates = [...prev];
      newStates[channelIndex] = false;
      return newStates;
    });
  };

  const handleSeekToTime = (channelIndex, newTime) => {
    console.log('Seek to time for channel', channelIndex + 1, ':', newTime);
    setCurrentTimes(prev => {
      const newTimes = [...prev];
      newTimes[channelIndex] = newTime;
      return newTimes;
    });
  };

  // Play/pause handlers for channels
  const handlePlayPause = (channelIndex) => {
    console.log('Play/pause for channel', channelIndex + 1);
    setPlayingStates(prev => {
      const newStates = [...prev];
      newStates[channelIndex] = !newStates[channelIndex];
      return newStates;
    });
  };

  // Track list resize handlers
  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = (e) => {
    if (!isResizing) return;
    
    const windowHeight = window.innerHeight;
    const newHeight = windowHeight - e.clientY;
    const minHeight = 150;
    const maxHeight = windowHeight * 0.25; // 1/4 of viewport instead of 1/3
    
    if (newHeight >= minHeight && newHeight <= maxHeight) {
      setTrackListHeight(newHeight);
    }
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };

  useEffect(() => {
    console.log('GreenRoom useEffect - tracks:', tracks);
    console.log('GreenRoom useEffect - currentUser:', currentUser);
    
    if (tracks.length > 0) {
      console.log('Using passed tracks:', tracks);
      setFilteredTracks(tracks);
      return;
    }
    if (currentUser) {
      const loadTracksFromFirestore = async () => {
        if (!currentUser) return;
        
        setLoading(true);
        try {
          const firestoreTracks = await TrackService.getUserTracks(currentUser.uid);
          console.log('Firestore tracks loaded:', firestoreTracks);
          setFilteredTracks(firestoreTracks);
          // Load user stats
          const stats = await TrackService.getUserStats(currentUser.uid);
          setUserStats(stats);
        } catch (error) {
          console.error('Error loading tracks from Firestore:', error);
          // Add mock data for testing
          const mockTracks = [
            {
              trackID: 'mock1',
              fileName: 'Test Track 1',
              duration: 180,
              bpm: 128,
              key: 'Am',
              previewUrl: null
            },
            {
              trackID: 'mock2',
              fileName: 'Test Track 2',
              duration: 240,
              bpm: 135,
              key: 'C#m',
              previewUrl: null
            }
          ];
          setFilteredTracks(mockTracks);
        } finally {
          setLoading(false);
        }
      };

      loadTracksFromFirestore();
    } else {
      console.log('No currentUser, setting empty tracks');
      setFilteredTracks([]);
    }
  }, [currentUser, tracks]);

  const formatDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Function to close all dropdowns
  const closeAllDropdowns = (exceptButton = null) => {
    if (exceptButton !== 'file') setOpenDropdown(null);
  };

  // Handle dropdown toggle
  const handleDropdownToggle = (dropdownName) => {
    if (openDropdown === dropdownName) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(dropdownName);
    }
  };

  // Handle dropdown item click
  const handleDropdownItemClick = (action) => {
    console.log(`${action} was clicked.`);
    if (action === 'Exit') {
      navigate('/');
    }
    setOpenDropdown(null); // Close dropdown after item is clicked
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const isDropdownClick = event.target.closest('.dropdown-container');
      if (!isDropdownClick) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  return (
    <div className="green-room">
      <div className="green-room-tabs">
        {/* File Menu */}
        <div className="green-room-tab dropdown-container">
          <button 
            className={`dropdown-btn ${openDropdown === 'file' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleDropdownToggle('file');
            }}
          >
            File
          </button>
          <div className={`dropdown ${openDropdown === 'file' ? 'show' : ''}`}>
            <div className="dropdown-content">
              <a 
                href="#" 
                className="dropdown-item"
                onClick={(e) => {
                  e.preventDefault();
                  handleDropdownItemClick('New Project');
                }}
              >
                New Project
              </a>
              <a 
                href="#" 
                className="dropdown-item"
                onClick={(e) => {
                  e.preventDefault();
                  handleDropdownItemClick('Open...');
                }}
              >
                Open...
              </a>
              <a 
                href="#" 
                className="dropdown-item"
                onClick={(e) => {
                  e.preventDefault();
                  handleDropdownItemClick('Save');
                }}
              >
                Save
              </a>
              <a 
                href="#" 
                className="dropdown-item"
                onClick={(e) => {
                  e.preventDefault();
                  handleDropdownItemClick('Save As...');
                }}
              >
                Save As...
              </a>
              <hr className="dropdown-divider" />
              <a 
                href="#" 
                className="dropdown-item"
                onClick={(e) => {
                  e.preventDefault();
                  handleDropdownItemClick('Exit');
                }}
              >
                Exit
              </a>
            </div>
          </div>
        </div>

        {/* Edit Menu */}
        <div className="green-room-tab dropdown-container">
          <button 
            className={`dropdown-btn ${openDropdown === 'edit' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleDropdownToggle('edit');
            }}
          >
            Edit
          </button>
          <div className={`dropdown ${openDropdown === 'edit' ? 'show' : ''}`}>
            <div className="dropdown-content">
              <a 
                href="#" 
                className="dropdown-item"
                onClick={(e) => {
                  e.preventDefault();
                  handleDropdownItemClick('Undo');
                }}
              >
                Undo
              </a>
              <a 
                href="#" 
                className="dropdown-item"
                onClick={(e) => {
                  e.preventDefault();
                  handleDropdownItemClick('Redo');
                }}
              >
                Redo
              </a>
              <hr className="dropdown-divider" />
              <a 
                href="#" 
                className="dropdown-item"
                onClick={(e) => {
                  e.preventDefault();
                  handleDropdownItemClick('Cut');
                }}
              >
                Cut
              </a>
              <a 
                href="#" 
                className="dropdown-item"
                onClick={(e) => {
                  e.preventDefault();
                  handleDropdownItemClick('Copy');
                }}
              >
                Copy
              </a>
              <a 
                href="#" 
                className="dropdown-item"
                onClick={(e) => {
                  e.preventDefault();
                  handleDropdownItemClick('Paste');
                }}
              >
                Paste
              </a>
            </div>
          </div>
        </div>

        {/* View Menu */}
        <div className="green-room-tab dropdown-container">
          <button 
            className={`dropdown-btn ${openDropdown === 'view' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleDropdownToggle('view');
            }}
          >
            View
          </button>
          <div className={`dropdown ${openDropdown === 'view' ? 'show' : ''}`}>
            <div className="dropdown-content">
              <a 
                href="#" 
                className="dropdown-item"
                onClick={(e) => {
                  e.preventDefault();
                  handleDropdownItemClick('Zoom In');
                }}
              >
                Zoom In
              </a>
              <a 
                href="#" 
                className="dropdown-item"
                onClick={(e) => {
                  e.preventDefault();
                  handleDropdownItemClick('Zoom Out');
                }}
              >
                Zoom Out
              </a>
              <a 
                href="#" 
                className="dropdown-item"
                onClick={(e) => {
                  e.preventDefault();
                  handleDropdownItemClick('Full Screen');
                }}
              >
                Full Screen
              </a>
            </div>
          </div>
        </div>

        {/* Help Menu */}
        <div className="green-room-tab dropdown-container">
          <button 
            className={`dropdown-btn ${openDropdown === 'help' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleDropdownToggle('help');
            }}
          >
            Help
          </button>
          <div className={`dropdown ${openDropdown === 'help' ? 'show' : ''}`}>
            <div className="dropdown-content">
              <a 
                href="#" 
                className="dropdown-item"
                onClick={(e) => {
                  e.preventDefault();
                  handleDropdownItemClick('About');
                }}
              >
                About
              </a>
              <a 
                href="#" 
                className="dropdown-item"
                onClick={(e) => {
                  e.preventDefault();
                  handleDropdownItemClick('Check for Updates...');
                }}
              >
                Check for Updates...
              </a>
            </div>
          </div>
        </div>
      </div>
      
      <div className="options-container">
        <div className="options-header">
        </div>
      </div>
      <div className="fx-container">
        <div className="fx-header">
        </div>
      </div>
      <div className="waveform-container">
        {channels.map((channel, index) => (
          <div 
            key={channel.id}
            className="waveform-drop-zone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
          >
            <Waveform
              track={channel.track}
              currentTime={currentTimes[index]}
              duration={channel.track?.duration || 0}
              viewMode="dj"
              zoomLevel={zoomLevel}
              showWaveform={true}
              showBeatgrid={true}
              onSeekToTime={(newTime) => handleSeekToTime(index, newTime)}
              onJogStart={() => handleJogStart(index)}
              onJogEnd={() => handleJogEnd(index)}
              isPlaying={playingStates[index]}
            />
            {channel.track && (
              <div className="channel-track-info">
                <span>{channel.track.fileName}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* DJ Controls */}
      <div className="dj-controls">
        <div className="dj-controls-left">
          {channels.slice(0, 2).map((channel, index) => (
            <div key={channel.id} className="channel-control">
              <div className="channel-header">
                <span className="channel-name">{channel.name}</span>
                <button 
                  className={`play-button ${playingStates[index] ? 'playing' : ''}`}
                  onClick={() => handlePlayPause(index)}
                >
                  {playingStates[index] ? '⏸️' : '▶️'}
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="dj-controls-center">
        </div>
        <div className="dj-controls-right">
          {channels.slice(2, 4).map((channel, index) => (
            <div key={channel.id} className="channel-control">
              <div className="channel-header">
                <span className="channel-name">{channel.name}</span>
                <button 
                  className={`play-button ${playingStates[index + 2] ? 'playing' : ''}`}
                  onClick={() => handlePlayPause(index + 2)}
                >
                  {playingStates[index + 2] ? '⏸️' : '▶️'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Track List - Separate Section */}
      <div 
        className="track-list"
        ref={trackListRef}
        style={{ height: `${trackListHeight}px` }}
      >
        <div 
          className="track-list-header"
          onMouseDown={handleResizeStart}
        >
        </div>
        <div className="track-list-content">
          {console.log('Rendering tracks:', filteredTracks)}
          {filteredTracks.length > 0 ? (
            filteredTracks.map((track) => {
              console.log('Rendering track item:', track);
              return (
                <div
                  key={track.trackID || track.id}
                  className="list-item"
                  onClick={() => handleTrackClick(track)}
                  draggable="true"
                  onDragStart={(e) => handleDragStart(e, track)}
                >
                  <img src={track.previewUrl} alt={track.fileName} className="list-item-image" />
                  <div className="track-title">{track.fileName || track.title || 'Unknown Track'}</div>
                  <div className="track-duration">{formatDuration(track.duration || 0)}</div>
                  <div className="track-bpm">{track.bpm || 0} BPM</div>
                  <div className="track-key">{track.key || 'N/A'}</div>
                </div>
              );
            })
          ) : (
            <div style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
              No tracks found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GreenRoom;