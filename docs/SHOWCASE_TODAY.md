# Apex HQ — Showcase Today

Use this path to demonstrate the strongest, most launch-ready Apex HQ story without exposing unfinished integration behaviour.

## Before the showcase

- Use PR #13 / `launch-hardening-2026-08` or its approved preview/production deployment.
- Confirm the latest build/verification has passed. If GitHub Actions shows `action_required`, approve the run before relying on it as CI evidence.
- Take a backup from `/tools`.
- Use a clearly labelled demo/test customer where possible.
- Turn **Privacy Mode on** before any screen recording or presentation that may reveal real customer, vehicle or revenue information.
- Keep automated public booking disabled unless the Google/booking Gate B acceptance test has passed.

## Recommended 8-minute demo flow

### 1. Command centre

Open `/hq` and show:

- Today's jobs
- Pending requests / quotes
- Revenue / paid visibility
- Follow-ups due
- Fast navigation on mobile and desktop

Message: **Apex HQ is the operating system for the detailing business, not just a quote calculator.**

### 2. Customer and vehicle context

Open a demo customer and show:

- Contact details
- Standard / friend / family / fleet customer type
- Vehicle year, make, model and rego in the quote/job workflow
- Notes and repeat-customer context
- Editable customer record

### 3. Quote creation

Create a demo quote and show:

- Package selection
- Vehicle type
- Light / Average / Heavy / Extreme condition
- Add-ons
- Travel/manual adjustment
- Manual total override when needed
- Friend/family/fleet handling

Save the quote.

### 4. Booking and job workflow

Show how the quote/job progresses through:

`Lead → Quote Requested → Quote Sent → Approved → Booked → Confirmed → In Progress → Completed → Prepare Hnry Invoice → Invoice Sent → Paid → Review Request Sent`

Emphasise that Hnry remains the official invoicing/payment/tax system while Apex HQ tracks the operational handoff.

### 5. Job photos

Open the Photos area and show job-linked categories:

- Before
- During
- After
- Damage / concern
- Stain
- Receipt

Explain that Storage is owner-only and uploads are restricted to supported image types and file-size limits.

### 6. Retention tools

Show:

- Follow-up due date
- Maintenance due date
- Review-request stage
- Voucher/referral tracking

### 7. Backup and resilience

Open `/tools` and show the backup/export and customer-import tools. Explain that imports are duplicate-aware and backups are taken before major changes.

### 8. Public experience

Open `/book` and show the service/pricing experience.

If Gate B is not signed off, do **not** submit a live booking. Explain that Google Calendar/email automation is an optional integration gate and public booking remains disabled until server-side availability and email delivery are verified.

If Gate B has passed, demonstrate one test request, approval, calendar event and confirmation email.

## Questions to be ready for

**Can it work without Google Calendar?**  
Yes. Core HQ customers, quotes, jobs, photos, payments, follow-ups, vouchers and backups are a separate launch gate. Calendar/Gmail enhance booking automation but do not define whether the private HQ is usable.

**Can customers double-book?**  
Automated public booking is only enabled when server-side availability checks and booking locks pass acceptance testing. Availability failures are designed to fail closed.

**Is customer data public?**  
No. HQ records and job photos are restricted to approved owner authentication. The public page does not get direct anonymous access to private HQ collections.

**Does Apex HQ replace Hnry?**  
No. Apex HQ manages operations and tracks invoice/payment status; Hnry remains the official invoicing, collection and tax workflow.

**What is still future work?**  
AI photo quoting, PDF quote/invoice generation, customer portal, staff roles and more advanced fleet management can be added later without blocking this launch.

## Showcase stop conditions

Do not continue a live operational demo if owner authentication is bypassed, private data appears while Privacy Mode should be active, photos can be accessed without approved auth, or core HQ screens fail to load.

Do not demonstrate live public booking if Calendar health, conflict detection or confirmation email delivery is not verified. In that case, keep the feature disabled and show `/book` as the service/pricing experience only.
