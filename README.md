# Apex HQ

A private business operations system and public booking flow for Apex Detailers, built with React, Vite and Firebase.

## Production routes

- `/hq` — private Apex operations centre
- `/book` — public booking-request flow
- `/tools` — private backups, exports and customer-import tools

## Workspace design

Apex HQ uses one Firebase-backed system across devices:

- Desktop admin workspace for bookings, customer records, follow-ups, job status and payment administration.
- Mobile owner workspace for today's jobs, customer details, status updates and field use.

## Launch service catalogue

- Maintenance Clean — $150, existing regular clients only
- Deep Interior Detail — from $179
- Full Detail — from $249
- Tradie Reset — from $229
- Seats Out Reset — from $399, subject to suitability

Maintenance Clean is intentionally hidden from the first-time public booking flow. Customer-facing prices remain “from” prices until Apex confirms the vehicle size and condition.

## Core features

- Private owner authentication with optional local PIN or biometric quick lock
- Public booking requests and availability controls
- Customer and job records in Firestore
- Booking inbox and manual confirmed bookings
- Google Calendar connection points
- Hnry workflow statuses and paid-revenue tracking
- Duplicate-aware customer imports
- Dated JSON backups and customer exports
- Firebase Storage rules for private business images

## Local setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and provide the Firebase web configuration. Never commit the real `.env` file.

## Required build check

```bash
npm run build
```

Do not deploy when this command fails. GitHub Actions also runs the same build automatically on every push to `main`.

## Hosting deployment

```bash
firebase deploy --only hosting --project apex-detailers
```

Deploy Firestore rules, Storage rules or Functions separately only when those areas have intentionally changed.

## Safety notes

- Hnry remains the official invoicing, payment-collection and tax system.
- Public booking submissions remain requests until Apex approves them.
- Take a full backup from `/tools` before customer imports or major data changes.
- Firebase and Google secrets must remain outside GitHub source files.
- A repository safety branch named `backup/pre-cleanup-2026-08-03` preserves the pre-cleanup state.
