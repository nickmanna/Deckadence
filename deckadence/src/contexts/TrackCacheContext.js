import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import { TrackService } from '../services/trackService';

const TrackCacheContext = createContext();

export const useTrackCache = () => {
  const context = useContext(TrackCacheContext);
  if (!context) {
    throw new Error('useTrackCache must be used within a TrackCacheProvider');
  }
  return context;
};

// Every field here is a pure function of the same tracks array this
// provider already holds in memory, so deriving stats locally replaces
// what used to be a second Firestore round trip (TrackService.getUserStats
// called getUserTracks all over again internally).
const computeStats = (tracks) => {
  const stats = {
    totalTracks: tracks.length,
    totalDuration: tracks.reduce((sum, t) => sum + (t.duration || 0), 0),
    averageBPM: tracks.length > 0
      ? tracks.reduce((sum, t) => sum + (t.bpm || 0), 0) / tracks.length
      : 0,
    totalPlays: tracks.reduce((sum, t) => sum + (t.playCount || 0), 0),
    totalLikes: tracks.reduce((sum, t) => sum + (t.likeCount || 0), 0),
    keyDistribution: {},
    bpmDistribution: {},
  };

  tracks.forEach((t) => {
    const key = t.key || 'Unknown';
    stats.keyDistribution[key] = (stats.keyDistribution[key] || 0) + 1;
  });

  tracks.forEach((t) => {
    const bpm = t.bpm || 0;
    if (bpm > 0) {
      const bpmRange = Math.floor(bpm / 10) * 10;
      const rangeKey = `${bpmRange}-${bpmRange + 9}`;
      stats.bpmDistribution[rangeKey] = (stats.bpmDistribution[rangeKey] || 0) + 1;
    }
  });

  return stats;
};

/**
 * Single shared cache of the signed-in user's track library, loaded once
 * when a user becomes available rather than ad hoc by whichever page
 * happens to mount next.
 *
 * Before this existed, DiscoverPage, TrackLibraryPage, and GreenRoom each
 * ran their own `TrackService.getUserTracks`/`getUserStats` fetch on
 * mount - navigating between them re-hit Firestore for the exact same data
 * every time, each showing its own loading state for a fetch that had
 * often already happened seconds earlier. Consumers now read from here via
 * `useTrackCache()`; the first page to mount after login pays the fetch
 * cost, everyone else reads memory.
 */
export const TrackCacheProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Which uid the in-flight/last fetch belongs to - guards against a slow
  // fetch for a user who has since logged out (or switched accounts)
  // resolving late and clobbering the next user's state.
  const loadedForUidRef = useRef(null);

  const fetchTracks = useCallback(async (uid) => {
    setLoading(true);
    setError(null);
    try {
      const result = await TrackService.getUserTracks(uid);
      if (loadedForUidRef.current === uid) setTracks(result);
      return result;
    } catch (err) {
      if (loadedForUidRef.current === uid) setError(err);
      throw err;
    } finally {
      if (loadedForUidRef.current === uid) setLoading(false);
    }
  }, []);

  // The "on start" load - fires once as soon as a user is available, not
  // whenever some page happens to mount.
  useEffect(() => {
    if (!currentUser) {
      loadedForUidRef.current = null;
      setTracks([]);
      setLoading(false);
      setError(null);
      return;
    }
    loadedForUidRef.current = currentUser.uid;
    fetchTracks(currentUser.uid).catch((err) => console.error('Error pre-loading track library:', err));
  }, [currentUser, fetchTracks]);

  const refresh = useCallback(() => {
    if (!currentUser) return Promise.resolve([]);
    return fetchTracks(currentUser.uid);
  }, [currentUser, fetchTracks]);

  // Optimistic local insert so a track just saved in TrackAnalysisPage
  // shows up in Library/Green Room immediately instead of waiting on
  // whatever page reads the cache next to trigger a full refetch.
  const addTrack = useCallback((track) => {
    setTracks((prev) => [track, ...prev]);
  }, []);

  // Merges a partial update (e.g. a lazily-resolved Storage download URL)
  // into one cached track by id, so every consumer sees it without a
  // refetch.
  const patchTrack = useCallback((trackID, patch) => {
    setTracks((prev) => prev.map((t) => (t.trackID === trackID ? { ...t, ...patch } : t)));
  }, []);

  const stats = useMemo(() => computeStats(tracks), [tracks]);

  const value = useMemo(() => ({
    tracks, loading, error, stats,
    refresh, addTrack, patchTrack,
  }), [tracks, loading, error, stats, refresh, addTrack, patchTrack]);

  return (
    <TrackCacheContext.Provider value={value}>
      {children}
    </TrackCacheContext.Provider>
  );
};
