# Apex HQ Production Launch Checklist

Apex HQ uses two readiness gates. **Gate A** is required for the private HQ and showcase. **Gate B** is required before enabling automated public booking. Google Calendar remains a feature, but it must not be able to block core HQ use.

## Gate A — Core HQ / showcase

### 1. Service catalogue and quoting

- [ ] Maintenance Clean — $150, existing regular clients only and hidden from public booking.
- [ ] Deep Interior Detail — from $179.
- [ ] Full Detail — from $249.
- [ ] Tradie Reset — from $229.
- [ ] Seats Out Reset — from $399, subject to suitability.
- [ ] Customer-facing wording states final pricing depends on vehicle size and condition.
- [ ] Quote flow supports condition, add-ons, travel/manual adjustments and manual total override.

### 2. Firebase and owner access

- [ ] Firebase Authentication contains only approved Apex owner accounts.
- [ ] The same owner UID allow-list is used by V6 frontend, Cloud Functions, Firestore rules and Storage rules.
- [ ] Firestore rules are deployed from `firestore.v5.rules`.
- [ ] Firestore public direct booking writes remain closed.
- [ ] Storage permits approved owners to upload/read/delete job images only.
- [ ] Image uploads are restricted to supported image types and 10 MB per file.
- [ ] Signing out removes access to owner data.

### 3. Core owner workflow

1. Sign in to `/hq` as an approved owner.
2. Add or edit a customer.
3. Create a quote with vehicle, package, condition and at least one add-on.
4. Save/approve the quote and create or associate a booking/job.
5. Move the job through Booked → In Progress → Completed → Prepare Hnry Invoice → Invoice Sent → Paid → Review Request Sent.
6. Confirm paid revenue updates correctly.
7. Add follow-up and maintenance dates.
8. Upload before/during/after test photos and confirm they stay attached to the correct job.
9. Create/update a voucher or referral record.
10. Download a full backup from `/tools`.

### 4. Customers, imports and backups

- [ ] `/tools` requires an approved owner login.
- [ ] Full backup includes customers, jobs, vouchers, booking requests and inquiries.
- [ ] Customer-only export downloads successfully.
- [ ] Sample customer JSON/CSV import succeeds.
- [ ] Duplicate email/phone/name matches are skipped.
- [ ] Incomplete customer records are skipped.
- [ ] Imported customers appear correctly in Apex HQ.
- [ ] A full backup is taken before large imports or production deployment.

### 5. Device / showcase testing

- [ ] iPhone Safari owner login and quick lock.
- [ ] PIN is visually masked.
- [ ] Biometric quick unlock works on a supported trusted device if enabled.
- [ ] Mobile navigation reaches Dashboard, Inbox, Calendar, Jobs, Customers, Quotes, Photos, Vouchers and Settings.
- [ ] Desktop Chrome owner workflow works.
- [ ] `/hq`, `/book` and `/tools` display correctly.
- [ ] Privacy Mode protects real customer/revenue information during recording.
- [ ] Slow connection/repeat-tap behaviour is acceptable.
- [ ] Core HQ remains usable when Google Calendar is disconnected or unhealthy.

**Gate A pass means Apex HQ is ready to showcase and use as the private business command centre.**

## Gate B — Automated public booking / Google integration

Do not enable live public booking submission until every item below passes.

### 6. Google Calendar and Gmail

- [ ] Calendar API and Gmail API are enabled in the correct Google Cloud project.
- [ ] OAuth client ID, client secret and token encryption key are configured as Firebase secrets.
- [ ] OAuth callback URL exactly matches the deployed Australia Southeast function URL.
- [ ] `APP_BASE_URL` matches the live Apex domain.
- [ ] Apex connects to the correct Google account.
- [ ] Selected calendars are used for conflict visibility.
- [ ] One writable primary calendar is selected for Apex-created events.
- [ ] Calendar errors are visible and never look like an empty/free calendar.
- [ ] Re-sync updates the existing Apex event instead of creating a duplicate.
- [ ] Revoked/expired connection has a clear reconnect path.

### 7. Public booking safeguards

- [ ] Public booking is described as a request pending Apex approval.
- [ ] Customer must accept from-pricing and final-review wording.
- [ ] Maintenance Clean is not publicly bookable.
- [ ] Large, heavily soiled and unusual vehicles require final confirmation.
- [ ] Booking duration is controlled by the server, not browser-supplied end time.
- [ ] Honeypot, rate limits and duplicate-slot locking are tested.
- [ ] Direct anonymous Firestore booking fallback is disabled.
- [ ] Availability failure fails closed.
- [ ] Customer request, confirmation and owner notification emails are delivered.

### 8. End-to-end booking test

1. Keep the public-booking toggle off initially.
2. Connect Google and verify integration health in HQ.
3. Enable public booking temporarily.
4. Submit a clearly labelled test Deep Interior request from `/book` in a private browser.
5. Confirm the HQ inbox entry and request-received email.
6. Approve the request.
7. Confirm customer/job creation.
8. Confirm the event lands in the selected primary calendar at the correct Auckland time.
9. Re-sync and confirm there is no duplicate event.
10. Confirm the booking-confirmation email.
11. Disable public booking again if any integration check fails.

**Gate B pass means automated public booking can be enabled publicly.**

## Deployment gate

Follow `docs/DEPLOYMENT.md` exactly.

```bash
npm install
npm run check
firebase deploy --only firestore:rules,storage,functions,hosting
```

Do not merge/deploy a candidate with failing build, Functions lint or launch architecture audit. If GitHub Actions reports `action_required` without running jobs, approve/enable the repository workflow run and re-run it before treating CI as green.
