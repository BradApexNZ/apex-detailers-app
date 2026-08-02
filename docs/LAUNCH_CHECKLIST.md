# Apex HQ Production Launch Checklist

Use this checklist before sharing the public booking link.

## 1. Service catalogue

- [ ] Maintenance Clean — $150, existing regular clients only and hidden from public booking.
- [ ] Deep Interior Detail — from $179.
- [ ] Full Detail — from $249.
- [ ] Tradie Reset — from $229.
- [ ] Seats Out Reset — from $399, subject to suitability.
- [ ] Express Refresh and Headlight Restoration are not offered in the V5 public launch.
- [ ] Customer-facing wording states that final pricing depends on vehicle size and condition.

## 2. Firebase and owner access

- [ ] Firebase Authentication contains only approved Apex owner accounts.
- [ ] The same owner UID allow-list is used by the V5 frontend, Cloud Functions, Firestore rules and Storage rules.
- [ ] Firestore rules are deployed from `firestore.v5.rules`.
- [ ] Storage permits approved owners to upload and delete job images only.
- [ ] Image uploads are restricted to images and 10 MB per file.
- [ ] App Check is enabled only after successful production testing.

## 3. Google Calendar and Gmail

- [ ] Calendar API and Gmail API are enabled in the correct Google Cloud project.
- [ ] OAuth client ID, client secret and token encryption key are configured as Firebase secrets.
- [ ] OAuth callback URL exactly matches the deployed Australia Southeast function URL.
- [ ] `APP_BASE_URL` matches the live Apex domain.
- [ ] Apex is connected to the correct Google account.
- [ ] A test booking blocks the matching Calendar period.
- [ ] Re-syncing updates the existing event rather than creating a duplicate.
- [ ] Customer request, confirmation and owner notification emails are delivered.
- [ ] Calendar errors are visible and do not result in a public confirmation.

## 4. Public booking safeguards

- [ ] Public booking is described as a request pending Apex approval.
- [ ] The customer must accept from-pricing and final-review wording.
- [ ] Large, heavily soiled and unusual vehicles require final confirmation.
- [ ] Outside-tap and customer-data wording is visible.
- [ ] Honeypot, rate limits and duplicate-slot locking are tested.
- [ ] Public booking remains disabled until the production acceptance test passes.

## 5. Customers, imports and backups

- [ ] `/tools` requires an approved owner login.
- [ ] A full backup downloads customers, jobs, vouchers, booking requests and inquiries.
- [ ] Customer-only export downloads successfully.
- [ ] A sample customer JSON file imports successfully.
- [ ] Duplicate email, phone and name matches are skipped.
- [ ] Incomplete customer records are skipped.
- [ ] Imported customers appear correctly in Apex HQ.
- [ ] A full backup is taken before every large import and deployment.

## 6. Owner workflow test

1. Add or import a customer.
2. Submit a public booking request.
3. Confirm the request email and HQ inbox entry.
4. Approve the booking.
5. Confirm customer and job creation.
6. Confirm the Calendar event and confirmation email.
7. Re-sync and confirm no duplicate Calendar event.
8. Move the job through In Progress, Completed, Hnry handoff, Invoice Sent and Paid.
9. Confirm dashboard revenue.
10. Download a post-test backup.

## 7. Device testing

- [ ] iPhone Safari owner login and quick lock.
- [ ] iPhone Safari public booking.
- [ ] Desktop Chrome owner workflow.
- [ ] `/hq`, `/book` and `/tools` display correctly.
- [ ] Slow connection and repeat-tap behaviour are acceptable.
- [ ] Signing out removes access to owner data.

## 8. Deployment

Follow `docs/DEPLOYMENT.md` exactly.

```bash
npm install
npm run check
firebase deploy --only firestore:rules,storage,functions,hosting
```

Do not share `/book` until the build, deployment and end-to-end production test pass.
