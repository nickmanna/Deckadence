import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { TrackService } from '../services/trackService';
import { useDdjFlx4Controller } from '../hooks/useDdjFlx4';
import Deck from './Deck';
import './GreenRoom.css';

// A stable reference for the "no tracks prop passed" default - `tracks =
// []` inline would create a brand new array on every render (function
// components re-evaluate their default params every call), which fed
// straight into the tracks-loading effect's dependency array below and
// caused an infinite render loop the instant this page was reachable
// (previously masked entirely, since the greenRoom feature flag always
// rendered ComingSoon instead of this component).
const EMPTY_TRACKS = [];

// Which side of the crossfader each channel responds to - odd/even split
// (1&3 vs 2&4) matches how a real club mixer's channel assign switches are
// conventionally wired, rather than pairing by screen position (1&2 vs
// 3&4). In 2-channel mode only channels 1 (A) and 2 (B) are ever visible,
// so this still reduces to a plain 2-deck crossfader.
const CROSSFADER_GROUP = { 1: 'A', 2: 'B', 3: 'A', 4: 'B' };

// Simple "hold full, then fade" curve rather than true equal-power - good
// enough for a practice mixer without needing a dedicated gain-law lookup.
const crossfaderMultiplier = (position, group) => {
  if (group === 'A') return position <= 0.5 ? 1 : Math.max(0, 1 - (position - 0.5) * 2);
  if (group === 'B') return position >= 0.5 ? 1 : Math.max(0, position * 2);
  return 1;
};

const GreenRoom = ({ tracks = EMPTY_TRACKS }) => {
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

  // 2-deck vs 4-deck layout, and the mixer state driving each deck's gain.
  const [channelCount, setChannelCount] = useState(2);
  const [channelFaders, setChannelFaders] = useState([0.8, 0.8, 0.8, 0.8]);
  const [crossfader, setCrossfader] = useState(0.5);

  const getEffectiveVolume = (channelId, faderIndex) =>
    channelFaders[faderIndex] * crossfaderMultiplier(crossfader, CROSSFADER_GROUP[channelId]);

  // Console-style grid layout: every waveform stacks in one full-width
  // column (row per deck), and one row underneath holds the actual control
  // surface, laid out like the physical board - crossfader side A's decks
  // to the left of the mixer, side B's to the right, jog wheel on each
  // deck's own outer edge. Column/row numbers are handed to Deck as inline
  // grid-column/grid-row so its waveform half and controls half can land in
  // different places despite being rendered by the same component (see
  // Deck.js's Fragment return).
  const visibleChannels = channels.slice(0, channelCount);
  const leftChannels = visibleChannels.filter((c) => CROSSFADER_GROUP[c.id] === 'A');
  const rightChannels = visibleChannels.filter((c) => CROSSFADER_GROUP[c.id] === 'B');
  const mixerColumn = leftChannels.length + 1;
  const controlsRow = visibleChannels.length + 1;
  const controlsColumnFor = (channelId) => {
    const leftIndex = leftChannels.findIndex((c) => c.id === channelId);
    if (leftIndex !== -1) return leftIndex + 1;
    const rightIndex = rightChannels.findIndex((c) => c.id === channelId);
    return mixerColumn + 1 + rightIndex;
  };
  const deckSurfaceStyle = {
    gridTemplateColumns:
      `${leftChannels.map(() => 'minmax(260px, auto)').join(' ')} ` +
      'minmax(240px, 1fr) ' +
      `${rightChannels.map(() => 'minmax(260px, auto)').join(' ')}`,
    gridTemplateRows: `${visibleChannels.map(() => '1fr').join(' ')} auto`,
  };

  // DDJ-FLX4 wiring: the hardware only has 2 physical decks (left/right),
  // which map onto Green Room channels 1 and 2 - the same pair CROSSFADER_
  // GROUP already treats as sides A/B, and the only two channels visible in
  // 2-channel mode. Channels 3/4 (4-channel mode) have no physical deck to
  // receive MIDI from. Deck's transport handlers are read via ref (see
  // Deck.js's useImperativeHandle) rather than lifting useDeckPlayer's
  // state up into GreenRoom, so each Deck keeps owning its own playback
  // state exactly as it does today.
  const deckRefs = useRef({});
  // channelFaders is indexed by on-screen position, not channel id - but
  // channels is never reordered, so index === deckId - 1 always holds.
  const midiHandlersForDeck = (deckId) => ({
    onPlayPause: () => deckRefs.current[deckId]?.togglePlay(),
    onCuePress: () => deckRefs.current[deckId]?.handleCuePress(),
    onCueRelease: () => deckRefs.current[deckId]?.handleCueRelease(),
    onLoopIn: () => deckRefs.current[deckId]?.handleLoopIn(),
    onLoopOut: () => deckRefs.current[deckId]?.handleLoopOut(),
    onLoop4BeatOrExit: () => deckRefs.current[deckId]?.handleLoop4BeatOrExit(),
    onLoopCallLeft: () => deckRefs.current[deckId]?.handleLoopCallLeft(),
    onLoopCallRight: () => deckRefs.current[deckId]?.handleLoopCallRight(),
    onChannelFaderChange: (v) => {
      setChannelFaders((prev) => {
        const next = [...prev];
        next[deckId - 1] = v;
        return next;
      });
    },
    // Pitch/tempo is deck-owned state (useDeckPlayer), not mixer state, so
    // it goes through the deck ref rather than GreenRoom's own setters -
    // same 0.9-1.1 range as the on-screen pitch slider in Deck.js.
    onTempoChange: (v) => deckRefs.current[deckId]?.setPlaybackRate(0.9 + v * 0.2),
  });
  const midiStatus = useDdjFlx4Controller({
    1: midiHandlersForDeck(1),
    2: midiHandlersForDeck(2),
    onCrossfaderChange: setCrossfader,
  });

  // Track list resizing state
  const [isResizing, setIsResizing] = useState(false);
  const [trackListHeight, setTrackListHeight] = useState(180);
  const trackListRef = useRef(null);

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

        <div className="green-room-midi">
          {midiStatus.connected ? (
            <span
              className="green-room-midi-status connected"
              title={midiStatus.deviceNames.join(', ')}
            >
              🎛️ MIDI: L/R decks
            </span>
          ) : (
            <>
              <span className="green-room-midi-status">
                {midiStatus.supported ? 'No MIDI controller' : 'MIDI unsupported'}
              </span>
              {midiStatus.supported && (
                <button className="green-room-midi-connect-btn" onClick={midiStatus.connect}>
                  Connect MIDI
                </button>
              )}
            </>
          )}
        </div>

        <div className="channel-count-toggle">
          <button
            className={`channel-count-btn ${channelCount === 2 ? 'active' : ''}`}
            onClick={() => setChannelCount(2)}
          >
            2 CH
          </button>
          <button
            className={`channel-count-btn ${channelCount === 4 ? 'active' : ''}`}
            onClick={() => setChannelCount(4)}
          >
            4 CH
          </button>
        </div>
      </div>

      <div className="green-room-deck-surface" style={deckSurfaceStyle}>
        {visibleChannels.map((channel, index) => (
          <Deck
            key={channel.id}
            ref={(el) => { deckRefs.current[channel.id] = el; }}
            deckNumber={channel.id}
            track={channel.track}
            volume={getEffectiveVolume(channel.id, index)}
            zoomLevel={zoomLevel}
            side={CROSSFADER_GROUP[channel.id] === 'A' ? 'left' : 'right'}
            waveformRow={index + 1}
            controlsRow={controlsRow}
            controlsColumn={controlsColumnFor(channel.id)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
          />
        ))}

        {/* Mixer: per-channel volume fader plus a shared crossfader. EQ is
            intentionally not here yet - it needs each deck's audio routed
            through Web Audio filter nodes rather than the plain <audio>
            element playback used today, which is a bigger follow-up. */}
        <div className="mixer-center" style={{ gridRow: controlsRow, gridColumn: mixerColumn }}>
          <div className="fader-container">
            {visibleChannels.map((channel, index) => (
              <div key={channel.id} className="fader-control">
                <span className="fader-group-label">{CROSSFADER_GROUP[channel.id]}</span>
                <div className="fader-track">
                  <input
                    type="range"
                    className="fader-slider-input"
                    min="0"
                    max="1"
                    step="0.01"
                    value={channelFaders[index]}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      setChannelFaders((prev) => {
                        const next = [...prev];
                        next[index] = value;
                        return next;
                      });
                    }}
                  />
                </div>
                <span className="fader-label">CH {channel.id}</span>
              </div>
            ))}
          </div>
          <div className="crossfader-container">
            <span className="crossfader-label">A</span>
            <input
              type="range"
              className="crossfader-slider"
              min="0"
              max="1"
              step="0.01"
              value={crossfader}
              onChange={(e) => setCrossfader(parseFloat(e.target.value))}
            />
            <span className="crossfader-label">B</span>
          </div>
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