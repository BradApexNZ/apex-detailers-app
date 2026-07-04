# Apex App Review — 2026-07-04

This file records the first proper Apex HQ review pass.

## Current state

Apex HQ is a solid private MVP. It already has Firebase Auth, Firestore customers/jobs, Storage photo uploads, quote calculation, Hnry handoff support, mobile-first layout, and Brad-only access rules.

## Must-fix before real customer use

1. Remove old launch-pricing wording from generated customer quote messages.
2. Disable or rename Headlight Restoration until the service process and gear are ready.
3. Add image-size controls before uploading phone photos to Firebase Storage.
4. Tighten Storage rules to image files and sensible file-size limits.
5. Tighten Firestore rules to known collections instead of all paths.
6. Pin package versions and commit a package-lock file after a clean local install.
7. Make the visible UI version consistent. Some CSS currently forces Apex HQ V3.1 wording while the React app says V4.

## Recommended next build order

1. Safety copy branch.
2. Fix customer-facing quote wording.
3. Hide or change Headlight Restoration add-on.
4. Update UI version labels to one version name.
5. Add upload warnings and later compression.
6. Tighten Firebase rules.
7. Run npm install, npm run build, then deploy only after checking the app on iPhone.

## Important note

Do not add calendar sync, AI quoting, public uploads, or customer portals until the private MVP is stable. Those features increase Firebase cost, privacy risk, and setup complexity.