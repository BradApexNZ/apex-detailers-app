import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const checks = [];
const assert = (name, condition, detail) => checks.push({ name, ok: Boolean(condition), detail });

const hq = read("hq.html");
const api = read("src/apex-api.js");
const firebase = read("firebase.json");
const rules = read("firestore.v5.rules");
const storage = read("storage.rules");
const functionsEntry = read("functions/entry.js");
const publicConfig = read("functions/public-config-v6.js");
const cloudWorkflow = read(".github/workflows/deploy-cloud.yml");
const packageJson = JSON.parse(read("package.json"));

assert("HQ uses consolidated V6 UI", hq.includes('/src/hq-v6.jsx'), "hq.html must load hq-v6.jsx");
assert("Old Google DOM controller is not loaded", !hq.includes("hq-google-calendar.js"), "Calendar must live inside React V6");
assert("Old runtime patch stack is not loaded", !hq.includes("hq-production.js") && !hq.includes("hq-final-polish.js") && !hq.includes("hq-booking-controls.js"), "Do not reintroduce competing runtime controllers");
assert("Public booking uses V6 availability", api.includes('listBookingAvailabilityV6'), "Google-backed conflict validation must be authoritative");
assert("Public booking fails closed", !api.includes("fallbackAvailability") && !api.includes("fallbackSubmit"), "Do not accept bookings via direct Firestore fallback");
assert("Calendar selection uses V6 validation", api.includes('listGoogleCalendarsV6') && api.includes('saveGoogleCalendarSelectionV6'), "Primary calendar must be writable");
assert("V6 Functions are exported", functionsEntry.includes('launch-v6.js') && functionsEntry.includes('calendar-settings-v6.js') && functionsEntry.includes('public-config-v6.js'), "Functions entry must expose launch endpoints");
assert("Anonymous Firestore booking writes are closed", !rules.includes("request.auth == null") && !rules.includes("allow read: if true"), "Public writes must go through Cloud Functions");
assert("Storage is owner-only", !storage.includes("request.auth == null"), "Customer photos must remain private");
assert("Maintenance Clean is not public", !publicConfig.includes('{ id: "maintenance"'), "Maintenance Clean is for existing regular clients");
assert("Rules deploy with Functions", cloudWorkflow.includes("functions,firestore:rules,storage"), "A release must deploy backend and security rules together");
assert("Official PWA logo is published", fs.existsSync("public/apex-logo-official.svg"), "The exact official Apex logo must exist in public output");
assert("Production cloud automation is enabled", read(".env.production").includes("VITE_APEX_CLOUD_ENABLED=true"), "Production must not silently disable cloud booking");
assert("Root check script exists", typeof packageJson.scripts?.check === "string", "CI must have a root verification command");

for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}${check.ok ? "" : ` — ${check.detail}`}`);
}

const failures = checks.filter(check => !check.ok);
if (failures.length) {
  console.error(`\n${failures.length} launch architecture check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} launch architecture checks passed.`);
