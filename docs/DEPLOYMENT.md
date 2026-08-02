# Apex HQ production deployment

Run these commands from the `apex-detailers-app` folder after PR #7 is merged into `main`.

## 1. Update the laptop checkout

```bash
git checkout main
git pull origin main
npm install
npm run check
```

Do not continue if `npm run check` fails.

## 2. Confirm Firebase login and project

```bash
firebase login
firebase use
```

The selected Firebase project must be the production Apex Detailers project.

## 3. Configure required Functions secrets

Only run these when the values are not already configured:

```bash
firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_ID
firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET
firebase functions:secrets:set TOKEN_ENCRYPTION_KEY
```

`TOKEN_ENCRYPTION_KEY` should be a long random value and must not be committed to GitHub.

## 4. Deploy the complete production stack

```bash
firebase deploy --only firestore:rules,storage,functions,hosting
```

This deploys owner-only database rules, image-upload rules, Google Calendar/email Functions, `/hq`, `/book`, and `/tools`.

## 5. Connect Google

1. Open `/hq` on the deployed Apex domain.
2. Sign in as an authorised Apex owner.
3. Keep **Public booking page enabled** switched off initially.
4. Open **Settings** and select **Connect Google Calendar**.
5. Complete Google consent using the Apex bookings account.
6. Return to Settings and verify the integration shows **Connected** with the correct email.

## 6. Create a backup

Open `/tools`, sign in, and select **Download full backup** before importing any customer file.

## 7. Production acceptance test

Use a real email address and a clearly labelled test customer.

1. Temporarily enable the public booking page in HQ Settings.
2. Open `/book` in a private browser window.
3. Confirm Maintenance Clean is not publicly listed.
4. Submit a Deep Interior booking request.
5. Confirm the request appears in the Apex HQ inbox.
6. Confirm the request-received customer email arrives.
7. Approve the request in Apex HQ.
8. Confirm the customer record and job are created.
9. Confirm the Google Calendar event exists at the correct Auckland date/time.
10. Confirm the booking-confirmed email arrives.
11. Use **Sync** on the Calendar screen and confirm it updates the same event rather than creating a duplicate.
12. Change the job through Completed → Prepare Hnry Invoice → Invoice Sent → Paid.
13. Download another full backup from `/tools`.
14. Delete or archive the test record only after all checks pass.
15. Leave public booking enabled only when every critical check passed.

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

## Rollback

If the production acceptance test fails:

1. Disable the public booking page from Apex HQ Settings.
2. Do not share `/book`.
3. Review Firebase Functions logs.
4. Restore customer data from the pre-deploy backup only when necessary.
5. Fix the issue in GitHub and redeploy; do not manually edit generated files inside `dist`.
