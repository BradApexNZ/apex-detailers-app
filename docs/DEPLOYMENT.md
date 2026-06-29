# Apex HQ deployment notes

## Local deploy

Use this from the project folder after pulling the latest code:

```bash
npm install
npm run build
npm run deploy
```

`npm run deploy` deploys Firebase Hosting only.

Use this only when you intentionally want to deploy Hosting, Firestore rules, and Storage rules together:

```bash
npm run deploy:all
```

## GitHub Actions

A build check workflow exists at `.github/workflows/build.yml`.

A fully automated Firebase Hosting deploy workflow still needs the Firebase project ID and Firebase service account configured safely in GitHub repository secrets first. Do not commit private Firebase credentials into the repo.

## Current status

Apex HQ V4 has the Stage 1 Hnry handoff built into the app. Deployment should be done from a trusted local machine or from GitHub Actions after secrets are configured.
