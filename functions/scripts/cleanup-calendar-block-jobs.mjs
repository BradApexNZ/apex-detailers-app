// One-time, manually-run cleanup for Google Calendar events that were
// imported into the `jobs` collection before the Jobs UI learned to filter
// them out by `mode === "calendar-block"` (see hq-v6.jsx's `businessJobs`).
//
// These records are Apex HQ's own doing: importGoogleCalendarEvents()
// (functions/index.js) writes them with a deterministic id of the form
// `google_<sha256(calendarId:eventId)>` and always sets mode:
// "calendar-block", source: "google-calendar", and vehicle: "External
// calendar event". Nothing else in the codebase writes those three fields
// together, so matching on all three is a safe, unambiguous fingerprint -
// no genuine Apex customer job can accidentally match it.
//
// This script is READ-ONLY by default. It only deletes when you pass
// --confirm, and even then only documents matching every one of the three
// fields above (not just the id prefix, in case a customer's `mode` field
// is ever repurposed for something else in the future).
//
// Usage (from the functions/ directory, with credentials for the
// apex-detailers project - e.g. `gcloud auth application-default login`
// or GOOGLE_APPLICATION_CREDENTIALS pointing at a service account key):
//   node scripts/cleanup-calendar-block-jobs.mjs            # dry run, lists candidates
//   node scripts/cleanup-calendar-block-jobs.mjs --confirm  # actually deletes them
//
// Deletion is a straight Firestore doc delete - it does not touch
// bookingLocks, bookingRequests, customers, or any genuine job. It only
// ever removes the scheduling clutter these Calendar imports left behind
// in the jobs collection; the jobs UI already filters them out on its own,
// so running this script is optional cleanup, not a required fix.

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "apex-detailers";
const confirm = process.argv.includes("--confirm");

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

function isCalendarBlock(data, id) {
  return (
    data.mode === "calendar-block" &&
    data.source === "google-calendar" &&
    data.vehicle === "External calendar event" &&
    id.startsWith("google_")
  );
}

async function main() {
  const snapshot = await db.collection("jobs").get();
  const candidates = [];
  const otherGoogleSourced = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    if (isCalendarBlock(data, doc.id)) {
      candidates.push({ id: doc.id, summary: data.customerName, date: data.bookingDate, status: data.status });
    } else if (data.source === "google-calendar" || String(doc.id).startsWith("google_")) {
      // Matches part of the fingerprint but not all of it - surfaced so a
      // human can look before this script's matching rule is trusted
      // blindly, never auto-deleted.
      otherGoogleSourced.push({ id: doc.id, mode: data.mode, source: data.source, vehicle: data.vehicle });
    }
  });

  console.log(`Scanned ${snapshot.size} documents in jobs/.`);
  console.log(`Confirmed calendar-block imports (safe to remove): ${candidates.length}`);
  for (const c of candidates.slice(0, 20)) {
    console.log(`  - ${c.id}  "${c.summary}"  ${c.date || "(no date)"}  status=${c.status}`);
  }
  if (candidates.length > 20) console.log(`  ...and ${candidates.length - 20} more`);

  if (otherGoogleSourced.length) {
    console.log(`\nPartial matches NOT touched - review manually (${otherGoogleSourced.length}):`);
    for (const o of otherGoogleSourced.slice(0, 20)) {
      console.log(`  - ${o.id}  mode=${o.mode}  source=${o.source}  vehicle=${o.vehicle}`);
    }
  }

  if (!candidates.length) {
    console.log("\nNothing to clean up.");
    return;
  }

  if (!confirm) {
    console.log(`\nDry run only - no documents deleted. Re-run with --confirm to delete the ${candidates.length} listed above.`);
    return;
  }

  console.log(`\n--confirm passed - deleting ${candidates.length} documents...`);
  const batchSize = 400; // Firestore batch limit is 500 writes.
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = db.batch();
    for (const c of candidates.slice(i, i + batchSize)) batch.delete(db.doc(`jobs/${c.id}`));
    await batch.commit();
  }
  console.log("Done.");
}

main().catch(error => {
  console.error("Cleanup script failed:", error);
  process.exit(1);
});
