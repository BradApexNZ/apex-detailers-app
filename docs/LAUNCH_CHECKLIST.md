# Apex HQ Production Launch Checklist

Use this checklist before sharing the public booking link.

## 1. Service catalogue

- [ ] Owner app and public booking use the same launch prices:
  - Maintenance Clean — $150, existing regular clients only
  - Deep Interior Detail — from $179
  - Full Detail — from $249
  - Tradie Reset — from $229
  - Seats Out Reset — from $399, subject to suitability
- [ ] Express Refresh is removed from new quotes.
- [ ] Headlight Restoration remains hidden until the service is ready.
- [ ] All customer-facing wording states that final pricing depends on vehicle size and condition.

## 2. Firebase and owner access

- [ ] Firebase Authentication contains only the approved Apex owner account(s).
- [ ] The same owner UID allow-list is used by the frontend, Cloud Functions, Firestore rules and Storage rules.
- [ ] Firestore rules are deployed from `firestore.v5.rules`.
- [ ] Storage permits approved owners to upload and delete job images only.
- [ ] Image uploads are restricted to image MIME types and 10 MB per file.
- [ ] App Check is enabled and enforced only after successful production testing.

## 3. Google Calendar and Gmail

- [ ] Calendar API and Gmail API are enabled in the correct Google Cloud project.
- [ ] Production OAuth client ID and secret are stored as Firebase secrets.
- [ ] `TOKEN_ENCRYPTION_KEY` is stored as a Firebase secret and backed up securely.
- [ ] OAuth callback URL exactly matches the deployed Australia Southeast function URL.
- [ ] `APP_BASE_URL` matches the live Apex domain.
- [ ] Apex is connected to the correct Google account.
- [ ] A test booking blocks the matching Calendar period.
- [ ] Editing a booking updates the same event rather than creating a duplicate.
- [ ] Cancelling a booking removes or cancels the event.
- [ ] Customer request, confirmation and owner notification emails are delivered.
- [ ] Calendar lookup failures are visible to the owner and do not silently expose occupied times.

## 4. Public booking safeguards

- [ ] Public booking is clearly described as a request pending Apex approval.
- [ ] Maintenance Clean is not offered to first-time public customers.
- [ ] Large SUVs, vans, machinery and unusual vehicles require manual confirmation.
- [ ] Customer acknowledges from-pricing, outside-tap access and removal of valuables.
- [ ] Cancellation and rescheduling expectations are visible.
- [ ] Privacy wording explains collection of contact, vehicle and booking data.
- [ ] Honeypot, rate limits and duplicate-slot locking are tested.
- [ ] Out-of-area requests cannot silently confirm.

## 5. Owner workflow test

Complete one real end-to-end test:

1. Add or import a customer.
2. Create a quote.
3. Confirm calculator output and manual override warning.
4. Convert the quote to a booking.
5. Confirm the Calendar event and customer email.
6. Upload before, damage and after photos.
7. Move the job through In Progress and Completed.
8. Generate the Hnry handoff.
9. Mark Invoice Sent and Paid.
10. Generate the review request.
11. Confirm dashboard revenue and status counts.
12. Export a backup before public launch.

## 6. Customer import

- [ ] Import file is valid JSON and retained as a backup.
- [ ] Customer names, phone numbers, emails, areas and notes are spot-checked.
- [ ] Duplicate customers are reviewed before importing.
- [ ] Imported records do not overwrite existing customers unexpectedly.
- [ ] A Firestore export or JSON backup is taken immediately after import.

## 7. Device testing

- [ ] iPhone Safari owner login and quick lock.
- [ ] iPhone Safari public booking.
- [ ] Desktop Chrome owner workflow.
- [ ] Slow or interrupted connection behaviour.
- [ ] Double-tap protection on submit and status actions.
- [ ] Photos upload, display and delete on mobile.

## 8. Deployment commands

```bash
npm install
npm run check
firebase deploy --only hosting,functions,firestore:rules,storage
```

Do not share the booking URL until the deployment succeeds and the end-to-end test above passes.
