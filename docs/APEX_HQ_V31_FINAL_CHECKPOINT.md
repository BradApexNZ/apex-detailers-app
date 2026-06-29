# Apex HQ V3.1 final checkpoint

Status: finalized for now. Future work should continue from this version unless there is a clear reason to roll back.

## Current live app direction

- App name: Apex HQ / Apex Detailers App
- Current version label: Apex HQ V3.1
- Repository: BradApexNZ/apex-detailers-app
- Local active folder: apex-detailers-app
- Old backup folder on Brad's computer: apex-detailers-app-old
- Firebase Hosting project/site: apex-detailers
- Live URL: https://apex-detailers.web.app

## Finalized V3.1 UI direction

- Modern black/yellow Apex command-centre style.
- Cleaner cards, rounded mobile-first UI, stronger contrast, and premium dashboard feel.
- Fake wing bars removed from the logo treatment.
- Current logo treatment is a clean compact APEX badge/wordmark style.
- Keep the visual style practical and professional, not overly gamer-like.
- Future logo work can swap in the proper vector Apex logo when ready.

## Active GUI file

The active visual override file is:

- src/gui-modern.css

This file is already loaded by index.html, so future visual tweaks should usually happen there unless doing a deeper app refactor.

## Hnry workflow locked in

Apex HQ is the operating system for the detailing business. Hnry remains the official money/tax system.

Apex HQ handles:

- Quotes
- Bookings
- Customers
- Vehicles
- Job status
- Photos
- Hnry handoff preparation
- Follow-ups
- Review request tracking

Hnry handles:

- Official invoices
- Payment collection
- Tax handling

Current workflow:

1. Create Quote
2. Convert to Booking
3. Mark Complete
4. Prepare Hnry Invoice
5. Invoice Sent
6. Paid
7. Review Request Sent

Stage 1 is manual Hnry handoff. Do not add risky Hnry API automation yet.

## Current safety decisions

- No public customer upload links yet.
- No paid Cloud Functions unless there is a clear reason.
- No AI/photo quote automation yet.
- No Hnry API automation yet.
- Keep customer data and vehicle photos protected behind Brad's Firebase auth/user rules.

## Deploy command

From the active local repo folder:

```cmd
cd "%USERPROFILE%\Desktop\Apex App\apex-detailers-app"
git pull
npm run build
firebase deploy --only hosting --project apex-detailers
```

After deployment, hard refresh the site with Ctrl + F5 or test in a private browser tab.

## Later adjustment ideas

- Replace temporary APEX badge with proper vector logo.
- Improve Today view.
- Add stronger status badge colours.
- Add vehicle profile cards.
- Improve photo gallery into before/during/after sections.
- Add Hnry invoice checklist fields if manual workflow needs more structure.
