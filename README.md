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

## Installable app and offline mode

Apex HQ is configured as an installable progressive web app from `/hq`.

- iPhone/iPad: open `/hq` in Safari, tap Share, then Add to Home Screen.
- Supported Chromium browsers: use the Apex HQ Install app button or the browser install action.
- The app shell, branding and built JavaScript/CSS are cached for offline startup.
- Firestore persistence is enabled only for private HQ and data-tools pages.
- Previously loaded customers, jobs, bookings and settings remain readable offline.
- Firestore writes made offline are queued by the Firebase SDK and synchronise after connectivity returns.
- The HQ status chip shows Offline, Syncing, Synced or Online.

Cloud Functions, Google Calendar, email delivery, fresh server-only data and Storage uploads still require internet access. Offline data remains on the trusted device, so the local Apex PIN or biometric lock must remain enabled.

## Launch service catalogue

- Maintenance Clean — $150, existing regular clients only
- Deep Interior Detail — from $179
- Full Detail — from $249
- Tradie Reset — from $229
- Seats Out Reset — from $399, subject to suitability

Maintenance Clean is intentionally hidden from the first-time public booking flow. Customer-facing prices remain “from” prices until Apex confirms the vehicle size and condition.

## Core features

- Private owner authentication with mandatory local PIN and optional biometric quick lock
- Installable Apex HQ app shell with offline Firestore persistence
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

Do not deploy when this command fails. GitHub Actions runs the same build on every pull request and every push to `main` using Node 22.

## Hosting deployment

```bash
firebase deploy --only hosting --project apex-detailers
```

Deploy Firestore rules, Storage rules or Functions separately only when those areas have intentionally changed.

## Offline acceptance test

1. Open `/hq` online and wait for the status chip to show Synced or Online.
2. Add Apex HQ to the phone home screen.
3. Open the installed app once while online.
4. Enable airplane mode and reopen Apex HQ.
5. Confirm previously loaded customers and jobs are available.
6. Make one safe test edit, then reconnect.
7. Confirm the status changes through Syncing to Synced and verify the edit from another device.

## Safety notes

- Hnry remains the official invoicing, payment-collection and tax system.
- Public booking submissions remain requests until Apex approves them.
- Take a full backup from `/tools` before customer imports or major data changes.
- Firebase and Google secrets must remain outside GitHub source files.
- A repository safety branch named `backup/pre-cleanup-2026-08-03` preserves the pre-cleanup state.
