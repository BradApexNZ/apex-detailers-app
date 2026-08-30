# Apex HQ architecture

Apex HQ is the operational command centre for Apex Detailers and the flagship real-world systems case study for Eastward Digital.

## Migration approach

The existing React/Firebase application remains operational while screens are migrated progressively. We will not replace every workflow in a single release.

## Target structure

```text
src/
  components/
    ui/
  features/
    dashboard/
    customers/
    jobs/
    bookings/
    payments/
    media/
    vouchers/
  layouts/
  lib/
  styles/
```

## Design principles

- Use the exact supplied Apex Detailers logo assets.
- Premium dark interface using the official black, yellow and silver palette.
- Mobile-first job execution with strong desktop administration views.
- Clear status, next actions and operational exceptions.
- Restrained effects: premium and automotive, not game-like.
- Reusable components rather than screen-specific styling.

## Data and cost guardrails

- Preserve existing Firebase authentication and Firestore records.
- Subscribe only to data required by the active screen where practical.
- Avoid repeated Storage downloads.
- Keep uploads authenticated and private.
- Add client-side image compression before expanding media features.
- Use demo-safe fictional data for all public Eastward screenshots.

## Delivery order

1. Design tokens and reusable UI primitives.
2. Responsive Apex HQ application shell.
3. Dashboard V1 powered by existing job/customer data.
4. Quote and booking workflow migration.
5. Customer and vehicle profiles.
6. Job workspace and photo workflow.
7. Payments, follow-ups and reporting.
8. Demo-safe Eastward case-study presentation.
