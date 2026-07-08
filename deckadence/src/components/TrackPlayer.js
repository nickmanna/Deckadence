import React, { useState, useRef, useEffect, useCallback } from 'react';
import Waveform from './Waveform';
import { TrackService } from '../services/trackService';
import { useDdjFlx4Controller } from '../hooks/useDdjFlx4';
import { useLoopPlayback } from '../hooks/useLoopPlayback';
import { estimateLocalBeatInterval, estimateLoopEnd, findNearestBeatIndex, quantizeTimeToBeat } from '../utils/beatQuantize';
import './TrackPlayer.css';

const TrackPlayer = ({ track, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [cuePoint, setCuePoint] = useState(0);
  const [loop, setLoop] = useState({ start: null, end: null });
  const [quantize, setQuantize] = useState(true);
  const cuePreviewRef = useRef(false);
  const [showWaveform, setShowWaveform] = useState(true);
  const [showBeatgrid, setShowBeatgrid] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [id3Data, setId3Data] = useState(null);
  const [albumCover, setAlbumCover] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1.0); // Initial zoom level (1x)
  const [viewMode, setViewMode] = useState('traditional'); // 'traditional' or 'dj'
  const audioRef = useRef(null);
  const loopPlayback = useLoopPlayback();

  // Handle jog wheel start
  const handleJogStart = useCallback(() => {
    // Pause audio during jogging
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, []);

  // Handle jog wheel end
  const handleJogEnd = useCallback(() => {
    // Resume audio if it was playing before jogging
    if (audioRef.current && isPlaying) {
      audioRef.current.play().catch(console.error);
    }
  }, [isPlaying]);

  // Manually seeking (e.g. clicking the waveform) always breaks out of an
  // active loop - continuing to enforce old loop bounds after the user
  // explicitly jumped elsewhere would be surprising.
  const handleSeekToTime = useCallback((newTime) => {
    loopPlayback.stop();
    setLoop({ start: null, end: null });
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadID3Tags = (file) => {
    // Simple browser-compatible ID3 tag reading
    const reader = new FileReader();
    
    reader.onload = function(e) {
      try {
        const arrayBuffer = e.target.result;
        const dataView = new DataView(arrayBuffer);
        
        // Check for ID3v2 tag
        if (dataView.getUint32(0) === 0x49443300) { // "ID3"
          const id3Data = parseID3v2(dataView);
          if (id3Data.metadata && Object.keys(id3Data.metadata).length > 0) {
            setId3Data(id3Data.metadata);
          }
          if (id3Data.picture) {
            setAlbumCover(id3Data.picture);
          }
        }
      } catch (error) {
        console.log('Error reading ID3 tags:', error);
        // Continue without ID3 data
      }
    };
    
    reader.onerror = function() {
      console.log('Error reading file for ID3 tags');
    };
    
    reader.readAsArrayBuffer(file);
  };
  
  const parseID3v2 = (dataView) => {
    const metadata = {};
    let picture = null;
    
    try {
      // Read ID3v2 header
      const version = dataView.getUint8(3);
      const flags = dataView.getUint8(4);
      const size = dataView.getUint32(6) & 0x7FFFFFFF; // Remove sync bytes
      
      let offset = 10; // Skip header
      
      // Parse frames
      while (offset < size) {
        if (offset + 4 > dataView.byteLength) break;
        
        const frameId = String.fromCharCode(
          dataView.getUint8(offset),
          dataView.getUint8(offset + 1),
          dataView.getUint8(offset + 2),
          dataView.getUint8(offset + 3)
        );
        
        if (frameId === '\x00\x00\x00\x00') break; // Padding
        
        const frameSize = dataView.getUint32(offset + 4);
        const frameFlags = dataView.getUint16(offset + 8);
        
        if (offset + 10 + frameSize > dataView.byteLength) break;
        
        // Read frame data
        const frameData = new Uint8Array(dataView.buffer, offset + 10, frameSize);
        
        // Parse common frames
        switch (frameId) {
          case 'TIT2': // Title
            metadata.title = decodeID3Text(frameData);
            break;
          case 'TPE1': // Artist
            metadata.artist = decodeID3Text(frameData);
            break;
          case 'TALB': // Album
            metadata.album = decodeID3Text(frameData);
            break;
          case 'TYER': // Year
            metadata.year = decodeID3Text(frameData);
            break;
          case 'TCON': // Genre
            metadata.genre = decodeID3Text(frameData);
            break;
          case 'APIC': // Picture
            picture = decodeID3Picture(frameData);
            break;
        }
        
        offset += 10 + frameSize;
      }
    } catch (error) {
      console.log('Error parsing ID3v2:', error);
    }
    
    return { metadata, picture };
  };
  
  const decodeID3Text = (data) => {
    if (data.length === 0) return '';
    
    const encoding = data[0];
    const textData = data.slice(1);
    
    switch (encoding) {
      case 0: // ISO-8859-1
        return new TextDecoder('latin1').decode(textData);
      case 1: // UTF-16 with BOM
      case 2: // UTF-16BE without BOM
        return new TextDecoder('utf-16').decode(textData);
      case 3: // UTF-8
        return new TextDecoder('utf-8').decode(textData);
      default:
        return new TextDecoder('latin1').decode(textData);
    }
  };
  
  const decodeID3Picture = (data) => {
    if (data.length < 5) return null;
    
    const encoding = data[0];
    const mimeTypeEnd = data.indexOf(0, 1);
    if (mimeTypeEnd === -1) return null;
    
    const mimeType = new TextDecoder('latin1').decode(data.slice(1, mimeTypeEnd));
    const pictureType = data[mimeTypeEnd + 1];
    const descriptionEnd = data.indexOf(0, mimeTypeEnd + 2);
    if (descriptionEnd === -1) return null;
    
    const pictureData = data.slice(descriptionEnd + 1);
    const base64 = btoa(String.fromCharCode(...pictureData));
    
    return `data:${mimeType};base64,${base64}`;
  };

  // Load ID3 tags when track changes and create audio URL
  useEffect(() => {
    let audioUrl = null;
    
    console.log('TrackPlayer received track:', track);
    console.log('Track keys:', track ? Object.keys(track) : 'No track');
    console.log('Track waveform data:', track?.waveformData);
    console.log('Track duration:', track?.duration);
    
    const loadAudioFile = async () => {
      try {
        if (track && track.file) {
          // If track has a file object (from upload), use it directly
          loadID3Tags(track.file);
          audioUrl = URL.createObjectURL(track.file);
          if (audioRef.current) {
            audioRef.current.src = audioUrl;
          }
        } else if (track && (track.downloadURL || track.storagePath)) {
          // If track has storage references, use the download URL directly
          console.log('Using audio file from storage...');
          console.log('Track storage info:', { downloadURL: track.downloadURL, storagePath: track.storagePath });
          
          // Use download URL directly for audio element (avoids CORS issues)
          if (track.downloadURL) {
            if (audioRef.current) {
              audioRef.current.src = track.downloadURL;
            }
            console.log('Audio file loaded from download URL');
          } else {
            // Fallback to fetching file if no download URL
            try {
              const audioFile = await TrackService.getAudioFile(track);
              console.log('Audio file retrieved:', audioFile);
              loadID3Tags(audioFile);
              audioUrl = URL.createObjectURL(audioFile);
              if (audioRef.current) {
                audioRef.current.src = audioUrl;
              }
              console.log('Audio file loaded from storage');
            } catch (error) {
              console.error('Failed to fetch audio file, using download URL directly');
              if (audioRef.current) {
                audioRef.current.src = track.downloadURL;
              }
            }
          }
          
          // Set duration immediately if track has it
          if (track.duration) {
            setDuration(track.duration);
            console.log('Duration set immediately from track:', track.duration);
          } else if (track.waveformData?.duration) {
            // Fallback to waveform data duration
            setDuration(track.waveformData.duration);
            console.log('Duration set from waveform data:', track.waveformData.duration);
          }
        } else {
          // Reset ID3 data when no file is available
          setId3Data(null);
          setAlbumCover(null);
          if (audioRef.current) {
            audioRef.current.src = '';
          }
        }
      } catch (error) {
        console.error('Error loading audio file:', error);
        // Reset ID3 data on error
        setId3Data(null);
        setAlbumCover(null);
        if (audioRef.current) {
          audioRef.current.src = '';
        }
      }
    };
    
    loadAudioFile();
    
    // Cleanup function to revoke object URL
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [track]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    loopPlayback.setVolume(volume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      // Use track duration if available, otherwise use audio duration
      const trackDuration = track?.duration || audio.duration;
      setDuration(trackDuration);
      console.log('Duration set:', trackDuration, 'from track:', track?.duration, 'from audio:', audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [track]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const togglePlay = () => setIsPlaying((p) => !p);

  // Reset cue/loop state whenever a different track is loaded.
  useEffect(() => {
    setCuePoint(0);
    setLoop({ start: null, end: null });
    cuePreviewRef.current = false;
  }, [track]);

  // TEMPORARY debug instrumentation for diagnosing beatgrid irregularity -
  // remove once the loop-stutter investigation is done. Logs every beat
  // time plus its interval to the previous beat, so a specific range can
  // be pasted back for inspection instead of eyeballing pixel spacing in
  // a screenshot.
  useEffect(() => {
    const grid = track?.beatgrid || track?.beatGrid || [];
    if (grid.length === 0) return;
    const rows = grid.map((t, i) => ({
      index: i,
      time: Number(t.toFixed(4)),
      intervalMs: i > 0 ? Math.round((t - grid[i - 1]) * 1000) : null,
    }));
    console.log(`[beatgrid-debug] ${track?.title || 'track'}: ${grid.length} beats, bpm=${track?.bpm}`);
    console.table(rows);
  }, [track]);

  // Single place that decides which engine actually drives playback.
  // Normal playback stays on the <audio> element; while a loop is active
  // AND playing, hand off to Web Audio's sample-accurate native looping
  // (see useLoopPlayback) instead of polling audio.currentTime, which
  // can't be checked/corrected any faster than requestAnimationFrame
  // allows (~16ms at 60Hz) - on a real analyzed track that was enough
  // overshoot past the loop-out point to audibly hear the next beat
  // bleed in before snapping back.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const loopActive = loop.start != null && loop.end != null;

    if (isPlaying && loopActive) {
      let cancelled = false;
      const fromTime = loopPlayback.isActive() ? (loopPlayback.getCurrentTime() ?? audio.currentTime) : audio.currentTime;
      audio.pause();
      const url = audio.currentSrc || audio.src;
      loopPlayback.start(url, loop.start, loop.end, fromTime, { volume, playbackRate }).then((ok) => {
        if (cancelled || ok) return;
        // Web Audio decode failed (e.g. CORS) - fall back to ordinary
        // <audio> playback. The loop still works, just with the original
        // (less precise) rAF-based enforcement below.
        audio.currentTime = fromTime >= loop.start && fromTime < loop.end ? fromTime : loop.start;
        audio.play().catch(console.error);
      });
      return () => {
        cancelled = true;
        if (loopPlayback.isActive()) {
          const t = loopPlayback.getCurrentTime();
          loopPlayback.stop();
          if (t != null) audio.currentTime = t;
        }
      };
    }

    if (isPlaying && audio.paused) {
      audio.play().catch(console.error);
    } else if (!isPlaying && !audio.paused) {
      audio.pause();
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, loop.start, loop.end, playbackRate]);

  // Fallback rAF-based loop enforcement for when Web Audio decode isn't
  // available - imprecise (same overshoot as before) but keeps looping
  // functional rather than breaking entirely.
  useEffect(() => {
    if (!isPlaying || loop.start == null || loop.end == null) return undefined;
    let raf;
    const checkLoop = () => {
      const audio = audioRef.current;
      if (audio && !loopPlayback.isActive() && !audio.paused && audio.currentTime >= loop.end) {
        audio.currentTime = loop.start;
      }
      raf = requestAnimationFrame(checkLoop);
    };
    raf = requestAnimationFrame(checkLoop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, loop.start, loop.end]);

  // Drive the waveform playhead from the Web Audio clock while a loop is
  // actively playing there, since the <audio> element is paused (and so
  // stops emitting timeupdate events) for the duration of the loop.
  useEffect(() => {
    if (!isPlaying || loop.start == null || loop.end == null) return undefined;
    let raf;
    const update = () => {
      const t = loopPlayback.getCurrentTime();
      if (t != null) setCurrentTime(t);
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, loop.start, loop.end]);

  // Correct current-position read regardless of which engine is driving
  // playback right now - used anywhere a handler needs "where are we
  // actually playing from" (cue/loop point placement).
  const getPlaybackTime = () => {
    if (loopPlayback.isActive()) {
      const t = loopPlayback.getCurrentTime();
      if (t != null) return t;
    }
    return audioRef.current ? audioRef.current.currentTime : 0;
  };

  // Getting this from track props fresh each call (rather than useMemo)
  // keeps it trivially in sync if the track prop ever changes underneath
  // an open player, at negligible cost - it's just a property read.
  const getBeatgrid = () => track?.beatgrid || track?.beatGrid || [];

  // Manual loop/cue points landing a few ms off the real beat is exactly
  // what makes hand-set loops sound "off" on every repeat - snapping to
  // the nearest detected beat (real detected positions, not an assumed
  // constant tempo) is what a hardware CDJ's quantize does too.
  const quantizePoint = (time) => (quantize ? quantizeTimeToBeat(time, getBeatgrid()) : time);

  // Standard CDJ-style CUE behavior:
  // - pressed while playing: stop and jump back to the cue point.
  // - pressed while paused, already at the cue point: preview-play for as
  //   long as the button is held.
  // - pressed while paused elsewhere (e.g. after seeking on the waveform):
  //   drop a new cue point at the current position.
  const handleCuePress = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      // Pressing CUE always wins over an active loop - jump to the cue
      // point rather than leaving a Web Audio loop node running under a
      // now-stale <audio> position.
      if (loopPlayback.isActive()) loopPlayback.stop();
      if (loop.start != null || loop.end != null) setLoop({ start: null, end: null });
      audio.pause();
      audio.currentTime = cuePoint;
      setCurrentTime(cuePoint);
      setIsPlaying(false);
      return;
    }
    const atCue = Math.abs(getPlaybackTime() - cuePoint) < 0.05;
    if (atCue) {
      cuePreviewRef.current = true;
      audio.currentTime = cuePoint;
      audio.play().catch(console.error);
      setIsPlaying(true);
    } else {
      setCuePoint(quantizePoint(getPlaybackTime()));
    }
  };

  const handleCueRelease = () => {
    if (!cuePreviewRef.current) return;
    cuePreviewRef.current = false;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = cuePoint;
      setCurrentTime(cuePoint);
    }
    setIsPlaying(false);
  };

  const handleLoopIn = () => {
    setLoop({ start: quantizePoint(getPlaybackTime()), end: null });
  };

  // A loop's length is the difference of two beat positions, so unlike a
  // single cue point, it inherits detection noise from both endpoints -
  // measured on a real analyzed track, using the raw beatgrid positions
  // directly made "4 beat" loops vary by up to 95ms std (350ms range)
  // beat-to-beat. The local median interval (de-jittered) fixes that for
  // multi-beat loops, but for a SHORT loop (especially exactly 1 beat) a
  // pure average can land a few tens of ms past the real next beat -
  // enough to fully swallow that beat's hit into what was meant to be a
  // single-beat loop (verified: 70ms overshoot on a real track). Getting
  // the actual end time from estimateLoopEnd prefers the real detected
  // position when it's plausible, and only falls back to the average when
  // that real position is a genuine outlier.
  const getLoopEndTime = (startTime, beatCount) => {
    const beatgrid = getBeatgrid();
    if (beatgrid.length > 1) {
      const startIdx = findNearestBeatIndex(beatgrid, startTime);
      const end = estimateLoopEnd(beatgrid, startIdx, beatCount);
      if (end != null) return end;
    }
    return track?.bpm ? startTime + (60 / track.bpm) * beatCount : null;
  };

  const handleLoopOut = () => {
    if (loop.start == null) return;
    const now = getPlaybackTime();
    if (!quantize) {
      if (now <= loop.start) return;
      setLoop({ start: loop.start, end: now });
      return;
    }
    const beatgrid = getBeatgrid();
    const startIdx = findNearestBeatIndex(beatgrid, loop.start);
    const interval = estimateLocalBeatInterval(beatgrid, startIdx) || (track?.bpm ? 60 / track.bpm : null);
    if (!interval) return;
    const beatCount = Math.max(1, Math.round((now - loop.start) / interval));
    const end = getLoopEndTime(loop.start, beatCount);
    if (!end || end <= loop.start) return;
    setLoop({ start: loop.start, end });
  };

  // Single physical button: creates an instant 4-beat loop from the
  // current position when nothing is looping, exits the active loop
  // otherwise - matches the DDJ-FLX4's "4 BEAT / EXIT" labeling.
  const handleLoop4BeatOrExit = () => {
    if (loop.start != null && loop.end != null) {
      setLoop({ start: null, end: null });
      return;
    }
    const now = getPlaybackTime();
    if (quantize) {
      const start = quantizePoint(now);
      const end = getLoopEndTime(start, 4);
      if (end) {
        setLoop({ start, end });
        return;
      }
    }
    if (!track?.bpm) return;
    const beatLength = 60 / track.bpm;
    setLoop({ start: now, end: now + beatLength * 4 });
  };

  // Halving/doubling by pure arithmetic on the loop length compounds
  // exactly the averaging error estimateLoopEnd exists to avoid: a 4-beat
  // loop's end is (correctly) allowed to land on the real detected beat
  // position, but dividing that length by 4 to get "1 beat" treats it as
  // a flat average across all 4 beats instead of the real position of the
  // very next beat - reintroducing the "few tens of ms too long" overshoot
  // that swallows the following beat's transient (see estimateLoopEnd).
  // Re-deriving the new length from the beatgrid at each halve/double step
  // keeps every whole-beat length exact instead of drifting toward the
  // average. Sub-beat lengths (for stutter-loop effects) have no beatgrid
  // position to snap to, so those still fall back to plain arithmetic.
  const requantizedLoopEnd = (beatCount) => {
    if (!Number.isInteger(beatCount) || beatCount < 1) return null;
    return quantize ? getLoopEndTime(loop.start, beatCount) : null;
  };

  const currentLoopBeatCount = () => {
    const beatgrid = getBeatgrid();
    const startIdx = findNearestBeatIndex(beatgrid, loop.start);
    const interval = estimateLocalBeatInterval(beatgrid, startIdx) || (track?.bpm ? 60 / track.bpm : null);
    return interval ? (loop.end - loop.start) / interval : null;
  };

  const handleLoopCallLeft = () => {
    if (loop.start == null || loop.end == null) return;
    const newLength = (loop.end - loop.start) / 2;
    if (newLength < 0.05) return;
    const beatCount = currentLoopBeatCount();
    const halved = beatCount != null ? Math.round(beatCount) / 2 : null;
    const end = requantizedLoopEnd(halved);
    setLoop({ start: loop.start, end: end ?? loop.start + newLength });
  };

  const handleLoopCallRight = () => {
    if (loop.start == null || loop.end == null) return;
    const beatCount = currentLoopBeatCount();
    const doubled = beatCount != null ? Math.round(beatCount) * 2 : null;
    const end = requantizedLoopEnd(doubled);
    setLoop({ start: loop.start, end: end ?? loop.start + (loop.end - loop.start) * 2 });
  };

  const midiStatus = useDdjFlx4Controller({
    onPlayPause: togglePlay,
    onCuePress: handleCuePress,
    onCueRelease: handleCueRelease,
    onLoopIn: handleLoopIn,
    onLoopOut: handleLoopOut,
    onLoop4BeatOrExit: handleLoop4BeatOrExit,
    onLoopCallLeft: handleLoopCallLeft,
    onLoopCallRight: handleLoopCallRight,
  });

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    audioRef.current.volume = newVolume;
  };

  const handlePlaybackRateChange = (e) => {
    const newRate = parseFloat(e.target.value);
    setPlaybackRate(newRate);
  };

  const handleZoomChange = (newZoom) => {
    setZoomLevel(newZoom);
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };





  const getKeyColor = (key, mode) => {
    const keyColors = {
      'C': '#FF6B6B', 'C#': '#4ECDC4', 'D': '#45B7D1',
      'D#': '#96CEB4', 'E': '#FFEAA7', 'F': '#DDA0DD',
      'F#': '#98D8C8', 'G': '#F7DC6F', 'G#': '#BB8FCE',
      'A': '#85C1E9', 'A#': '#F8C471', 'B': '#82E0AA'
    };
    return keyColors[key] || '#00AEEF';
  };

  return (
    <div className="track-player-overlay">
      <div className="track-player-modal">
        <div className="player-header">
          <div className="track-info">
            <div className="track-header">
              {albumCover && (
                <div className="album-cover">
                  <img src={albumCover} alt="Album Cover" />
                </div>
              )}
              <div className="track-details">
                <h2>{id3Data?.title || track.fileName}</h2>
                {id3Data?.artist && <p className="artist">{id3Data.artist}</p>}
                {id3Data?.album && <p className="album">{id3Data.album}</p>}
                {!id3Data?.title && !id3Data?.artist && (
                  <p className="no-metadata">No metadata available</p>
                )}
              </div>
            </div>
            <div className="track-metadata">
              <span className="bpm">BPM: {track.bpm}</span>
              <span 
                className="key"
                style={{ color: getKeyColor(track.key, track.mode) }}
              >
                Key: {track.key} {track.mode} ({track.camelot})
              </span>
              <span className="duration">{formatTime(duration)}</span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="player-content">
          {/* View Mode Selector */}
          <div className="view-mode-selector">
            <button 
              className={`view-btn ${viewMode === 'traditional' ? 'active' : ''}`}
              onClick={() => setViewMode('traditional')}
            >
              Traditional View
            </button>
            <button 
              className={`view-btn ${viewMode === 'dj' ? 'active' : ''}`}
              onClick={() => setViewMode('dj')}
            >
              DJ View
            </button>
          </div>

          {/* Waveform Controls */}
          <div className="waveform-controls">
            {viewMode === 'dj' && (
              <div className="control-group">
                <label>Zoom:</label>
                <div className="zoom-buttons">
                  <button
                    className={`zoom-btn ${zoomLevel === 8.0 ? 'active' : ''}`}
                    onClick={() => handleZoomChange(8.0)}
                  >
                    1x
                  </button>
                  <button
                    className={`zoom-btn ${zoomLevel === 16.0 ? 'active' : ''}`}
                    onClick={() => handleZoomChange(16.0)}
                  >
                    2x
                  </button>
                  <button
                    className={`zoom-btn ${zoomLevel === 32.0 ? 'active' : ''}`}
                    onClick={() => handleZoomChange(32.0)}
                  >
                    4x
                  </button>
                  <button
                    className={`zoom-btn ${zoomLevel === 64.0 ? 'active' : ''}`}
                    onClick={() => handleZoomChange(64.0)}
                  >
                    8x
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Waveform Component */}
          <Waveform
            track={track}
            currentTime={currentTime}
            duration={duration}
            viewMode={viewMode}
            zoomLevel={zoomLevel}
            showWaveform={showWaveform}
            showBeatgrid={showBeatgrid}
            onSeekToTime={handleSeekToTime}
            onJogStart={handleJogStart}
            onJogEnd={handleJogEnd}
            isPlaying={isPlaying}
            cuePoint={cuePoint}
            loop={loop}
          />

          {/* Playback Controls */}
          <div className="playback-controls">
            <div className="main-controls">
              <button
                className="play-btn"
                onClick={togglePlay}
              >
                {isPlaying ? '⏸️' : '▶️'}
              </button>

              <button
                className="cue-btn"
                onMouseDown={handleCuePress}
                onMouseUp={handleCueRelease}
                onMouseLeave={handleCueRelease}
              >
                CUE
              </button>

              <div className="time-display">
                <span>{formatTime(currentTime)}</span>
                <span>/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="loop-controls">
              <span className="control-label-text">Loop:</span>
              <button className="loop-btn" onClick={handleLoopIn}>IN</button>
              <button className="loop-btn" onClick={handleLoopOut} disabled={loop.start == null}>OUT</button>
              <button className="loop-btn" onClick={handleLoop4BeatOrExit}>
                {loop.start != null && loop.end != null ? 'EXIT' : '4 BEAT'}
              </button>
              <button className="loop-btn" onClick={handleLoopCallLeft} disabled={loop.end == null}>◁ 1/2</button>
              <button className="loop-btn" onClick={handleLoopCallRight} disabled={loop.end == null}>▷ x2</button>
              {loop.start != null && loop.end != null && (
                <span className="loop-length">{(loop.end - loop.start).toFixed(2)}s</span>
              )}
              <button
                className={`quantize-btn ${quantize ? 'active' : ''}`}
                onClick={() => setQuantize((q) => !q)}
                title="Snap cue/loop points to the beat grid"
              >
                Q
              </button>
            </div>

            <div className="midi-panel">
              {midiStatus.connected ? (
                <span className="midi-status connected">
                  🎛️ Connected: {midiStatus.deviceNames.join(', ')}
                </span>
              ) : (
                <>
                  <span className="midi-status">
                    {midiStatus.supported ? 'No MIDI controller connected' : 'MIDI not supported in this browser'}
                  </span>
                  {midiStatus.supported && (
                    <button className="midi-connect-btn" onClick={midiStatus.connect}>
                      Connect MIDI Controller
                    </button>
                  )}
                </>
              )}
              {midiStatus.error && <span className="midi-error">Error: {midiStatus.error}</span>}
              {midiStatus.lastMessage && (
                <span className="midi-last-message">
                  Last MIDI in: {midiStatus.lastMessage.hex} ({Math.round((Date.now() - midiStatus.lastMessage.at) / 1000)}s ago)
                </span>
              )}
            </div>

            <div className="secondary-controls">
              <div className="control-group">
                <label>Speed:</label>
                <select 
                  value={playbackRate} 
                  onChange={handlePlaybackRateChange}
                  className="rate-select"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={0.75}>0.75x</option>
                  <option value={1.0}>1.0x</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2.0}>2.0x</option>
                </select>
              </div>

              <div className="control-group">
                <label>Volume:</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="volume-slider"
                />
                <span className="volume-value">{Math.round(volume * 100)}%</span>
              </div>
            </div>
          </div>

          {/* Analysis Details */}
          <div className="analysis-details">
            <h3>Analysis Details</h3>
            <div className="details-grid">
              <div className="detail-item">
                <label>Confidence (BPM)</label>
                <div className="confidence-bar">
                  <div 
                    className="confidence-fill"
                    style={{ width: `${track.confidence.bpm * 100}%` }}
                  ></div>
                </div>
                <span>{Math.round(track.confidence.bpm * 100)}%</span>
              </div>
              <div className="detail-item">
                <label>Confidence (Key)</label>
                <div className="confidence-bar">
                  <div 
                    className="confidence-fill"
                    style={{ width: `${track.confidence.key * 100}%` }}
                  ></div>
                </div>
                <span>{Math.round(track.confidence.key * 100)}%</span>
              </div>
              <div className="detail-item">
                <label>Total Beats</label>
                <span>{track.beatgrid.length}</span>
              </div>
              <div className="detail-item">
                <label>Analysis Date</label>
                <span>{new Date(track.analysisDate).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hidden Audio Element */}
        <audio
          ref={audioRef}
          preload="metadata"
        />
      </div>
    </div>
  );
};

export default TrackPlayer; 