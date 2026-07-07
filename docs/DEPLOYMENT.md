# Deployment & CI/CD

This project deploys to two places:

| Component | Where | Workflow |
|---|---|---|
| React frontend | Firebase Hosting (project `deckadence-2646d`) | `.github/workflows/deploy.yml` |
| Firestore/Storage rules | Same Firebase project | `.github/workflows/deploy.yml` |
| Flask backend (`main.py`) | Cloud Run | `.github/workflows/deploy.yml` |
| Every PR | Firebase Hosting *preview channel* (temporary URL) | `.github/workflows/preview.yml` |
| Every push/PR | Build validation only, no deploy | `.github/workflows/ci.yml` |

Auth from GitHub Actions to Google Cloud uses **Workload Identity
Federation (WIF)** — GitHub's OIDC token is exchanged for short-lived GCP
credentials at runtime. No service account JSON key is ever generated or
stored in GitHub. This is a one-time setup (below) done from your machine
with `gcloud`.

---

## 1. Manual / local deploys (no CI)

Useful for a first deploy, or a quick manual fix.

```bash
npm install -g firebase-tools
firebase login

cd deckadence
npm run build
firebase deploy --only hosting,firestore:rules,firestore:indexes,storage --project deckadence-2646d
```

Backend, deployed straight from source (skips building/pushing an image
yourself — Cloud Run builds it from the Dockerfile):

```bash
gcloud run deploy deckadence-backend \
  --source . \
  --project deckadence-2646d \
  --region us-central1 \
  --allow-unauthenticated
```

## 2. One-time GCP setup for CI/CD

Run these once, from a machine with `gcloud` authenticated as a project
owner. Replace `nickmanna/Deckadence` if the repo ever moves.

```bash
PROJECT_ID=deckadence-2646d
REGION=us-central1
REPO=nickmanna/Deckadence
SA_NAME=github-actions-deployer
POOL_NAME=github-pool
PROVIDER_NAME=github-provider

gcloud config set project "$PROJECT_ID"

# 2a. Enable required APIs
gcloud services enable \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  firebasehosting.googleapis.com \
  firebaserules.googleapis.com \
  cloudresourcemanager.googleapis.com

# 2b. Create a dedicated deploy service account (least-privilege, not your personal account)
gcloud iam service-accounts create "$SA_NAME" \
  --display-name "GitHub Actions deployer"

SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# 2c. Grant only the roles each deploy step needs
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${SA_EMAIL}" --role "roles/firebasehosting.admin"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${SA_EMAIL}" --role "roles/firebaserules.admin"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${SA_EMAIL}" --role "roles/datastore.indexAdmin"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${SA_EMAIL}" --role "roles/run.admin"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${SA_EMAIL}" --role "roles/artifactregistry.writer"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${SA_EMAIL}" --role "roles/iam.serviceAccountUser"

# 2d. Create the Artifact Registry repo the backend image gets pushed to
gcloud artifacts repositories create deckadence \
  --repository-format docker \
  --location "$REGION"

# 2e. Create the Workload Identity Pool + Provider, restricted to this exact repo
gcloud iam workload-identity-pools create "$POOL_NAME" \
  --location global \
  --display-name "GitHub Actions pool"

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_NAME" \
  --location global \
  --workload-identity-pool "$POOL_NAME" \
  --display-name "GitHub provider" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition "assertion.repository == '${REPO}'" \
  --issuer-uri "https://token.actions.githubusercontent.com"

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

# 2f. Let only this repo's workflows impersonate the deploy service account
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role "roles/iam.workloadIdentityUser" \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${REPO}"

# 2g. Print the two values GitHub Actions needs
echo "GCP_SERVICE_ACCOUNT_EMAIL = ${SA_EMAIL}"
echo "GCP_WORKLOAD_IDENTITY_PROVIDER = projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/providers/${PROVIDER_NAME}"
```

The `attribute-condition` above is what makes this safe: only OIDC tokens
whose `repository` claim is exactly `nickmanna/Deckadence` can impersonate
the service account — a workflow in any other repo, even one you own,
cannot use these credentials.

## 3. GitHub repo configuration

### Environments

Create two environments under **Settings → Environments**:

- `production` — used by `deploy.yml`. Add required reviewers here if you
  want a manual approval gate before every deploy to main.
- `preview` — used by `preview.yml`. No approval gate needed; these are
  low-risk, expiring preview channels.

Environment-scoped secrets/variables are only usable by jobs that declare
`environment: production` / `environment: preview` — this is why the
workflows set `environment:` on each job, not just repo-wide secrets.

### Secrets (Settings → Secrets and variables → Actions → Secrets)

Add these to **both** the `production` and `preview` environments (same
values in each, since they point at the same Firebase project):

| Secret | Value |
|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | printed by step 2g above |
| `GCP_SERVICE_ACCOUNT_EMAIL` | printed by step 2g above |
| `REACT_APP_FIREBASE_API_KEY` | from Firebase console → Project settings |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | ″ |
| `REACT_APP_FIREBASE_PROJECT_ID` | ″ |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | ″ |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | ″ |
| `REACT_APP_FIREBASE_APP_ID` | ″ |
| `REACT_APP_FIREBASE_MEASUREMENT_ID` | ″ |

These are stored as GitHub *Secrets* for consistency with the rest of the
pipeline, but see [SECURITY.md](../SECURITY.md) for why the Firebase values
specifically aren't sensitive in the way `GCP_WORKLOAD_IDENTITY_PROVIDER`
effectively is.

### Variables (Settings → Secrets and variables → Actions → Variables)

Repo-level (not secret — these are just identifiers/config):

| Variable | Example value |
|---|---|
| `FIREBASE_PROJECT_ID` | `deckadence-2646d` |
| `GCP_PROJECT_ID` | `deckadence-2646d` |
| `GCP_REGION` | `us-central1` |
| `ARTIFACT_REGISTRY_REPO` | `deckadence` |
| `CLOUD_RUN_SERVICE` | `deckadence-backend` |
| `BACKEND_URL` | the Cloud Run service URL, once it exists (e.g. `https://deckadence-backend-xxxxx.us-central1.run.app`) — used as `REACT_APP_API_BASE_URL` for the production/preview frontend build |

`BACKEND_URL` has a chicken-and-egg problem on the very first deploy: Cloud
Run doesn't have a URL until the first `deploy-backend` job runs. Deploy the
backend once (manually, via step 1 above, or just let the first CI run
create it), copy the printed URL into the `BACKEND_URL` variable, then
future frontend builds will point at it.

## 4. How the workflows fit together

- **`ci.yml`** — every push and PR. Builds the frontend with dummy Firebase
  values (never touches real infrastructure) and builds the backend
  container locally without pushing it. This is what tells you a PR is
  safe to merge; it intentionally has no access to real secrets so it's
  safe to run on fork PRs too.
- **`preview.yml`** — every PR from a branch in this repo (not forks).
  Builds with the real Firebase config and deploys to a
  `pr-<number>` Hosting preview channel that expires after 7 days, then
  comments the URL on the PR.
- **`deploy.yml`** — every push to `main`. Deploys the frontend to
  production Hosting plus Firestore/Storage rules, and builds + pushes +
  deploys the backend to Cloud Run.

## 5. Rollbacks

- **Hosting**: `firebase hosting:clone` or use the Firebase Console →
  Hosting → "..." on a previous release → Rollback. Every deploy is a new
  immutable release, so this is instant.
- **Cloud Run**: `gcloud run services update-traffic deckadence-backend
  --to-revisions <previous-revision>=100 --region us-central1`. Cloud Run
  keeps prior revisions around by default.
