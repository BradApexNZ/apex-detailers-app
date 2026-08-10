# Apex HQ

A private business operations system and public service/booking surface for Apex Detailers, built with React, Vite and Firebase.

## Production routes

- `/hq` — private Apex operations centre
- `/book` — public services, pricing and booking surface
- `/tools` — private backup, export and import utilities
- `/` — redirects to `/hq`

## Application structure

The production runtime is intentionally small and explicit:

- `hq.html` → `src/hq-v6.jsx` — current private HQ application
- `booking.html` → `src/booking.jsx` — public booking/service experience
- `data-tools.html` → `src/data-tools.jsx` — owner-only data utilities
- `src/apex-api.js` — browser-to-Functions/API integration layer
- `src/firebase.js` — Firebase client bootstrap, auth persistence and private-route offline cache
- `functions/` — Firebase Functions and Google Calendar/Gmail integration
- `firestore.v5.rules` — active Firestore security rules
- `storage.rules` — active Storage security rules
- `scripts/launch-audit.mjs` — architecture guardrails used by CI

Old global DOM controllers and V5 application entry points are not part of the production runtime.

## Launch model

Apex HQ has two separate readiness gates so Google Calendar can remain a feature without becoming a dependency for the core business app.

### Gate A — core HQ / showcase

The private HQ can be launched and showcased when authentication, Firestore, Storage, customers, quotes, jobs, photos, Hnry/payment tracking, follow-ups, vouchers, backups, PWA/mobile behaviour and owner data protection pass acceptance testing.

Google Calendar or Gmail being disconnected must not prevent the owner from opening HQ, viewing or editing core records, creating quotes, updating jobs, uploading photos, recording payments or using follow-up tools.

### Gate B — automated public booking

Automated public booking is an additional integration gate. Only enable/share live booking submission once Functions, Google Calendar availability, event sync and email delivery pass the dedicated integration acceptance test.

If Calendar or email health is not verified, `/book` may still be used as a service/pricing showcase, but booking submission must remain disabled or fail closed rather than accepting an unverified time.

Production declares cloud automation explicitly:

```env
VITE_APEX_CLOUD_ENABLED=true
```

That flag enables the integration code path; it does not by itself prove Calendar/Gmail readiness. The public booking toggle remains the final operational safety switch.

## Workspace design

Apex HQ uses one Firebase-backed system across devices:

- Desktop admin workspace for customers, quotes, jobs, follow-ups and payment administration.
- Mobile owner workspace for today's work, customer details, photos and field use.
- Privacy Mode protects identifying customer, vehicle, job and revenue details during recordings.
- PIN fields are visually masked and optional biometric quick unlock is supported on compatible devices.

## Installable app and offline mode

Apex HQ is configured as an installable progressive web app from `/hq`.

- iPhone/iPad: open `/hq` in Safari, tap Share, then Add to Home Screen.
- Supported Chromium browsers: use the browser install action when available.
- The app shell and branding are cached for reliable startup.
- Firestore persistence supports previously loaded private HQ data when connectivity drops.
- Cloud Functions, Google Calendar, email delivery and Storage uploads still require internet.

## Launch service catalogue

- Maintenance Clean — $150, existing regular clients only and hidden from public booking
- Deep Interior Detail — from $179
- Full Detail — from $249
- Tradie Reset — from $229
- Seats Out Reset — from $399, subject to suitability

Customer-facing prices remain “from” prices until Apex confirms vehicle size and condition.

## Launch feature set

- Private owner authentication
- Local PIN and optional biometric quick lock
- Dashboard / command centre
- Today's jobs, pending requests, revenue and follow-up visibility
- Customers and editable customer records
- Standard, friend, family and fleet/commercial customer types
- Quote creation with package, condition, add-ons, travel and manual adjustment controls
- Vehicle details and rego attached to customer/quote/job workflows
- Manual bookings and booking-request inbox
- Job status pipeline through Hnry, Invoice Sent, Paid and Review Request Sent
- Before / during / after / damage / stain / receipt job photos
- Follow-up and maintenance due dates
- Voucher and referral tracking
- Customer import and backup/export tools
- Installable mobile/PWA experience
- Google Calendar connection, calendar selection, import, conflict checking and event sync
- Email-backed booking workflow when the Google integration gate is enabled

Future/optional work such as AI photo quoting, PDF quote/invoice generation, customer portal, staff roles and advanced fleet management is not required for the core launch.

## Local verification

```bash
npm install
npm run check
```

`npm run check` builds the frontend, validates Functions and runs the launch architecture audit. Do not deploy a candidate when this command fails.

Useful commands:

```bash
npm run dev             # local Vite development server
npm run preview         # preview a production build locally
npm run deploy:cloud    # Functions + Firestore rules
npm run deploy:hosting  # production Hosting
npm run deploy:storage  # Storage rules only; intentional separate step
```

Storage deployment is deliberately separate because Storage IAM should never block Functions, Firestore rules or the frontend release.

## Firebase configuration and secrets

Firebase browser configuration is safe to ship in a web client and is not treated as a server secret. Access control is enforced by authentication and Firebase security rules.

`functions/.env` contains deployable **non-secret** runtime configuration such as timezone, owner IDs and callback URLs. OAuth client secrets and the token-encryption key live in Google Secret Manager and must never be committed to GitHub.

## Deployment

Follow `docs/DEPLOYMENT.md` and `docs/LAUNCH_CHECKLIST.md`.

Normal release flow:

1. Work on a review branch.
2. Run `npm run check` / CI.
3. Deploy a Firebase preview channel.
4. Perform the phone/desktop smoke test.
5. Merge the reviewed PR to `main`.
6. Confirm production Hosting and cloud workflows are green.

## Showcase

Use `docs/SHOWCASE_TODAY.md` for the demo path. Keep Privacy Mode enabled whenever real customer information could be visible.

## Safety notes

- Hnry remains the official invoicing, payment-collection and tax system.
- Take a full backup from `/tools` before customer imports or major data changes.
- OAuth/encryption secrets must remain outside GitHub source files.
- Owner UID access must remain aligned across frontend, Functions, Firestore and Storage rules.
- Public booking must fail closed when server-side availability cannot be verified.
- A repository safety branch named `backup/pre-cleanup-2026-08-03` preserves the earlier pre-cleanup state.
