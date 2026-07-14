import { useState, useRef, useEffect, useCallback } from 'react';
import { TrackService } from '../services/trackService';
import { useLoopPlayback } from './useLoopPlayback';
import { estimateLocalBeatInterval, estimateLoopEnd, findNearestBeatIndex, quantizeTimeToBeat } from '../utils/beatQuantize';

const parseID3v2 = (dataView) => {
  const metadata = {};
  let picture = null;

  try {
    let offset = 10; // Skip header
    const size = dataView.getUint32(6) & 0x7FFFFFFF; // Remove sync bytes

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
      if (offset + 10 + frameSize > dataView.byteLength) break;

      const frameData = new Uint8Array(dataView.buffer, offset + 10, frameSize);

      switch (frameId) {
        case 'TIT2': metadata.title = decodeID3Text(frameData); break;
        case 'TPE1': metadata.artist = decodeID3Text(frameData); break;
        case 'TALB': metadata.album = decodeID3Text(frameData); break;
        case 'TYER': metadata.year = decodeID3Text(frameData); break;
        case 'TCON': metadata.genre = decodeID3Text(frameData); break;
        case 'APIC': picture = decodeID3Picture(frameData); break;
        default: break;
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
    case 0: return new TextDecoder('latin1').decode(textData);
    case 1:
    case 2: return new TextDecoder('utf-16').decode(textData);
    case 3: return new TextDecoder('utf-8').decode(textData);
    default: return new TextDecoder('latin1').decode(textData);
  }
};

const decodeID3Picture = (data) => {
  if (data.length < 5) return null;
  const mimeTypeEnd = data.indexOf(0, 1);
  if (mimeTypeEnd === -1) return null;
  const mimeType = new TextDecoder('latin1').decode(data.slice(1, mimeTypeEnd));
  const descriptionEnd = data.indexOf(0, mimeTypeEnd + 2);
  if (descriptionEnd === -1) return null;
  const pictureData = data.slice(descriptionEnd + 1);
  const base64 = btoa(String.fromCharCode(...pictureData));
  return `data:${mimeType};base64,${base64}`;
};

/**
 * The full single-deck playback engine (audio element + sample-accurate
 * Web Audio loop handoff + cue/loop/quantize logic) factored out of
 * TrackPlayer so it can be instantiated multiple times - Green Room needs
 * 2-4 independent decks, each with their own <audio> element, loop state,
 * and beatgrid-aware cue/loop math. TrackPlayer.js now consumes this same
 * hook so the two never drift apart (loop-accuracy and click-suppression
 * fixes only need to exist in one place).
 *
 * MIDI (DDJ-FLX4) wiring deliberately stays out of this hook - the
 * controller hook is currently hardcoded to a single physical deck, and
 * mapping N virtual decks onto a 2-channel physical surface is a separate
 * problem. Callers that want MIDI (currently just TrackPlayer) wire
 * useDdjFlx4Controller themselves against the handlers this hook returns.
 *
 * `externalVolume`, when provided, lets a parent mixer (Green Room's
 * per-channel fader x crossfader) drive this deck's gain from outside
 * instead of the deck owning its own fader - the mixer needs to be the
 * single source of truth for gain across every deck at once. Omit it
 * (TrackPlayer's case, with no external mixer) and the hook manages its
 * own volume state via the returned setVolume, as before.
 */
export function useDeckPlayer(track, { externalVolume, getSyncTarget } = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(externalVolume ?? 0.7);

  useEffect(() => {
    if (externalVolume != null) setVolumeState(externalVolume);
  }, [externalVolume]);
  const [cuePoint, setCuePoint] = useState(0);
  const [loop, setLoop] = useState({ start: null, end: null });
  const [quantize, setQuantize] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [id3Data, setId3Data] = useState(null);
  const [albumCover, setAlbumCover] = useState(null);
  const cuePreviewRef = useRef(false);
  const audioRef = useRef(null);
  const loopPlayback = useLoopPlayback();

  // Read fresh every render rather than memoized - GreenRoom recomputes
  // which deck is the current sync target on every render (it depends on
  // every other deck's live isPlaying/bpm), so a stale closure here would
  // keep syncing against whichever deck happened to be the target when
  // this callback was first created.
  const getSyncTargetRef = useRef(getSyncTarget);
  getSyncTargetRef.current = getSyncTarget;

  // Forward reference to applySyncPhase (defined further down, after
  // getPlaybackTime/getBeatgrid exist) - the playback effect below needs
  // to call it *before* audio.play() runs, so the deck starts already in
  // phase instead of playing from the old position for a frame and then
  // jumping. Assigned during render, same idiom as getSyncTargetRef, so
  // it's never stale by the time an effect reads it.
  const applySyncPhaseRef = useRef(null);

  const handleJogStart = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, []);

  const handleJogEnd = useCallback(() => {
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

  const loadID3Tags = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target.result;
        const dataView = new DataView(arrayBuffer);
        if (dataView.getUint32(0) === 0x49443300) { // "ID3"
          const parsed = parseID3v2(dataView);
          if (parsed.metadata && Object.keys(parsed.metadata).length > 0) {
            setId3Data(parsed.metadata);
          }
          if (parsed.picture) {
            setAlbumCover(parsed.picture);
          }
        }
      } catch (error) {
        console.log('Error reading ID3 tags:', error);
      }
    };
    reader.onerror = () => console.log('Error reading file for ID3 tags');
    reader.readAsArrayBuffer(file);
  }, []);

  // Load audio (and opportunistically ID3 tags) whenever the track changes.
  useEffect(() => {
    let audioUrl = null;

    const loadAudioFile = async () => {
      try {
        if (track && track.file) {
          loadID3Tags(track.file);
          audioUrl = URL.createObjectURL(track.file);
          if (audioRef.current) audioRef.current.src = audioUrl;
        } else if (track && (track.downloadURL || track.storagePath)) {
          if (track.downloadURL) {
            if (audioRef.current) audioRef.current.src = track.downloadURL;
          } else {
            try {
              const audioFile = await TrackService.getAudioFile(track);
              loadID3Tags(audioFile);
              audioUrl = URL.createObjectURL(audioFile);
              if (audioRef.current) audioRef.current.src = audioUrl;
            } catch (error) {
              console.error('Failed to fetch audio file, using download URL directly');
              if (audioRef.current) audioRef.current.src = track.downloadURL;
            }
          }

          if (track.duration) {
            setDuration(track.duration);
          } else if (track.waveformData?.duration) {
            setDuration(track.waveformData.duration);
          }
        } else {
          setId3Data(null);
          setAlbumCover(null);
          if (audioRef.current) audioRef.current.src = '';
        }
      } catch (error) {
        console.error('Error loading audio file:', error);
        setId3Data(null);
        setAlbumCover(null);
        if (audioRef.current) audioRef.current.src = '';
      }

      // Start decoding for Web Audio loop playback now, in the background,
      // instead of lazily on first loop activation - that lazy path used to
      // run a full fetch + decodeAudioData of the whole track right as
      // <audio> was paused for the loop handoff, producing an audible gap
      // on the first loop only (later loops hit ensureBuffer's cache).
      if (audioRef.current?.src) {
        loopPlayback.preload(audioRef.current.src);
      }
    };

    loadAudioFile();

    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    loopPlayback.setVolume(volume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const handleLoadedMetadata = () => {
      setDuration(track?.duration || audio.duration);
    };
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
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
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);

  // Reset cue/loop/sync state whenever a different track is loaded - a
  // sync lock (and its matched tempo) is meaningless once the track it was
  // computed against is gone.
  useEffect(() => {
    setCuePoint(0);
    setLoop({ start: null, end: null });
    setSyncEnabled(false);
    cuePreviewRef.current = false;
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
      // Snap phase to the sync target *before* play() rather than after -
      // starting already-aligned instead of playing a frame from the old
      // position and then jumping. `audio.paused` (not a "was playing"
      // ref) is what gates this, so it fires on every genuine
      // paused-to-playing transition regardless of which dependency
      // (isPlaying, or e.g. playbackRate ticking from the sync-follow
      // interval) caused this effect to re-run.
      if (syncEnabled) applySyncPhaseRef.current?.();
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

  // Drive the displayed playhead from a rAF loop for the entire time
  // audio is playing - see TrackPlayer's original comment history for why
  // relying solely on the <audio> element's 'timeupdate' event (throttled
  // to ~4/sec) isn't tight enough for a DJ-view playhead or for a
  // just-clicked cue/loop point to visually land where it was clicked.
  useEffect(() => {
    if (!isPlaying) return undefined;
    let raf;
    const update = () => {
      const t = loopPlayback.isActive() ? loopPlayback.getCurrentTime() : audioRef.current?.currentTime;
      if (t != null) setCurrentTime(t);
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Correct current-position read regardless of which engine is driving
  // playback right now - used anywhere a handler needs "where are we
  // actually playing from" (cue/loop point placement).
  const getPlaybackTime = useCallback(() => {
    if (loopPlayback.isActive()) {
      const t = loopPlayback.getCurrentTime();
      if (t != null) return t;
    }
    return audioRef.current ? audioRef.current.currentTime : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getBeatgrid = useCallback(() => track?.beatgrid || track?.beatGrid || [], [track]);

  // What this deck offers *other* decks that might want to sync to it -
  // its current effective tempo (stored BPM adjusted by this deck's own
  // pitch/sync rate, matching the jog wheel's live BPM readout) plus enough
  // beatgrid/position info for a syncing deck to work out phase alignment.
  const getSyncInfo = useCallback(() => ({
    bpm: track?.bpm ? track.bpm * playbackRate : null,
    beatgrid: getBeatgrid(),
    currentTime: getPlaybackTime(),
    isPlaying,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [track, playbackRate, getBeatgrid, isPlaying]);

  // Matches this deck's tempo to whatever `getSyncTarget()` currently
  // returns (the other deck GreenRoom has decided is the sync target -
  // typically "the other deck that's currently playing"). Returns whether
  // a target with a usable BPM was actually found, so callers (toggling
  // sync on) know whether it's also worth snapping phase right now.
  //
  // Clamped to the same 0.9-1.1 range as the on-screen pitch slider -
  // going further would move the deck's tempo somewhere the pitch fader
  // can't even display/represent, and a BPM ratio that extreme almost
  // always means the two tracks aren't a sensible pair to beatmatch anyway
  // (e.g. a double/half-time mismatch) rather than something to force.
  const applySyncTempo = useCallback(() => {
    if (!track?.bpm) return false;
    const target = getSyncTargetRef.current?.();
    if (!target?.bpm) return false;
    const rate = Math.min(1.1, Math.max(0.9, target.bpm / track.bpm));
    setPlaybackRate(rate);
    return true;
  }, [track]);

  // Snaps this deck's position so its nearest beat lines up with the sync
  // target's nearest beat - a one-time phase correction, not something run
  // on every poll tick (see the sync-follow effect below), matching how
  // hardware/DJ-software sync behaves: tempo is tracked continuously, but
  // phase is only re-snapped at the moment sync engages (or play resumes)
  // rather than fighting the beat every tick, which would be audible as a
  // constant wobble.
  //
  // Uses each deck's real detected beatgrid rather than an assumed constant
  // interval, same reasoning as the rest of this file's beat math - two
  // tracks' beats are only truly "aligned" relative to where each one's
  // analyzer actually found them, not to an idealized grid.
  const applySyncPhase = useCallback(() => {
    const audio = audioRef.current;
    const target = getSyncTargetRef.current?.();
    if (!audio || !target?.beatgrid?.length || loopPlayback.isActive()) return;
    const ownGrid = getBeatgrid();
    if (ownGrid.length === 0) return;

    const now = getPlaybackTime();
    const ownOffset = now - ownGrid[findNearestBeatIndex(ownGrid, now)];
    const targetOffset = target.currentTime - target.beatgrid[findNearestBeatIndex(target.beatgrid, target.currentTime)];

    const newTime = now + (targetOffset - ownOffset);
    if (newTime < 0 || (duration && newTime > duration)) return;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getBeatgrid, getPlaybackTime, duration]);
  applySyncPhaseRef.current = applySyncPhase;

  const toggleSync = useCallback(() => {
    setSyncEnabled((prev) => {
      const next = !prev;
      if (next && applySyncTempo() && isPlaying) applySyncPhase();
      return next;
    });
  }, [applySyncTempo, applySyncPhase, isPlaying]);

  // Continuously re-matches tempo while sync is on, so this deck tracks the
  // target deck's tempo even as the target's own pitch (or its own sync)
  // keeps moving - a plain interval rather than requestAnimationFrame since
  // tempo doesn't need to be corrected any faster than roughly a few times
  // a second to stay musically locked.
  useEffect(() => {
    if (!syncEnabled) return undefined;
    const id = setInterval(applySyncTempo, 250);
    return () => clearInterval(id);
  }, [syncEnabled, applySyncTempo]);


  // Manual loop/cue points landing a few ms off the real beat is exactly
  // what makes hand-set loops sound "off" on every repeat - snapping to
  // the nearest detected beat (real detected positions, not an assumed
  // constant tempo) is what a hardware CDJ's quantize does too.
  const quantizePoint = useCallback(
    (time) => (quantize ? quantizeTimeToBeat(time, getBeatgrid()) : time),
    [quantize, getBeatgrid]
  );

  // Standard CDJ-style CUE behavior:
  // - pressed while playing: stop and jump back to the cue point.
  // - pressed while paused, already at the cue point: preview-play for as
  //   long as the button is held.
  // - pressed while paused elsewhere (e.g. after seeking on the waveform):
  //   drop a new cue point at the current position.
  const handleCuePress = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, loop.start, loop.end, cuePoint, quantizePoint]);

  const handleCueRelease = useCallback(() => {
    if (!cuePreviewRef.current) return;
    cuePreviewRef.current = false;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = cuePoint;
      setCurrentTime(cuePoint);
    }
    setIsPlaying(false);
  }, [cuePoint]);

  const handleLoopIn = useCallback(() => {
    setLoop({ start: quantizePoint(getPlaybackTime()), end: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantizePoint]);

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
  const getLoopEndTime = useCallback((startTime, beatCount) => {
    const beatgrid = getBeatgrid();
    if (beatgrid.length > 1) {
      const startIdx = findNearestBeatIndex(beatgrid, startTime);
      const end = estimateLoopEnd(beatgrid, startIdx, beatCount);
      if (end != null) return end;
    }
    return track?.bpm ? startTime + (60 / track.bpm) * beatCount : null;
  }, [getBeatgrid, track]);

  const handleLoopOut = useCallback(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop.start, quantize, getBeatgrid, track, getLoopEndTime]);

  // Single physical button: creates an instant 4-beat loop from the
  // current position when nothing is looping, exits the active loop
  // otherwise - matches the DDJ-FLX4's "4 BEAT / EXIT" labeling.
  const handleLoop4BeatOrExit = useCallback(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop.start, loop.end, quantize, quantizePoint, getLoopEndTime, track]);

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
  const requantizedLoopEnd = useCallback((beatCount) => {
    if (!Number.isInteger(beatCount) || beatCount < 1) return null;
    return quantize ? getLoopEndTime(loop.start, beatCount) : null;
  }, [quantize, getLoopEndTime, loop.start]);

  const currentLoopBeatCount = useCallback(() => {
    const beatgrid = getBeatgrid();
    const startIdx = findNearestBeatIndex(beatgrid, loop.start);
    const interval = estimateLocalBeatInterval(beatgrid, startIdx) || (track?.bpm ? 60 / track.bpm : null);
    return interval ? (loop.end - loop.start) / interval : null;
  }, [getBeatgrid, loop.start, loop.end, track]);

  const handleLoopCallLeft = useCallback(() => {
    if (loop.start == null || loop.end == null) return;
    const newLength = (loop.end - loop.start) / 2;
    if (newLength < 0.05) return;
    const beatCount = currentLoopBeatCount();
    const halved = beatCount != null ? Math.round(beatCount) / 2 : null;
    const end = requantizedLoopEnd(halved);
    setLoop({ start: loop.start, end: end ?? loop.start + newLength });
  }, [loop.start, loop.end, currentLoopBeatCount, requantizedLoopEnd]);

  const handleLoopCallRight = useCallback(() => {
    if (loop.start == null || loop.end == null) return;
    const beatCount = currentLoopBeatCount();
    const doubled = beatCount != null ? Math.round(beatCount) * 2 : null;
    const end = requantizedLoopEnd(doubled);
    setLoop({ start: loop.start, end: end ?? loop.start + (loop.end - loop.start) * 2 });
  }, [loop.start, loop.end, currentLoopBeatCount, requantizedLoopEnd]);

  return {
    audioRef,
    isPlaying, togglePlay, setIsPlaying,
    currentTime, duration,
    volume, setVolume: setVolumeState,
    cuePoint, loop, quantize, setQuantize,
    playbackRate, setPlaybackRate,
    syncEnabled, setSyncEnabled, toggleSync,
    id3Data, albumCover,
    handleJogStart, handleJogEnd, handleSeekToTime,
    handleCuePress, handleCueRelease,
    handleLoopIn, handleLoopOut, handleLoop4BeatOrExit, handleLoopCallLeft, handleLoopCallRight,
    getPlaybackTime, getBeatgrid, getSyncInfo,
  };
}
