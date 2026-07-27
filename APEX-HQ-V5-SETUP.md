# Apex HQ V5 — booking, Google Calendar and email setup

This branch keeps the current live Apex app intact while adding:

- `/hq` — owner-only Apex HQ V5
- `/book` — public customer booking page

The public page calls Cloud Functions rather than writing directly to Firestore. Functions validate and rate-limit requests, check Apex jobs and Google Calendar availability, lock the selected time, notify Brad and the customer, and send the request into the Apex HQ inbox.

## Included

- Modern mobile-first Apex HQ interface
- Google sign-in with email/password backup
- Local PIN and Face ID/fingerprint quick lock
- Public online booking link
- Real availability using Apex jobs, booking locks and Google Calendar free/busy
- Pending booking inbox with approve/decline controls
- Manual owner bookings with a deliberate conflict override
- Automatic Google Calendar events and updates
- Booking-request, booking-confirmation and inquiry emails
- Customer and job records created from approved bookings
- Owner-only Firestore access for HQ collections
- Optional Firebase App Check wiring
- No GitHub Actions workflow or automatic deployment emails

## 1. Firebase billing

Cloud Functions requires the Firebase project to use the Blaze plan. Create a conservative Google Cloud budget alert before deployment.

## 2. Enable Google APIs

In the Google Cloud project linked to Firebase, enable:

- Google Calendar API
- Gmail API
- Secret Manager API
- Cloud Functions and Cloud Run dependencies requested during deployment

The Gmail API is used only to send Apex booking and inquiry emails from the Google account connected inside Apex HQ.

## 3. Configure OAuth consent

Create or update the OAuth consent screen for Apex HQ. During testing, add Brad's Google account as a test user.

Create an OAuth 2.0 Client ID with application type **Web application**.

Use this authorised redirect URI unless the Firebase project ID or Functions region changes:

`https://australia-southeast1-apex-detailers.cloudfunctions.net/googleCalendarCallback`

The app requests these Google scopes:

- Calendar access
- Gmail send-only access
- Basic Google account email identity

Keep the OAuth client secret out of GitHub.

## 4. Store Functions secrets

Run from the repository root:

```bash
firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_ID
firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET
firebase functions:secrets:set TOKEN_ENCRYPTION_KEY
```

Use at least 32 random bytes for `TOKEN_ENCRYPTION_KEY`. It encrypts the Google refresh token before storing it in the private `integrations/google` document.

## 5. Parameter defaults

The code defaults to:

- App URL: `https://apex-detailers.web.app`
- Owner notification email: `bookings@apexdetailers.co.nz`
- OAuth callback: `https://australia-southeast1-apex-detailers.cloudfunctions.net/googleCalendarCallback`
- Calendar: `primary`
- Time zone: `Pacific/Auckland`
- Functions region: `australia-southeast1`

If the real Hosting domain differs, set `APP_BASE_URL` when Firebase prompts during deployment.

## 6. Firebase Authentication

Enable:

- Google
- Email/password

Add the Firebase Hosting domain and any custom domain to Authentication authorised domains.

The temporary owner allow-list contains both known Apex Firebase UIDs. Once the final login is confirmed, remove the unused UID from `.env`, `functions/index.js` defaults and `firestore.v5.rules`.

## 7. App Check before public launch

Create a reCAPTCHA Enterprise score-based site key, register the web app in Firebase App Check, then set:

`VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`

The frontend already attaches App Check tokens. Public callable Functions currently use `enforceAppCheck: false` so the system can be tested. After valid traffic appears in App Check metrics, change the public booking and inquiry Functions to `enforceAppCheck: true` and redeploy.

## Local checks

```bash
npm install
npm run build
cd functions
npm install
npm run lint
cd ..
```

## Manual deployment

No GitHub Actions deployment is used.

```bash
firebase use apex-detailers
firebase deploy --only functions,firestore:rules,hosting
```

Firebase is configured to deploy `firestore.v5.rules`.

## First live test

1. Open `/hq` and sign in with Brad's authorised Google account.
2. Open **Settings & integrations**.
3. Connect Google Calendar and approve Calendar plus Gmail send access.
4. Refresh the integration status.
5. Leave customer and owner email notifications enabled.
6. Open `/book` in a private browser window.
7. Submit a test booking with a real test email address.
8. Confirm the customer receives the request-received email and Brad receives the owner alert.
9. Approve the request in Apex HQ.
10. Confirm the job, customer, lock and Google Calendar event exist.
11. Confirm the customer receives the confirmed-booking email.
12. Add a manual booking in HQ and verify its Calendar event and emails.
13. Test the PIN and biometric quick lock on iPhone Safari or the installed home-screen app.

## Security and behaviour

- Firebase Authentication and Firestore rules are the real security boundary.
- PIN/biometric unlock is a convenience lock for an already authenticated device.
- The public booking page has no direct Firestore access.
- Google refresh tokens are encrypted before storage.
- Calendar events never invite customers automatically; Apex sends branded email confirmations instead.
- Apex HQ remains the source of truth. Editing a Google Calendar event does not overwrite the Apex job.
- Public photo uploads remain excluded to reduce storage-abuse and cost risk.
