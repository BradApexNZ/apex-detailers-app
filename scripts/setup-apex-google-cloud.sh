#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="apex-detailers"
PROJECT_NUMBER="845997886809"
DEPLOYER="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
CALLBACK_URL="https://australia-southeast1-${PROJECT_ID}.cloudfunctions.net/googleCalendarCallback"

printf '\nApex Google Workspace setup\n'
printf 'Project: %s\n\n' "$PROJECT_ID"

gcloud config set project "$PROJECT_ID" >/dev/null

printf 'Enabling Google APIs...\n'
gcloud services enable \
  calendar-json.googleapis.com \
  gmail.googleapis.com \
  cloudfunctions.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  eventarc.googleapis.com \
  pubsub.googleapis.com \
  iamcredentials.googleapis.com \
  serviceusage.googleapis.com \
  --project="$PROJECT_ID"

printf 'Granting the GitHub deployer only the roles required for Apex Cloud...\n'
for role in \
  roles/cloudfunctions.admin \
  roles/run.admin \
  roles/artifactregistry.admin \
  roles/cloudbuild.builds.editor \
  roles/secretmanager.secretAccessor \
  roles/serviceusage.serviceUsageAdmin \
  roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOYER}" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

printf '\nOAuth callback URL (copy this into the Google OAuth client):\n%s\n\n' "$CALLBACK_URL"
read -r -p 'Google OAuth client ID: ' GOOGLE_CLIENT_ID
read -r -s -p 'Google OAuth client secret: ' GOOGLE_CLIENT_SECRET
printf '\n'

if [[ -z "$GOOGLE_CLIENT_ID" || -z "$GOOGLE_CLIENT_SECRET" ]]; then
  echo 'Client ID and client secret are required.' >&2
  exit 1
fi

TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 48 | tr -d '\n')"

put_secret() {
  local name="$1"
  local value="$2"
  if ! gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets create "$name" --replication-policy=automatic --project="$PROJECT_ID" >/dev/null
  fi
  printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT_ID" >/dev/null
}

printf 'Storing encrypted Apex configuration in Secret Manager...\n'
put_secret GOOGLE_OAUTH_CLIENT_ID "$GOOGLE_CLIENT_ID"
put_secret GOOGLE_OAUTH_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET"
put_secret TOKEN_ENCRYPTION_KEY "$TOKEN_ENCRYPTION_KEY"

printf 'Granting Functions runtime access to the three secrets...\n'
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for secret in GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET TOKEN_ENCRYPTION_KEY; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet >/dev/null
done

cat <<EOF

Apex Google Cloud setup is ready.

Next:
1. Open GitHub Actions in BradApexNZ/apex-detailers-app.
2. Run the workflow named "Deploy Apex Cloud".
3. Open Apex HQ > Settings > Google Calendar > Connect.
4. Approve Calendar and Gmail access with the Apex business Google account.

Callback URL:
${CALLBACK_URL}
EOF
