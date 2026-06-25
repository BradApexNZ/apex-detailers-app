# Apex Detailers App V1

Mobile-first Apex Detailers app for quotes, bookings, jobs, customers, revenue tracking, and photo uploads.

## What this app does

- Create customer quotes and bookings
- Calculate Apex launch pricing with add-ons and vehicle adjustments
- Save jobs to Firestore
- Upload job photos to Firebase Storage
- Track quote/job statuses
- View simple dashboard totals

## Project structure

```text
apex-detailers-app/
├─ index.html
├─ firebase.json
├─ package.json
├─ vite.config.js
├─ .env.example
└─ src/
   ├─ firebase.js
   ├─ main.jsx
   └─ styles.css
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

5. Build the production version:

```bash
npm run build
```

6. Deploy to Firebase Hosting:

```bash
firebase deploy
```

## Firebase notes

The app reads Firebase settings from Vite environment variables in `src/firebase.js`.

Do not commit your real `.env` file. It is ignored by Git.

Before full live use, check Firestore and Storage security rules so customer details and vehicle photos are protected.
