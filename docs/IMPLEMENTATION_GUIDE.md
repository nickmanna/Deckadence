# Deckadence

## Implementation Guide — v1.1

**Status:** In Progress
**Owner:** Nick Manna

> This is a living document — update it as features land. Add a row to the
> [Change Log](#change-log) whenever you make a meaningful update, and keep
> section 5 (Feature Reference) in sync with what's actually shipped rather
> than what's planned (planned work belongs in section 7, Roadmap).

---

## 1. Overview

Deckadence is a cloud-based, multi-user DJ platform with two halves:

1. A **track analysis pipeline** — upload audio, a Python backend detects
   BPM/key/beatgrid, and the result is stored per-user in Firebase.
2. **Green Room** — a browser-based virtual DJ mixer (2-4 decks) for
   practicing/performing with that analyzed library, including support for
   a real Pioneer DDJ-FLX4 controller over Web MIDI.

Current end-user capabilities:

- Upload a track (mp3/wav/flac/ogg/m4a/aac) and get BPM, key (+ Camelot),
  and a real detected beatgrid back.
- Browse/filter a personal track library (by BPM range, key) with waveform
  previews.
- Mix live in Green Room: per-deck play/cue/loop (in/out/4-beat/½/×2)
  with beatgrid-quantized cue and loop points, pitch control, per-channel
  faders + crossfader, 2CH/4CH layout toggle.
- **Beat sync** — press SYNC on a deck to match its tempo (and snap its beat
  phase) to whichever other deck is currently playing; tempo continues to
  track live while sync is engaged.
- Drive Green Room's left/right decks from a real DDJ-FLX4 (play, cue, loop,
  channel faders, tempo fader, crossfader) over Web MIDI.

### 1.1 Architecture — Current State

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React 19 (CRA), react-router-dom | UI, all playback (`<audio>` + Web Audio), MIDI |
| Auth | Firebase Auth | User accounts |
| Data | Firestore (client SDK, direct from browser) | Track documents, user stats, memory cues |
| File storage | Firebase Storage | Uploaded audio files |
| Analysis backend | Flask + librosa (Cloud Run) | Stateless BPM/key/beatgrid analysis only |

```
Browser (React)
   ├──▶ Firebase Auth / Firestore / Storage   (track CRUD, audio files, user data)
   └──▶ Flask backend (Cloud Run)             (POST /api/analyze → BPM/key/beatgrid)
```

The Flask backend is **stateless** with respect to track data: `main.py`
does carry a `tracks_collection` in-memory dict and matching `/api/tracks*`
endpoints, but the frontend does not use them — `TrackService`
(`deckadence/src/services/trackService.js`) writes the analyzed track
document straight to Firestore from the client after calling
`/api/analyze`. Anything in that in-memory store is lost on every Cloud Run
cold start and isn't part of the real data path (see [8. Known Gaps](#8-known-gaps--tech-debt)).

The user's track list is fetched from Firestore **once per session** (via
`TrackCacheContext`, see [5.6](#56-track--audio-caching)) rather than by
each page independently — Discover/Library/Green Room all read the same
in-memory cache instead of each firing its own Firestore query on mount.

Every deck in Green Room owns its own playback state independently (its own
`<audio>` element, its own loop/cue/pitch/sync state via `useDeckPlayer`) —
there is no shared audio graph or master clock across decks. Mixer-level
state (per-channel gain, crossfader) is the one thing lifted up to
`GreenRoom.js`, since it needs to be a single source of truth across every
visible deck at once.

### 1.2 Architecture — Planned

- EQ per channel — needs each deck's audio routed through Web Audio
  `BiquadFilterNode`s instead of plain `<audio>` element playback (today's
  playback engine only reaches for Web Audio during active loops).
- DDJ-FLX4 hardware SYNC button wired to the new software sync (see
  [7. Roadmap](#7-roadmap)).
- Lighting/show control — does not exist yet in any form; "Green Room" is
  purely the DJ-mixer page name, not a lighting concept.

## 2. Prerequisites

| Component | Requirement | Notes |
|---|---|---|
| Node.js | 18+ | Create React App 5 / React 19 |
| npm | bundled with Node | `deckadence/package.json` scripts |
| Python | 3.11+ | Matches `Dockerfile`'s base image |
| Firebase project | Auth + Firestore + Storage enabled | See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) |
| Browser | Chrome or Edge | Web MIDI API required for DDJ-FLX4 support (Firefox/Safari don't support it) |
| Pioneer DDJ-FLX4 | Optional | Only needed to test hardware MIDI control; Green Room fully works with mouse/keyboard without it |
| gcloud CLI | Latest | Only for manual Cloud Run deploys / CI setup |
| firebase-tools | Latest | Only for manual Hosting/Firestore-rules deploys |

## 3. Environment Configuration

The frontend reads all config from `deckadence/.env` (copy from
`.env.example`, gitignored, never commit real values):

| Variable | Purpose |
|---|---|
| `REACT_APP_FIREBASE_API_KEY` | Firebase web config |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | Firebase web config |
| `REACT_APP_FIREBASE_PROJECT_ID` | Firebase web config |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | Firebase web config |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | Firebase web config |
| `REACT_APP_FIREBASE_APP_ID` | Firebase web config |
| `REACT_APP_FIREBASE_MEASUREMENT_ID` | Firebase web config |
| `REACT_APP_API_BASE_URL` | Base URL of the Flask analysis backend (defaults to `http://localhost:5000`) |

Note: a Firebase web `apiKey` etc. are not secrets in the way a service
account key is — see [SECURITY.md](../SECURITY.md) for why, and for what
*does* need to stay server-side only.

The backend (`main.py`) currently takes no required environment
configuration beyond what Cloud Run injects (`PORT`).

## 4. Local Setup — Step by Step

### Step 1 — Frontend

```bash
cd deckadence
cp .env.example .env      # then fill in Firebase values
npm install
npm start                 # http://localhost:3000
```

### Step 2 — Backend

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py            # http://localhost:5000
```

### Step 3 — Verify

- `curl http://localhost:5000/api/health` → `{"status": "healthy", ...}`
- Sign up / log in on the frontend, upload a track under **Track Analysis**,
  confirm BPM/key/beatgrid come back and the track appears in **Track
  Library**.
- Open **Green Room**, drag a track onto a deck, hit play. Load a second
  track on the other deck, hit its **SYNC** button while the first is
  playing, and confirm its tempo/pitch value snaps to match.
- (Optional) Plug in a DDJ-FLX4, click **Connect MIDI** in Green Room's top
  bar, confirm the status changes to `🎛️ MIDI: L/R decks` and the hardware
  transport controls respond.

## 5. Feature Reference

### 5.1 Track Analysis (`POST /api/analyze`)

Stateless endpoint — accepts a multipart file upload, returns analysis
results. Does not persist anything server-side today (see [1.1](#11-architecture--current-state)).

Implemented in `trackanalysis.py` (`TrackAnalyzer`):

- **BPM** — bass/kick-emphasized onset envelope → `librosa.beat.beat_track`
  → cleaned (outlier-corrected) beat times → tempo from the median beat
  interval.
- **Key** — weighted chromagram analysis, reported as both a musical key and
  Camelot wheel notation.
- **Beatgrid** — the actual cleaned detected beat timestamps (not a
  synthetic constant-tempo grid) plus an estimated downbeat offset.

### 5.2 Track Library / Firestore Track Document

Written by `TrackService.saveTrack` after analysis. Key fields consumed by
the player (`deckadence/src/hooks/useDeckPlayer.js`):

| Field | Used for |
|---|---|
| `bpm` | Jog wheel BPM readout, sync tempo matching, un-quantized loop-length fallback |
| `beatgrid` / `beatGrid` | Quantized cue/loop placement, beat-sync phase alignment |
| `downbeatOffset` | Reserved — not yet consumed by the frontend |
| `storagePath` / `downloadURL` | Resolving the playable audio file from Firebase Storage |

### 5.3 Green Room — Virtual Mixer

`deckadence/src/components/GreenRoom.js` owns the mixer-level state; each
channel renders a `Deck` (`Deck.js`), whose actual playback engine is
`useDeckPlayer`.

| Control | Behavior |
|---|---|
| 2CH / 4CH toggle | Switches how many of the 4 possible channels are visible |
| Per-channel fader × crossfader | Computed in `GreenRoom.js` (`getEffectiveVolume`), passed into each deck as `externalVolume` — the mixer is the single source of truth for gain |
| CUE | CDJ-style: stop+return-to-cue while playing, preview-while-held when paused at cue, drop new cue point otherwise |
| Loop IN / OUT / 4 / ½ / ×2 | Beatgrid-quantized when quantize (`Q`) is on |
| Pitch | 0.9-1.1× playback rate; locked while SYNC is engaged |

### 5.4 Beat Sync

Per-deck `SYNC` toggle (`Deck.js`, logic in `useDeckPlayer.js`).

- **Target selection** — `GreenRoom.js`'s `getSyncTargetForDeck` picks
  whichever *other* visible deck is currently playing (first match in
  on-screen channel order). There is no explicit "master" concept yet.
- **Tempo** — polled every 250ms while sync is on; this deck's
  `playbackRate` is set to `targetBPM / ownTrackBPM`, clamped to the same
  0.9-1.1 range as the manual pitch slider.
- **Phase** — snapped once, at the moment sync is engaged and again each
  time this deck transitions from paused to playing while synced (not
  continuously — continuous phase correction would be audibly perceptible
  as pitch wobble). Uses each deck's real detected beatgrid via
  `findNearestBeatIndex` (`beatQuantize.js`), not an assumed constant
  interval.
- If no other deck is playing, SYNC arms but is a no-op until one is.

### 5.5 DDJ-FLX4 MIDI Controller

`deckadence/src/hooks/useDdjFlx4.js`, mapped from Pioneer's official MIDI
message list (`DDJ-FLX4_MIDI_message_List_E1.pdf`, repo root).

| Hardware control | Wired to |
|---|---|
| Play/Cue/Loop IN/OUT/4-beat/½/×2 | Deck transport (channel 0 = left deck, channel 1 = right deck) |
| Channel fader | `channelFaders` mixer state |
| Tempo fader | Deck's `playbackRate` (0.9-1.1 range) |
| Crossfader | `crossfader` mixer state |
| **SYNC button** | **Not wired yet** — no note number captured from the MIDI PDF (needs `poppler-utils`/similar to extract, or the value pulled from Pioneer's spec directly); would call the same `toggleSync` the on-screen button uses |

Only 2 physical decks exist on the hardware, mapped to Green Room channels 1
and 2 regardless of 2CH/4CH mode — channels 3/4 have no physical deck to
receive MIDI from.

### 5.6 Track & Audio Caching

`deckadence/src/contexts/TrackCacheContext.js` — a single in-memory cache
of the signed-in user's track list, shared by Discover, Track Library, and
Green Room via `useTrackCache()`.

- **Loaded once per session**, right when a user becomes available
  (`currentUser` changing in `AuthContext`), not ad hoc by whichever page
  happens to mount — before this existed, Discover (`getUserStats`),
  Library (`getUserTracks`), and Green Room (`getUserTracks` +
  `getUserStats`) each ran their own independent Firestore fetch on every
  mount, so navigating between them re-fetched the same data repeatedly.
- **Stats are derived locally** (`computeStats`) from the same cached
  array instead of a second Firestore round trip — `getUserStats` on
  `TrackService` still exists but nothing calls it anymore.
- **Optimistic insert on save** — `TrackAnalysisPage`'s save flow calls
  `addTrack()` after `TrackService.saveTrack` succeeds, so a newly saved
  track appears in Library/Green Room immediately rather than waiting on
  the next full refetch.
- **`refresh()`/`patchTrack()`** are exposed for cases that do need to
  invalidate or update one cached entry, but nothing calls them yet.

Separately, `TrackService.getAudioFile` (the fallback audio-loading path
used when a track has a `storagePath` but no persisted `downloadURL`)
caches each resolved Storage download URL in a module-level `Map` keyed by
`storagePath`, so `getDownloadURL()` — itself a network round trip — only
runs once per track per session instead of on every load. Tracks saved
through the normal upload flow already have `downloadURL` persisted on the
Firestore document (see 5.2), so this fallback path is mostly a safety net
for legacy/edge-case tracks; the common case skips straight to
`audio.src = track.downloadURL` and lets the browser stream/cache it
natively.

## 6. Security Model

| Control | Implementation |
|---|---|
| Auth | Firebase Auth; Firestore/Storage rules scope reads/writes to `request.auth.uid` matching the resource owner |
| Client config | Firebase web `apiKey` etc. are env vars, not hardcoded — but are not secret once bundled; real protection is Firestore/Storage rules + HTTP-referrer key restriction |
| Upload validation | Backend rejects file extensions outside `mp3/wav/flac/ogg/m4a/aac`; 100MB request cap (`MAX_CONTENT_LENGTH`) |
| CI/CD credentials | GitHub Actions → GCP via Workload Identity Federation; no long-lived service account key ever leaves Google |
| Deploy service account | Least-privilege, dedicated — not a personal or Owner-role account |
| **Backend CORS** | **Fully open** (`CORS(app)`, no origin restriction) on a publicly reachable, unauthenticated Cloud Run service — any site can call `/api/analyze` today |
| Firebase App Check | Not yet enabled |

See [SECURITY.md](../SECURITY.md) for the full list of what's done vs. what
still needs a human decision (API key rotation, CORS scoping, App Check).

## 7. Roadmap

- [ ] Wire DDJ-FLX4 hardware SYNC button to `toggleSync` (blocked only on
      pulling the note number from the MIDI PDF).
- [ ] Per-channel EQ (needs a Web Audio filter-node signal path per deck).
- [ ] Explicit "sync master" designation, if implicit (whichever deck is
      already playing) proves confusing with 4 decks.
- [ ] Decide the fate of `main.py`'s in-memory `tracks_collection` /
      `/api/tracks*` endpoints — either wire them to real persistence or
      remove them, since the frontend doesn't use them today.
- [ ] Scope backend CORS to the deployed frontend origin(s); consider
      requiring a verified Firebase Auth token before `/api/analyze` sees
      production traffic.
- [ ] Enable Firebase App Check.
- [ ] Social features / shared playlists (per `CLOUD_ARCHITECTURE.md`'s
      original migration path — not started).

## 8. Known Gaps / Tech Debt

- `docs/BACKEND.md`'s documented `/api/analyze` response shape doesn't match
  `main.py`'s actual output (the doc predates the current `TrackAnalyzer`
  integration) — trust `main.py`/`trackanalysis.py` over that doc until it's
  refreshed.
- `main.py` maintains an in-memory `tracks_collection` and `/api/tracks*`
  CRUD endpoints that nothing in the frontend calls — real track persistence
  goes through `TrackService` straight to Firestore. Don't build new
  features against the backend's endpoints assuming they're the source of
  truth for track data.
- No shared master clock across Green Room decks — beat sync (5.4) is a
  best-effort tempo/phase match, not sample-accurate lockstep playback.
- `TrackCacheContext` (5.6) is in-memory only and scoped to one browser
  session — a track edited/liked/deleted in another tab or device won't
  show up here until the tab reloads (nothing currently mutates a track
  after save, so this isn't yet a real inconsistency, just a limitation to
  keep in mind once something does).

## 9. Troubleshooting

### Frontend shows a blank page / Firebase errors on load
- Confirm `deckadence/.env` exists and every `REACT_APP_FIREBASE_*` value is
  filled in (copy from `.env.example`).
- Restart `npm start` after editing `.env` — CRA only reads it at startup.

### Track upload fails / "Analysis failed"
- Confirm the backend is running and `REACT_APP_API_BASE_URL` points at it.
- Check the backend console output — `trackanalysis.py` logs each analysis
  stage; a truncated/corrupt audio file is the most common cause.
- In production, check Cloud Run memory — a real upload has previously
  OOM-killed the default 512Mi instance (see `DEPLOYMENT.md` §4a); current
  sizing is 2Gi/2CPU.

### DDJ-FLX4 not connecting
- Web MIDI requires Chrome or Edge — Firefox and Safari don't implement it.
- The browser only prompts for MIDI permission from a real user gesture —
  click **Connect MIDI** rather than expecting auto-connect.
- Confirm the controller shows up in the OS as a MIDI device before
  blaming the app.

### Beat sync doesn't seem to do anything
- SYNC only has an effect once an *other* visible deck is actually playing —
  it arms silently otherwise and starts correcting as soon as one is.
- Confirm both decks' tracks have a detected `bpm` (an unanalyzed/mock track
  won't have one).

## Change Log

| Version | Date | Author | Notes |
|---|---|---|---|
| 1.1 | 2026-07-09 | Nick Manna | Added `TrackCacheContext` (5.6) — track list + derived stats now load once per session and are shared across Discover/Library/Green Room instead of each page re-fetching from Firestore on mount; `TrackService.getAudioFile` now caches resolved GCS download URLs per session too. |
| 1.0 | 2026-07-09 | Nick Manna | Initial implementation guide — captures track analysis pipeline, Green Room virtual mixer, beat sync, and DDJ-FLX4 MIDI support as of this date. |
