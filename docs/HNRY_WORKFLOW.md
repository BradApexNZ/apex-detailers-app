# Apex HQ + Hnry workflow

Apex HQ is the operational command centre for Apex Detailers. Hnry remains the official invoicing, payment collection, and tax handling system.

## Customer CSV import

The Apex importer accepts CSV files with common customer headings and maps them into the existing customer model.

Recognised details include first name, last name, business/company name, email, phone/mobile, address, area/suburb/city and notes.

Before anything is saved, Apex HQ previews the rows and skips likely duplicates using email first, phone second and customer name third.

### Firestore wiring

Render `CustomerCsvImport` inside the Customers screen and provide the existing customers plus a save function:

```jsx
<CustomerCsvImport
  existingCustomers={customers}
  onImport={async rows => {
    for (const customer of rows) {
      await addDoc(collection(db, "customers"), {
        ...customer,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  }}
  onClose={() => setImportOpen(false)}
/>
```

For a very large file, use chunked Firestore writes rather than sending everything simultaneously.

## Stage 1: safe invoice handoff

1. Create Quote
2. Convert to Booking
3. Mark Complete
4. Press **Create Hnry Invoice** in Apex HQ
5. Apex HQ copies a prepared invoice brief, changes the status to `Prepare Hnry Invoice`, and opens Hnry
6. Select or create the client in Hnry, paste/check the job details and send the official invoice
7. Mark the Apex job `Invoice Sent`
8. When Hnry confirms payment, mark it `Paid`
9. Send the review request

Use `handoffJobToHnry` from `src/features/hnry/hnryActions.js`.

A specific Hnry destination can be configured in the Vite environment:

```env
VITE_HNRY_INVOICES_URL=https://app.hnry.io/
```

Never store Hnry usernames, passwords or financial credentials in Vite variables because browser environment variables are visible in the built app.

## Payments & Tax setup

- Business structure: Sole trader
- Trading name: Apex Detailers
- Tax provider: Hnry
- Invoice method: Hnry invoice first
- Payment destination: Hnry Account

Payments received outside Hnry may need manual handling so records stay clean.

## Stage 2: later

Apex HQ can generate Apex-branded invoice or receipt documents, but payment details should still point customers toward the Hnry Account unless payment has already been handled another way.

## Stage 3: later

Explore automation only after the manual workflow is proven. Possible future options include an official Hnry-supported integration or Zapier. Any automation must run server-side, verify duplicate requests and require explicit approval before an invoice is sent.

## Cost and risk guardrails

- Do not scrape Hnry or store Hnry login credentials.
- Do not add public customer upload links yet.
- Do not add paid Cloud Functions until there is a clear automation requirement.
- Keep photo uploads authenticated and owner-only.
- Keep official tax and payment records in Hnry.
