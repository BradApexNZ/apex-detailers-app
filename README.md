# Apex Detailers HQ — V5

A private mobile-first business command centre and public booking system for Apex Detailers, built with React, Vite and Firebase.

## Production routes

- `/hq` — private owner command centre
- `/book` — public booking-request flow
- `/tools` — private backups, customer exports and duplicate-safe customer JSON imports

## Launch service catalogue

- Maintenance Clean — $150, existing regular clients only
- Deep Interior Detail — from $179
- Full Detail — from $249
- Tradie Reset — from $229
- Seats Out Reset — from $399, subject to suitability

Maintenance Clean is intentionally hidden from the first-time public booking flow. Express Refresh and Headlight Restoration are not part of the V5 public launch catalogue.

## Core features

- Private owner authentication with optional local PIN/biometric quick lock
- Public booking requests with real availability
- Google Calendar conflict checks and event synchronisation
- Gmail customer and owner booking notifications
- Customer and job records in Firestore
- Mobile booking inbox and manual confirmed bookings
- Hnry workflow statuses and paid-revenue tracking
- Customer imports with duplicate checking
- Dated JSON business backups and customer exports
- Owner-only Storage image access with image and size validation

## Local setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and provide the production Firebase web configuration. Never commit the real `.env` file.

## Build check

```bash
npm run check
```

Do not deploy when this command fails.

## Production deployment

Follow `docs/DEPLOYMENT.md` exactly. The complete deployment command is:

```bash
firebase deploy --only firestore:rules,storage,functions,hosting
```

After deployment, connect the Apex Google account in `/hq` Settings and complete the end-to-end production acceptance test before sharing `/book`.

## Safety notes

- Hnry remains the official invoicing, payment-collection and tax system.
- Customer-facing prices are “from” prices and require final review based on vehicle size and condition.
- Public booking submissions remain requests until Apex approves them.
- Take a full backup from `/tools` before customer imports or major deployments.
- Firebase and Google secrets must remain in Firebase Secret Manager, never in GitHub source files.
