# Apex Book (standalone)

The public booking page for Apex Detailers, pulled out of `apex-detailers-app` so it can ship on its own.

It has no backend of its own. It calls the same Firebase Cloud Functions in the `apex-detailers` project
(`getPublicBookingConfig`, `listBookingAvailability`, `listMonthAvailability`, `submitBookingRequest`),
so bookings, Google Calendar availability, emails and the HQ inbox all keep working exactly as they do now.
Prices are decided server-side; `src/booking-data.js` and `src/public-booking-fallback.js` are display fallbacks only.

## Run / deploy
```
npm install
npm run dev        # local
npm run build      # outputs dist/
firebase deploy --only hosting   # needs a Firebase Hosting site (e.g. book.apexdetailers.co.nz)
```

## Re-merging into HQ
This folder lives inside `apex-detailers-app` but is its own Vite project (its own `package.json` and `firebase.json`), separate from HQ's build and deploy workflows.
File names and imports match HQ's `src/`, so re-merging is a copy:
1. Copy `apex-book/src/*` over the same names in `src/`.
2. `apex-book/index.html` is `booking.html` at the repo root (served at `/book`).
3. Delete `apex-book/`. HQ's build already lists `booking.html` and `firebase.json` already rewrites `/book`.

## Files
- `src/booking.jsx` page and calendar UI
- `src/apex-api-public.js` callable wrappers (fails closed if the server can't verify a time)
- `src/firebase-public.js` Functions-only Firebase init (no Auth/Firestore, keeps Safari happy)
- `src/firebase-config.js` public web config
- `src/booking-data.js`, `src/public-booking-fallback.js` static catalogue fallback
- `src/apex-theme.css`, `src/booking-app.css` styling
