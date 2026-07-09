# Deckadence

Deckadence is a cloud-based, multi-user DJ platform: upload a track and a
Python backend analyzes its BPM, key, and beatgrid; browse and preview your
analyzed library; then mix live in **Green Room**, a browser-based 2-4 deck
virtual DJ console with crossfader/mixer, cue points, loops, quantize, beat
sync, and support for a real Pioneer DDJ-FLX4 controller over Web MIDI.
Everything is stored per-user in Firebase (Auth, Firestore, Storage).

## Features

- **Track Analysis** — upload an audio file; the backend detects BPM, key
  (with Camelot notation), and a real beatgrid (actual detected beat
  positions, not an assumed constant tempo).
- **Track Library** — browse, filter (BPM/key), and preview your analyzed
  tracks.
- **Green Room** — a virtual DJ mixer: 2 or 4 independent decks, per-channel
  faders + crossfader, cue/loop (in/out/4-beat/½/×2) with beatgrid-aware
  quantize, pitch control, and **beat sync** (matches a deck's tempo and beat
  phase to whichever other deck is currently playing).
- **Hardware controller support** — a Pioneer DDJ-FLX4 connected over Web
  MIDI drives Green Room's left/right decks directly (play, cue, loop,
  faders, tempo, crossfader).
- **Games** — practice-mode mini-games (e.g. blind track blending); currently
  feature-flagged off while in development.

## Repo layout

```
.
├── deckadence/          React frontend (Create React App)
│   ├── src/
│   ├── public/
│   ├── firestore.rules  Firestore security rules
│   ├── storage.rules    Storage security rules
│   └── .env.example     Required env vars (copy to .env)
├── docs/                Architecture, setup, deployment, and implementation guides
├── .github/workflows/   CI/CD (build validation, PR previews, prod deploy)
├── main.py              Flask backend API (track upload/analysis)
├── trackanalysis.py     Audio analysis (BPM, key, beatgrid)
├── requirements.txt     Backend Python dependencies
└── Dockerfile           Backend container image (deployed to Cloud Run)
```

## Getting started

### Frontend

```bash
cd deckadence
cp .env.example .env   # fill in your Firebase project values
npm install
npm start
```

See [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) for how to create a
Firebase project and populate `.env`.

### Backend

```bash
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
python main.py
```

See [docs/BACKEND.md](docs/BACKEND.md) and
[docs/TRACK_ANALYSIS.md](docs/TRACK_ANALYSIS.md) for API details.

### Green Room / hardware controller

Green Room works with just a mouse/keyboard — drag tracks onto a deck and
use the on-screen transport. To use a real Pioneer DDJ-FLX4 instead, plug it
in before opening Green Room and click **Connect MIDI** (requires a
Web MIDI-capable browser, e.g. Chrome or Edge).

## Documentation

- [docs/IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md) — living guide
  to what's built, how it fits together, and what's next; updated as the app
  is built out.
- [docs/CLOUD_ARCHITECTURE.md](docs/CLOUD_ARCHITECTURE.md) — data schema and cloud architecture
- [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) — Firebase project & env var setup
- [docs/BACKEND.md](docs/BACKEND.md) — Flask API reference
- [docs/TRACK_ANALYSIS.md](docs/TRACK_ANALYSIS.md) — audio analysis pipeline
- [docs/TRACK_LIBRARY_GUIDE.md](docs/TRACK_LIBRARY_GUIDE.md) — track library feature guide

## Deployment & CI/CD

- `.github/workflows/ci.yml` — build validation on every push/PR (no deploy, no real secrets).
- `.github/workflows/preview.yml` — deploys each PR to a temporary Firebase Hosting preview channel.
- `.github/workflows/deploy.yml` — deploys `main` to Firebase Hosting + Firestore/Storage rules and to Cloud Run.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the one-time GCP/Firebase/GitHub
setup this depends on (Workload Identity Federation, service account, secrets/variables).

## Security

See [SECURITY.md](SECURITY.md) for how secrets/config are handled and
recommended hardening steps for this project's Firebase setup.
