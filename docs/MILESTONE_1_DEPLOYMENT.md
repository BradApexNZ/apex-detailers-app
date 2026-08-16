# Apex HQ Milestone 1 deployment checklist

Do not deploy this branch until the integration items below are complete and the production build passes.

## Included in Milestone 1

- Premium Apex HQ shell and responsive navigation
- Dashboard V1 components
- Customer CSV parsing, preview and duplicate detection
- Safe batched Firestore customer import
- Hnry invoice brief and handoff action
- Hnry workflow documentation

## Remaining integration work before deployment

- Mount `ApexHQShell` in the authenticated application
- Mount `ApexDashboard` using the existing live `jobs` and `customers` arrays
- Add an **Import CSV** action to the Customers screen
- Pass `importCustomersToFirestore({ db, customers: rows, ownerUid: authUser.uid })` to `CustomerCsvImport`
- Add `HnryInvoiceButton` to completed job actions
- Update the selected job with `status: "Prepare Hnry Invoice"` and `updatedAt: serverTimestamp()` after a successful handoff
- Import the new CSS files from the app entry point
- Confirm existing quotes, bookings, jobs, photos, vouchers and Firebase authentication still work

## Brad's deployment steps once the branch is marked ready

1. On the computer containing the Apex project, open Terminal in the project folder.
2. Run `git checkout feature/apex-hq-foundation`.
3. Run `git pull origin feature/apex-hq-foundation`.
4. Run `npm install`.
5. Run `npm run build`.
6. Run `npm run dev` and test the private local preview.
7. Test one temporary CSV with two fake customers before using real Hnry data.
8. Confirm duplicates are skipped and the records appear correctly in Customers.
9. Test **Create Hnry Invoice** on a fake completed job. Confirm the brief is copied and Hnry opens.
10. Only after those checks, deploy using the repository's Firebase deployment command.
11. Open the live Apex URL on iPhone and repeat the fake-customer and fake-job checks.

## Safety rules

- Back up/export current customer and job data before the first production deployment.
- Use fake test records first.
- Never commit customer CSV files to GitHub.
- Delete local CSV copies when they are no longer required.
- Keep Hnry as the official invoice, payment and tax record.
