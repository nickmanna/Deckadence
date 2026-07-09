import { useCallback, useEffect, useRef, useState } from 'react';

// Deck 1/2 NOTE numbers for the controls this app currently hooks up, taken
// directly from Pioneer's official "DDJ-FLX4 List of MIDI messages" (Ver
// 1.0). Only the un-shifted press mapping is used for each - +SHIFT
// variants and the other decks/mixer controls aren't wired up yet.
const NOTE_TO_CONTROL = {
  11: 'play',
  12: 'cue',
  16: 'loopIn',
  17: 'loopOut',
  77: 'loopExit4Beat',
  81: 'loopCallLeft',
  83: 'loopCallRight',
};

// The three linear faders (Group 3. MIXER in the same MIDI message list),
// each sent as Control Change. The hardware actually sends a 14-bit
// MSB/LSB pair per fader (LSB CC = MSB CC + 32) for extra resolution, but
// this app only reads the MSB - 128 steps is already finer than a mouse
// drag on the equivalent on-screen slider, and every fader move sends the
// MSB regardless.
const CC_CHANNEL_FADER = 19; // per-deck volume fader - channel 0 (deck 1) / 1 (deck 2)
const CC_TEMPO = 0;          // pitch/tempo fader - channel 0 (deck 1) / 1 (deck 2)
const CC_CROSSFADER = 31;    // shared crossfader - channel 6, not tied to either deck

/**
 * Decode a raw Web MIDI message from a DDJ-FLX4 into a semantic control
 * event, or null if it's a message this app doesn't handle yet.
 *
 * The controller sends NOTE ON (status 0x9n) for both press and release of
 * these buttons, distinguished only by velocity (0x7F = pressed, 0x00 =
 * released) rather than a separate NOTE OFF status - handling both that
 * and genuine NOTE OFF (0x8n) keeps this correct regardless of how a given
 * driver/OS represents it.
 */
export function decodeDdjFlx4Message(data) {
  if (!data || data.length < 2) return null;
  const [status, data1, data2 = 0] = data;
  const statusType = status & 0xf0;
  const channel = status & 0x0f;

  if (statusType === 0xb0) {
    if (channel === 6 && data1 === CC_CROSSFADER) {
      return { deck: null, control: 'crossfader', value: data2 };
    }
    if (channel !== 0 && channel !== 1) return null;
    const deck = channel === 0 ? 1 : 2;
    if (data1 === CC_CHANNEL_FADER) return { deck, control: 'channelFader', value: data2 };
    if (data1 === CC_TEMPO) return { deck, control: 'tempo', value: data2 };
    return null;
  }

  if (statusType !== 0x90 && statusType !== 0x80) return null;
  if (channel !== 0 && channel !== 1) return null;

  const control = NOTE_TO_CONTROL[data1];
  if (!control) return null;

  return {
    deck: channel === 0 ? 1 : 2,
    control,
    pressed: statusType === 0x90 && data2 > 0,
  };
}

const toHex = (data) => Array.from(data).map((b) => b.toString(16).padStart(2, '0')).join(' ');

/**
 * Connects to a DDJ-FLX4 (or any Web MIDI input) and routes each physical
 * deck's PLAY, CUE, loop and fader controls to the handlers registered for
 * that deck. `handlers` is keyed by deck number - 1 for the left deck
 * (MIDI channel 0), 2 for the right deck (channel 1), per
 * decodeDdjFlx4Message above - e.g.
 * `{ 1: { onPlayPause, onChannelFaderChange, onTempoChange, ... }, 2: {...} }`.
 * A deck with no entry in the map is simply ignored, so a single-deck
 * caller (the track library preview) can pass just `{ 1: {...} }`.
 *
 * The crossfader isn't tied to either physical deck, so its handler is a
 * top-level `onCrossfaderChange` rather than living under a deck key.
 *
 * `onChannelFaderChange` and `onCrossfaderChange` are called with a 0-1
 * value (0 = fader at the bottom / hard left, 1 = top / hard right),
 * matching this app's existing volume and crossfader state range.
 * `onTempoChange` is also called with a 0-1 value - callers map that onto
 * whatever playbackRate range their pitch slider uses (0.9-1.1 today).
 *
 * Listens on EVERY currently available MIDI input, not just a single
 * best-guess pick - some controllers/OS combinations expose more than one
 * port for the same device, and picking the wrong one would silently drop
 * every message. Also exposes enough raw diagnostic state (all detected
 * device names, the last raw message seen, any request error) that
 * connection problems can be diagnosed from the UI instead of guessing.
 *
 * requestMIDIAccess() is NOT called automatically on mount - some browsers
 * only reliably show the permission prompt when it's triggered from a real
 * user gesture (click/tap), so callers must invoke the returned connect()
 * from an onClick handler. A silent best-effort attempt is still made on
 * mount in case permission was already granted in a previous session.
 *
 * Handlers are read from a ref that's refreshed every render, so callers
 * can pass plain inline functions without needing to memoize them or
 * worry about the MIDI event listener seeing stale state.
 */
export function useDdjFlx4Controller(handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const [status, setStatus] = useState({
    supported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
    connected: false,
    deviceNames: [],
    lastMessage: null,
    error: null,
  });

  const midiAccessRef = useRef(null);

  const onMessage = useCallback((event) => {
    setStatus((s) => ({ ...s, lastMessage: { hex: toHex(event.data), at: Date.now() } }));

    const decoded = decodeDdjFlx4Message(event.data);
    if (!decoded) return;

    if (decoded.control === 'crossfader') {
      handlersRef.current?.onCrossfaderChange?.(decoded.value / 127);
      return;
    }

    const h = (handlersRef.current || {})[decoded.deck];
    if (!h) return;
    switch (decoded.control) {
      case 'play':
        if (decoded.pressed) h.onPlayPause?.();
        break;
      case 'cue':
        if (decoded.pressed) h.onCuePress?.();
        else h.onCueRelease?.();
        break;
      case 'loopIn':
        if (decoded.pressed) h.onLoopIn?.();
        break;
      case 'loopOut':
        if (decoded.pressed) h.onLoopOut?.();
        break;
      case 'loopExit4Beat':
        if (decoded.pressed) h.onLoop4BeatOrExit?.();
        break;
      case 'loopCallLeft':
        if (decoded.pressed) h.onLoopCallLeft?.();
        break;
      case 'loopCallRight':
        if (decoded.pressed) h.onLoopCallRight?.();
        break;
      case 'channelFader':
        h.onChannelFaderChange?.(decoded.value / 127);
        break;
      case 'tempo':
        h.onTempoChange?.(decoded.value / 127);
        break;
      default:
        break;
    }
  }, []);

  const attachAllInputs = useCallback((access) => {
    const inputs = Array.from(access.inputs.values());
    inputs.forEach((input) => {
      input.onmidimessage = onMessage;
    });
    setStatus((s) => ({
      ...s,
      connected: inputs.length > 0,
      deviceNames: inputs.map((i) => i.name || '(unnamed device)'),
      error: null,
    }));
  }, [onMessage]);

  const connect = useCallback(() => {
    if (!status.supported) return;
    navigator.requestMIDIAccess()
      .then((access) => {
        midiAccessRef.current = access;
        attachAllInputs(access);
        access.onstatechange = () => attachAllInputs(access);
      })
      .catch((error) => {
        setStatus((s) => ({ ...s, connected: false, error: error.message }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.supported, attachAllInputs]);

  // Best-effort silent attempt on mount - succeeds instantly if this origin
  // was already granted MIDI permission in a previous visit, otherwise
  // no-ops (no permission prompt without a user gesture, by design).
  useEffect(() => {
    connect();
    return () => {
      const access = midiAccessRef.current;
      if (access) {
        access.onstatechange = null;
        access.inputs.forEach((input) => {
          input.onmidimessage = null;
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...status, connect };
}
