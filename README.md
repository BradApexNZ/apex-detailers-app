# Apex Detailers HQ — V4

A private mobile-first business hub for Apex Detailers. Built with React + Vite + Firebase.

## What's new in V4

**Bug fixes & cleanup**

- Corrected customer-facing quote message wording (removed old "launch pricing" text, replaced with accurate pricing disclaimer)
- Removed Headlight Restoration add-on from the UI until the service is ready
- Unified version label to "Apex HQ V4" throughout — no more V3.1/V4 mismatch
- Removed the DOM-patching hotfix layer (`apex-hotfixes.js`) — all fixes are now in the React source
- Added "Confirmed" job status to the pipeline

**New features**

- **Voucher & Referral Tracker** — new tab to create, track, and manage return vouchers and referral credits with codes, expiry dates, and referral credit status
- **Booking Confirmation Message** generator — one tap to produce a ready-to-send confirmation message
- **Day-Before Reminder Message** generator — one tap to produce a reminder message for tomorrow's bookings
- **Copy to Clipboard** button on all generated messages
- **Today's Jobs Banner** on the dashboard — highlights today's and tomorrow's booked jobs at a glance
- **Colour-coded status badges** — green for Paid/Review Sent, blue for In Progress/Confirmed, purple for Booked, amber for Hnry stages, grey for Archived
- Vouchers stat card on the dashboard

## What this app does

- Create customer quotes and bookings with full pricing calculation
- Save jobs, customers, and vouchers to Firestore
- Upload job photos to Firebase Storage
- Track quote/job statuses through the full pipeline
- Prepare Hnry invoice handoff details
- Generate customer messages (quote, confirmation, reminder, review request)
- Track return vouchers and referral credits

## Project structure

```text
apex-detailers-app/
├─ index.html
├─ firebase.json
├─ firestore.rules
├─ storage.rules
├─ package.json
├─ vite.config.js
├─ .env.example
├─ docs/
│  ├─ APEX_APP_ROADMAP.md
│  ├─ APEX_APP_REVIEW_2026-07-04.md
│  └─ DEPLOYMENT.md
└─ src/
   ├─ firebase.js
   ├─ main.jsx          (all app logic and UI)
   ├─ styles.css        (base component styles)
   ├─ gui-modern.css    (V4 visual overrides)
   └─ apex-hotfixes.js  (deprecated — kept for reference only)
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local `.env` file in the project root by copying `.env.example`:

```bash
cp .env.example .env
```

3. Replace the placeholder values in `.env` with the Firebase web app config from your Firebase project.

Required values:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

4. Start the local app:

```bash
npm run dev
```

5. Build and deploy:

```bash
npm run build
firebase deploy --only hosting
# or for hosting + rules:
npm run deploy:all
```

## Firebase notes

- Firebase Auth is restricted to Brad's UID only — no public access
- Hnry handles all official invoicing, payment collection and tax
- Do not commit your real `.env` file — it is ignored by Git
- See `docs/APEX_APP_ROADMAP.md` for planned future features (calendar sync, AI quoting, etc.)
