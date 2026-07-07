# Security notes

This document tracks security-relevant state of this repo and what still
needs manual follow-up. No application functionality was changed as part of
this pass — only configuration handling and repo hygiene.

## What changed in this pass

- **Firebase web config moved to environment variables.** `deckadence/src/firebase.js`
  previously hardcoded the Firebase project's `apiKey`, `authDomain`,
  `projectId`, etc. directly in source (and therefore in git history). It now
  reads `REACT_APP_FIREBASE_*` vars from `.env` (gitignored); see
  `deckadence/.env.example`.
- **Backend API URL moved to an env var.** `AudioUploader.js` hardcoded
  `http://localhost:5000`; it now reads `REACT_APP_API_BASE_URL` (defaults to
  the same value, so behavior is unchanged today).
- **`.env` is now actually gitignored.** The previous `deckadence/.gitignore`
  only excluded `.env.local`/`.env.*.local` variants — a plain `.env` file
  would have been committed if one had ever been created.
- **Added a root `.gitignore`.** There was none; `venv/`, `__pycache__/`,
  build output, `.env*`, and OS/editor files are now excluded.
- **Untracked already-committed junk** (still present on disk, just no
  longer tracked going forward): the entire Python `venv/`, `__pycache__/`
  bytecode, `deckadence/uploads/` (locally-downloaded, likely
  copyright-encumbered audio files), and `deckadence/.firebase/` CLI cache.
- **Docs reorganized** under `docs/`, including a corrected
  `docs/FIREBASE_SETUP.md` that reflects the env-var approach instead of
  telling contributors to paste config into source.

## Still needs a human decision

1. **Rotate/restrict the Firebase API key.** It was committed in plaintext
   in git history (`deckadence/src/firebase.js`). A Firebase web `apiKey` is
   not treated as a secret by Google — it can't itself grant data access —
   but since it's now been publicly visible in this repo's history, you
   should still, in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Restrict the key to your app's actual HTTP referrers (domains).
   - Confirm it can't call APIs it has no business calling.
   - Consider regenerating it if this repo is/was public.
2. **Enable Firebase App Check** for the project to reject traffic that
   isn't from your real app build.
3. **Purge git history if needed.** Removing files from the index (done
   here) stops future commits from including them, but the venv, uploads,
   and old hardcoded API key are still recoverable from git history. Rewriting
   history (`git filter-repo` / BFG) requires a force-push and coordination
   with anyone else using this repo — do this deliberately, not casually.
4. **CORS is fully open in the backend.** `main.py` calls `CORS(app)` with
   no origin restriction, so any website can call the Flask API. Not changed
   here (functionality-affecting), but should be scoped to the deployed
   frontend origin(s) before this goes to production.
5. **Review `firestore.rules` / `storage.rules`** periodically — they
   currently scope all reads/writes to `request.auth.uid` matching the
   resource owner, which is a reasonable baseline, but wasn't re-audited as
   part of this pass.

## CI/CD secrets management

GitHub Actions workflows (`.github/workflows/`) deploy to Firebase and
Cloud Run. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full setup, but
the security-relevant decisions:

- **No GCP service account key ever leaves Google.** Auth uses Workload
  Identity Federation: GitHub's own per-run OIDC token is exchanged for a
  short-lived GCP access token at workflow time. There is no long-lived
  key sitting in GitHub Secrets that could leak from a log, a compromised
  Actions runner, or a dependency supply-chain attack — the worst case is a
  token that expires within the hour and is scoped to the one repo it was
  minted for (`--attribute-condition "assertion.repository == '<owner>/<repo>'"`).
- **The deploy service account is least-privilege and dedicated.** It's not
  a personal or Owner-role account — it holds only the specific roles each
  deploy step needs (Firebase Hosting Admin, Firebase Rules Admin, Cloud
  Run Admin, Artifact Registry Writer). If it's ever misused, the blast
  radius is bounded to "can deploy this app," not "can do anything in this
  GCP project."
- **Production deploys go through a GitHub Environment** (`production`),
  which supports required reviewers if you want a manual approval gate
  before every push to `main` actually deploys. Preview deploys use a
  separate `preview` environment with no such gate, since they're
  low-risk, auto-expiring channels.
- **PRs from forks never see secrets.** `preview.yml` explicitly checks
  `github.event.pull_request.head.repo.full_name == github.repository`
  before running, and `ci.yml` (which does run on fork PRs) never
  references a real secret — it builds with placeholder values, so there's
  nothing for a malicious fork PR to exfiltrate.
- **The Firebase web config secrets are a convenience, not a real secret
  boundary.** They're stored as GitHub Secrets for consistency with the
  rest of the pipeline, but as noted above the `apiKey` etc. end up in the
  public JS bundle regardless — treat leaking them as a non-event, and rely
  on Firestore/Storage rules + API key HTTP-referrer restrictions for
  actual access control, not on keeping these values hidden.
- **Don't widen the deploy service account's roles "just in case."** If a
  future workflow step needs a new capability, grant that specific IAM role
  rather than reaching for `roles/editor` or `roles/firebase.admin`.

## Rules of thumb going forward

- Client-side config (Firebase web config, public API base URLs) → env vars,
  not hardcoded, so they can change per-environment without a code diff.
- Anything that grants privileged access (service account JSON, Admin SDK
  keys, API secrets with write scopes) → never in client code, never
  committed, server-side only.
- Don't commit `venv/`, `node_modules/`, build output, or user-uploaded
  media — check `.gitignore` before `git add`.
