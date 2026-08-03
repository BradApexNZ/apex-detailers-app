# Apex HQ

A private business operations system and public service showcase for Apex Detailers, built with React, Vite and Firebase.

## Production routes

- `/hq` — private Apex operations centre
- `/book` — public Apex services and pricing showcase
- `/tools` — private backups, exports and customer-import tools

## Current zero-cost mode

The default build keeps paid cloud automation off:

```env
VITE_APEX_CLOUD_ENABLED=false
```

While that flag is false:

- Google Calendar calls are not made.
- Cloud Function booking, approval and email actions are blocked.
- The public page showcases real services and routes enquiries to the Apex email address.
- Cloud-dependent HQ controls are visibly paused.
- Core Firebase Authentication, Firestore customer/job records, imports, backups and offline cache remain available.

Do not change the flag to `true` until billing, Functions, Google Calendar, email delivery and end-to-end testing are intentionally ready.

## Workspace design

Apex HQ uses one Firebase-backed system across devices:

- Desktop admin workspace for customers, jobs, follow-ups and payment administration.
- Mobile owner workspace for today's work, customer details and field use.
- Privacy Mode blurs identifying customer, vehicle, job and revenue details during recordings.
- PIN fields are always visually masked.

## Installable app and offline mode

Apex HQ is configured as an installable progressive web app from `/hq`.

- iPhone/iPad: open `/hq` in Safari, tap Share, then Add to Home Screen.
- Supported Chromium browsers: use the Apex HQ Install app button or browser install action.
- The app shell, branding and built JavaScript/CSS are cached for offline startup.
- Firestore persistence is enabled only for private HQ and data-tools pages.
- Previously loaded customers, jobs and settings remain readable offline.
- Eligible Firestore writes made offline queue in the Firebase SDK and synchronise after connectivity returns.
- The HQ status chip shows Offline, Syncing, Synced or Online.

Cloud Functions, Google Calendar, email delivery, server-only booking actions and Storage uploads still require internet and remain off in zero-cost mode.

## Launch service catalogue

- Maintenance Clean — $150, existing regular clients only
- Deep Interior Detail — from $179
- Full Detail — from $249
- Tradie Reset — from $229
- Seats Out Reset — from $399, subject to suitability

Customer-facing prices remain “from” prices until Apex confirms vehicle size and condition.

## Core features

- Private owner authentication with mandatory local PIN and optional biometric quick lock
- Installable Apex HQ app shell with offline Firestore persistence
- Customer and job records in Firestore
- Job status and Hnry handoff tracking
- Duplicate-aware customer imports
- Dated JSON backups and customer exports
- Recording Privacy Mode
- Public service/pricing showcase
- Staged connection points for later Calendar and booking automation

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

## Showcase checklist

1. Open `/hq` online and wait for Synced or Online.
2. Confirm the four-digit PIN is visually masked.
3. Leave Privacy Mode on while recording customer, inbox, jobs and schedule screens.
4. Confirm cloud-dependent controls show as paused.
5. Open `/book` and demonstrate the service/pricing showcase and direct enquiry button.
6. Turn Privacy Mode off after recording when private details are safe to view.

## Offline acceptance test

1. Open `/hq` online and wait for Synced or Online.
2. Add Apex HQ to the phone home screen.
3. Open the installed app once while online.
4. Enable airplane mode and reopen Apex HQ.
5. Confirm previously loaded customers and jobs are available.
6. Make one safe test edit, then reconnect.
7. Confirm the status changes through Syncing to Synced and verify the edit from another device.

## Safety notes

- Hnry remains the official invoicing, payment-collection and tax system.
- Take a full backup from `/tools` before customer imports or major data changes.
- Firebase and Google secrets must remain outside GitHub source files.
- Customer information stored for offline use remains on the trusted device, protected by PIN/biometric lock.
- A repository safety branch named `backup/pre-cleanup-2026-08-03` preserves the pre-cleanup state.
