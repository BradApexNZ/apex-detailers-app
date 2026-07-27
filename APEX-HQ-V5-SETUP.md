# Apex HQ V5 — booking and Google Calendar setup

This branch keeps the existing live Apex app intact while adding two new Vite entry points:

- `/hq` — owner-only Apex HQ V5
- `/book` — public customer booking page

The public page does not write to Firestore directly. It calls Cloud Functions that validate requests, apply rate limits, hold booking slots, check Google Calendar free/busy data, and create booking requests for approval inside Apex HQ.

## What is included

- Modern mobile-first Apex HQ interface
- Google sign-in with email/password backup
- Owner UID allow-list
- Public booking link and service selection
- Availability based on Apex jobs, pending slot holds, and Google Calendar free/busy
- Booking approval/decline inbox
- Manual owner bookings with availability checks and deliberate override
- Automatic job-to-Google-Calendar sync
- Tentative Calendar holds for pending online requests
- Local device PIN and Face ID/fingerprint quick lock
- Firestore rules for customers, jobs, vouchers, booking requests and private integration records
- Optional Firebase App Check wiring for reCAPTCHA Enterprise

## Google Cloud and Firebase setup

### 1. Firebase billing

Cloud Functions deployment requires the Firebase project to use the Blaze plan. Set a conservative Google Cloud budget alert before deployment.

### 2. Enable APIs

In the Google Cloud project linked to Firebase, enable:

- Google Calendar API
- Secret Manager API
- Cloud Functions / Cloud Run dependencies requested by Firebase during deployment

### 3. Configure OAuth consent

Create or update the OAuth consent screen for Apex HQ. During testing, add Brad's Google account as a test user.

Create an OAuth 2.0 Client ID with application type **Web application**.

Use this authorised redirect URI exactly unless the Firebase project ID or Functions region changes:

`https://australia-southeast1-apex-detailers.cloudfunctions.net/googleCalendarCallback`

Keep the OAuth client secret out of GitHub.

### 4. Store Functions secrets

Run these commands from the repository root and paste each value when prompted:

```bash
firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_ID
firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET
firebase functions:secrets:set TOKEN_ENCRYPTION_KEY
```

Use a long random value for `TOKEN_ENCRYPTION_KEY` (at least 32 random bytes). It encrypts the Google refresh token before it is stored in the private Firestore integration document.

### 5. Check parameter defaults

The code defaults to:

- App URL: `https://apex-detailers.web.app`
- OAuth callback: `https://australia-southeast1-apex-detailers.cloudfunctions.net/googleCalendarCallback`
- Calendar: `primary`
- Time zone: `Pacific/Auckland`
- Functions region: `australia-southeast1`

If the actual Hosting domain differs, set `APP_BASE_URL` when Firebase prompts during deployment or through the supported Firebase parameter workflow.

### 6. Firebase Authentication

Enable both:

- Google
- Email/password

Add the Firebase Hosting domain and any custom domain to Firebase Authentication authorised domains.

The current allowed owner UIDs are listed in `.env.example`, Functions parameters, and `firestore.rules`. Remove the legacy UID after confirming which Firebase account owns the final Google/email login.

### 7. App Check before public launch

Create a reCAPTCHA Enterprise score-based site key, register the web app in Firebase App Check, and put the key in:

`VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`

The frontend is already wired to attach App Check tokens. The callable Functions currently use `enforceAppCheck: false` so setup can be tested first. After valid traffic appears in App Check metrics, change the public callable Functions to `enforceAppCheck: true` and redeploy.

## Local checks

```bash
npm install
npm run build
cd functions
npm install
npm run lint
cd ..
```

## Manual deployment workflow

No GitHub Actions deployment is used.

```bash
firebase use apex-detailers
firebase deploy --only functions,firestore:rules,hosting
```

After deployment:

1. Open `/hq` and sign in with Brad's authorised Google account.
2. Open **Settings & integrations**.
3. Connect Google Calendar and approve the requested Calendar permissions.
4. Refresh Calendar status.
5. Open `/book` in a private browser window.
6. Submit a test booking.
7. Approve it in the Apex HQ booking inbox.
8. Confirm the customer, job, booking lock and Google Calendar event were created.
9. Test on iPhone Safari and as an added-to-home-screen PWA.

## Security notes

- Firebase Authentication and Firestore rules are the real access boundary.
- PIN/biometric unlock is a convenience lock for an already authenticated device, not a replacement for Firebase Authentication.
- The public booking page has no direct Firestore access.
- Public photo uploads are intentionally excluded from launch to avoid storage abuse and surprise Firebase costs.
- Apex HQ is the source of truth. Google Calendar receives Apex booking data, but editing a Calendar event does not overwrite the Apex job record.
