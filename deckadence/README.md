# Deckadence Frontend

React (Create React App) frontend for Deckadence. Handles auth, track
upload/library UI, and talks to Firebase (Auth/Firestore/Storage) and the
Flask backend in [`../main.py`](../main.py).

## Setup

```bash
cp .env.example .env   # fill in your Firebase project values
npm install
npm start
```

The app reads Firebase config and the backend API URL from environment
variables — see [`.env.example`](.env.example) and
[`../docs/FIREBASE_SETUP.md`](../docs/FIREBASE_SETUP.md). Never commit `.env`
or hardcode credentials in `src/firebase.js`.

## Available Scripts

- `npm start` — run the dev server at [http://localhost:3000](http://localhost:3000)
- `npm test` — run the test runner in watch mode
- `npm run build` — production build to `build/`
- `npm run eject` — eject CRA config (one-way, avoid unless necessary)

## Project structure

```
src/
├── components/   UI components (Dashboard, TrackLibrary, AudioUploader, ...)
├── contexts/     React context providers (AuthContext)
├── services/     API/Firestore access (trackService)
└── firebase.js   Firebase SDK initialization (config via env vars)
```

## Security notes

- `firestore.rules` and `storage.rules` (project root) scope all reads/writes
  to the authenticated owner — review these before changing data access
  patterns.
- The Firebase web `apiKey` is not a secret by design, but keep it in `.env`
  rather than source so it isn't tied to git history and can be rotated
  without a code change. See [`../SECURITY.md`](../SECURITY.md).
