# Apex HQ V6 production deployment

This runbook applies to PR #13 / `launch-hardening-2026-08` and then to `main` after the PR is approved and merged.

Apex has two deployment acceptance gates:

- **Gate A — Core HQ:** private business command centre, customers, quotes, jobs, photos, Hnry/payment tracking, follow-ups, vouchers, backups and mobile/PWA use.
- **Gate B — Automated public booking:** Google Calendar availability/event sync plus booking emails.

Gate B must not prevent Gate A from being deployed or used. Keep public booking disabled until Gate B passes.

## 1. Verify the candidate

```bash
npm install
npm run check
```

`npm run check` must build the frontend, lint Functions and pass the launch architecture audit. Do not continue when it fails.

GitHub Actions must also show a completed successful verification run. If the workflow shows `action_required` with no jobs, approve/enable that Actions run in GitHub and re-run it before calling CI green.

## 2. Confirm Firebase project

```bash
firebase login
firebase use
```

The selected project must be the production Apex Detailers Firebase project.

## 3. Confirm server configuration

The non-secret Functions configuration is documented in `functions/.env`. Google OAuth secrets must be stored in Firebase/Google Secret Manager and never committed.

Required secrets for the Google integration:

```bash
firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_ID
firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET
firebase functions:secrets:set TOKEN_ENCRYPTION_KEY
```

Only set/rotate these when necessary.

## 4. Take a pre-deploy backup

Open `/tools`, sign in as an authorised owner and download a full backup before production changes or large imports.

## 5. Deploy the production stack

```bash
firebase deploy --only firestore:rules,storage,functions,hosting
```

This deploys owner-only Firestore rules, owner-only image Storage rules, Functions and the `/hq`, `/book` and `/tools` hosting routes.

## 6. Gate A acceptance — core HQ

Do this before any live public-booking test.

1. Open `/hq` on the production domain.
2. Sign in as an approved Apex owner.
3. Confirm owner-only access, PIN masking and quick-lock behaviour.
4. Confirm Dashboard/Command loads without depending on Google Calendar health.
5. Add/edit a labelled test customer.
6. Create a quote with vehicle, package, condition and add-ons.
7. Create/associate a job and move it through the operational status pipeline.
8. Upload test job photos and verify they remain on the correct job.
9. Record Hnry handoff / Invoice Sent / Paid and confirm revenue updates.
10. Set follow-up and maintenance dates.
11. Check vouchers/referrals and `/tools` backup/export.
12. Test iPhone navigation/PWA behaviour and desktop Chrome.
13. Sign out and confirm private records are inaccessible.
14. Download a post-test backup.

If Gate A passes, Apex HQ is acceptable for private production use and showcase even while Google integration remains disconnected.

## 7. Gate B setup — Google integration

Keep **Public booking page enabled** switched off while configuring this gate.

1. Open HQ Settings.
2. Connect Google using the Apex bookings account.
3. Verify the integration reports the correct connected account.
4. Select the calendars Apex should check for conflicts.
5. Select one writable primary calendar for Apex-created events.
6. Confirm integration errors are visible rather than being treated as free availability.

## 8. Gate B acceptance — automated public booking

Use a real email address and a clearly labelled test customer.

1. Temporarily enable the public-booking toggle.
2. Open `/book` in a private browser window.
3. Confirm Maintenance Clean is not publicly listed.
4. Submit a Deep Interior booking request.
5. Confirm the request appears in the Apex HQ inbox.
6. Confirm the request-received email arrives.
7. Approve the request in Apex HQ.
8. Confirm the customer record and job are created.
9. Confirm the Google Calendar event is created at the correct Auckland date/time on the selected primary calendar.
10. Re-sync and confirm the same event is updated rather than duplicated.
11. Confirm the booking-confirmation email arrives.
12. Test one deliberate conflict and confirm it is not offered/accepted as free availability.
13. Disable the public-booking toggle immediately if any Calendar/email step fails.

Only leave automated public booking enabled after every Gate B check passes.

## 9. Showcase deployment

For a same-day showcase, Gate A is the required minimum. Use `docs/SHOWCASE_TODAY.md` and keep Privacy Mode enabled around any real customer data.

The `/book` route can be shown as the public service/pricing experience without submitting a real booking if Gate B has not yet been signed off.

## Customer import format

`/tools` accepts an array of customer objects, `{ "customers": [] }`, or `{ "collections": { "customers": [] } }`.

Example:

```json
[
  {
    "firstName": "Jane",
    "lastName": "Example",
    "phone": "0210000000",
    "email": "jane@example.co.nz",
    "address": "1 Example Street",
    "area": "Napier",
    "preferredContact": "text",
    "customerType": "standard",
    "notes": "Imported customer"
  }
]
```

Duplicate checks use normalised email, phone and customer/business name. Always review the import result and customer list afterward.

## Rollback / containment

If Gate A fails, stop the production rollout and fix the launch candidate before relying on HQ operationally.

If only Gate B fails:

1. Disable public booking.
2. Keep using the private HQ if Gate A is healthy.
3. Do not accept automated booking requests until Calendar/email health is restored.
4. Review Functions and Google integration logs/settings.
5. Fix in GitHub and redeploy; never hand-edit generated `dist` files.
