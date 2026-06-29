# Apex HQ + Hnry workflow

Apex HQ is the operational command centre for Apex Detailers. Hnry remains the official invoicing, payment collection, and tax handling system.

## Stage 1: manual handoff now

Use Apex HQ to prepare the invoice details after a job is complete, then copy those details into Hnry and send the official Hnry invoice.

Workflow:

1. Create Quote
2. Convert to Booking
3. Mark Complete
4. Prepare Hnry Invoice
5. Invoice Sent
6. Paid
7. Review Request Sent

## Payments & Tax setup

- Business structure: Sole trader
- Trading name: Apex Detailers
- Tax provider: Hnry
- Invoice method: Hnry invoice first
- Payment destination: Hnry Account

Payments received outside Hnry may need manual handling so records stay clean.

## Stage 2: later

Apex HQ can generate Apex-branded invoice or receipt documents, but the payment details should still point customers toward the Hnry Account unless the payment has already been handled another way.

## Stage 3: later

Explore automation only after the manual workflow is proven. Possible future options include Zapier-style automation or a proper Hnry integration if the tools and permissions are safe.

## Cost and risk guardrails

- Do not add public customer upload links yet.
- Do not add paid Cloud Functions unless there is a clear reason.
- Keep photo uploads authenticated and owner-only.
- Keep official tax/payment records in Hnry.
