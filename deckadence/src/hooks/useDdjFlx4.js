import { useEffect, useRef, useState } from 'react';

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
  const [status, note, velocity = 0] = data;
  const statusType = status & 0xf0;
  const channel = status & 0x0f;

  if (statusType !== 0x90 && statusType !== 0x80) return null;
  if (channel !== 0 && channel !== 1) return null;

  const control = NOTE_TO_CONTROL[note];
  if (!control) return null;

  return {
    deck: channel === 0 ? 1 : 2,
    control,
    pressed: statusType === 0x90 && velocity > 0,
  };
}

/**
 * Connects to a DDJ-FLX4 (or any Web MIDI input, as a fallback) and routes
 * Deck 1's PLAY, CUE and loop buttons to the given handlers. Deck 2 is
 * ignored for now since the track library preview only has one deck to
 * control.
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
    deviceName: null,
    error: null,
  });

  useEffect(() => {
    if (!status.supported) return;
    let midiAccess = null;
    let activeInput = null;

    const onMessage = (event) => {
      const decoded = decodeDdjFlx4Message(event.data);
      if (!decoded || decoded.deck !== 1) return;

      const h = handlersRef.current || {};
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
        default:
          break;
      }
    };

    const attachInput = (input) => {
      if (activeInput) activeInput.onmidimessage = null;
      activeInput = input;
      if (input) {
        input.onmidimessage = onMessage;
        setStatus((s) => ({ ...s, connected: true, deviceName: input.name, error: null }));
      } else {
        setStatus((s) => ({ ...s, connected: false, deviceName: null }));
      }
    };

    const pickInput = () => {
      if (!midiAccess) return;
      const inputs = Array.from(midiAccess.inputs.values());
      const ddj = inputs.find((i) => /ddj-?flx4/i.test(i.name || ''));
      attachInput(ddj || inputs[0] || null);
    };

    navigator.requestMIDIAccess()
      .then((access) => {
        midiAccess = access;
        pickInput();
        access.onstatechange = pickInput;
      })
      .catch((error) => {
        setStatus((s) => ({ ...s, connected: false, error: error.message }));
      });

    return () => {
      if (activeInput) activeInput.onmidimessage = null;
      if (midiAccess) midiAccess.onstatechange = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.supported]);

  return status;
}
