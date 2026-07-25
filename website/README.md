# Apex Detailers Public Website

This folder contains the standalone customer-facing Apex Detailers website. The existing Apex HQ application in the repository root is separate and unchanged.

## Local preview

```bash
cd website
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Firebase Hosting

From this `website` folder:

```bash
npx firebase-tools login
npx firebase-tools use --add
npm run build
npx firebase-tools deploy --only hosting
```

Select the Firebase project intended for the public Apex Detailers website. Do not select the Apex HQ hosting target unless both are intentionally configured as separate Firebase Hosting sites.
