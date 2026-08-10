# Apex HQ production deployment

Apex has two deployment acceptance gates:

- **Gate A — Core HQ:** private business command centre, customers, quotes, jobs, photos, Hnry/payment tracking, follow-ups, vouchers, backups and mobile/PWA use.
- **Gate B — Automated public booking:** Google Calendar availability/event sync plus booking emails.

Gate B must not prevent Gate A from being deployed or used. Keep public booking disabled until Gate B passes.

## 1. Verify the candidate

Work from a review branch and pull request. Do not test experimental cleanup directly on `main`.

```bash
npm install
npm run check
```

`npm run check` must build the frontend, validate Functions and pass the launch architecture audit. Do not continue when it fails.

The PR must also have successful **Build check**, **Verify Apex HQ** and **Preview Apex Launch** runs before it is considered ready for the owner smoke test.

## 2. Test the Firebase preview

Use the Firebase preview URL produced by **Preview Apex Launch** and complete Gate A on phone and desktop before merging.

Temporary Firebase preview hosts may need to be added to Firebase Authentication Authorized Domains for Google sign-in. That preview-host limitation does not affect the production Apex domain.

## 3. Confirm Firebase project and server configuration

The production project is `apex-detailers`.

The non-secret Functions configuration is documented in `functions/.env`. Google OAuth secrets must remain in Google Secret Manager and must never be committed.

Required secrets for the Google integration:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `TOKEN_ENCRYPTION_KEY`

Only set or rotate these when necessary.

## 4. Take a pre-deploy backup

Open `/tools`, sign in as an authorised owner and download a full backup before production changes or large imports.

## 5. Merge the reviewed candidate

Only after the preview smoke test passes, merge the reviewed pull request into `main`.

A push to `main` triggers the normal production workflows:

- **Deploy Apex Detailers** — validates Functions, builds the frontend and deploys Firebase Hosting.
- **Deploy Apex Cloud** — deploys Functions and Firestore rules when cloud/backend paths change.

Storage rules are intentionally a separate deployment because Storage IAM must never block Functions, Firestore rules or Hosting.

Manual equivalents are:

```bash
npm run deploy:cloud
npm run deploy:hosting
npm run deploy:storage   # only when storage.rules actually needs deployment
```

Do not replace this with one giant `firebase deploy` command. The separation is deliberate containment.

## 6. Gate A acceptance — core HQ

1. Open `/hq` on the candidate preview, then repeat the critical checks on production after merge.
2. Sign in as an approved Apex owner.
3. Confirm Dashboard/Command loads without the Calendar view appearing underneath it.
4. Confirm Calendar content appears only when Calendar is selected.
5. Add/edit a labelled test customer.
6. Create a quote with vehicle, package, condition and add-ons.
7. Create/associate a job and move it through the operational status pipeline.
8. Upload test job photos and verify they remain on the correct job.
9. Record Hnry handoff / Invoice Sent / Paid and confirm revenue updates.
10. Set follow-up and maintenance dates.
11. Check vouchers/referrals and `/tools` backup/export.
12. Test iPhone navigation/PWA behaviour and desktop Chrome.
13. Sign out and confirm private records are inaccessible.

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

## Rollback / containment

If Gate A fails, do not merge the candidate. Fix it on the review branch and deploy a fresh preview.

If a regression is found immediately after production merge, use the previous known-good commit/backup branch as the rollback point and redeploy Hosting. Do not hand-edit generated `dist` files.

If only Gate B fails:

1. Disable public booking.
2. Keep using the private HQ if Gate A is healthy.
3. Do not accept automated booking requests until Calendar/email health is restored.
4. Review Functions and Google integration logs/settings.
5. Fix through GitHub review and redeploy.
