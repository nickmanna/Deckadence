# Deckadence

Deckadence is a cloud-based, multi-user DJ track analysis platform. Users
upload audio files, a Python backend analyzes BPM/key/beatgrid, and results
are stored per-user in Firebase (Auth, Firestore, Storage).

## Repo layout

```
.
├── deckadence/          React frontend (Create React App)
│   ├── src/
│   ├── public/
│   ├── firestore.rules  Firestore security rules
│   ├── storage.rules    Storage security rules
│   └── .env.example     Required env vars (copy to .env)
├── docs/                Architecture, setup, and deployment guides
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

## Documentation

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
