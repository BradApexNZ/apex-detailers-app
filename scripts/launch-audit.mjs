import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const checks = [];
const assert = (name, condition, detail) => checks.push({ name, ok: Boolean(condition), detail });

const hq = read("hq.html");
const hqApp = read("src/hq-v6.jsx");
const pwa = read("src/hq-pwa.js");
const worker = read("public/apex-hq-sw.js");
const firebaseConfig = read("firebase.json");
const api = read("src/apex-api.js");
const backend = read("functions/index.js");
const rules = read("firestore.v5.rules");
const storage = read("storage.rules");
const deviceLock = read("src/device-lock.js");
const cloudWorkflow = read(".github/workflows/deploy-cloud.yml");
const hostingWorkflow = read(".github/workflows/deploy-hosting.yml");
const packageJson = JSON.parse(read("package.json"));

assert("HQ uses consolidated launch UI", hq.includes('/src/hq-v6.jsx'), "hq.html must load hq-v6.jsx");
assert("HQ theme + app stylesheet load", hq.includes('/src/apex-theme.css') && hq.includes('/src/hq-app.css'), "hq.html must load the consolidated Apex theme and HQ stylesheet");
assert("Premium auth UI is loaded", hq.includes('/src/hq-app.css') && hqApp.includes('function PinKeypad') && hqApp.includes('function PinDots'), "Login and trusted-device unlock must ship in HQ");
assert("Trusted-device PIN remains hardened", deviceLock.includes('PIN_LENGTH = 4') && deviceLock.includes('MAX_PIN_FAILURES = 5') && deviceLock.includes('INACTIVITY_LIMIT_MS = 5 * 60 * 1000'), "PIN unlock must retain 4 digits, lockout and inactivity protection");
assert("PIN setup is reachable in Settings", hqApp.includes('function PinSetup') && hqApp.includes('Set backup PIN'), "Owner must be able to configure quick unlock on-device");
assert("Old Google DOM controller is not loaded", !hq.includes("hq-google-calendar.js"), "Calendar must live inside React HQ");
assert("Old runtime patch stack is not loaded", !hq.includes("hq-production.js") && !hq.includes("hq-final-polish.js") && !hq.includes("hq-booking-controls.js") && !hq.includes("hq-launch-auth-guard.js") && !hq.includes("hq-device-lock-controls.js"), "Do not reintroduce competing runtime controllers");
assert("Legacy V5 app entry is gone", !fs.existsSync("src/main.jsx") && !fs.existsSync("src/hq-v5.jsx"), "Only the current V6 application entry should remain");
assert("HQ shell is not precached", !worker.includes('cache.put("/hq"') && !worker.includes('cache.put("/hq.html"'), "A deployed HQ must not resurrect an obsolete HTML shell");
assert("HQ navigation bypasses browser cache", worker.includes('cache: "no-store"') && pwa.includes('updateViaCache: "none"'), "Service-worker updates and live HQ navigation must fetch fresh code");
assert("HQ route is no-store at Firebase", firebaseConfig.includes('"source": "/hq"') && firebaseConfig.includes('"value": "no-cache,no-store,must-revalidate"'), "The /hq rewrite itself must not be browser cached");
assert("Launch API uses proven existing endpoints", api.includes('cloudCall("listBookingAvailability")') && api.includes('privateCall("syncJobToCalendar")') && !api.includes('listBookingAvailabilityV6'), "Launch must not depend on blocked new Cloud Run services");
assert("Public booking fails closed", !api.includes("fallbackAvailability") && !api.includes("fallbackSubmit"), "Do not accept bookings through a direct Firestore fallback");
assert("Calendar preferences stay outside OAuth credentials", api.includes('doc(db, "settings", "googleCalendar")') && backend.includes('db.doc("settings/googleCalendar")'), "Selected calendars must not require client access to OAuth secrets");
assert("Calendar checks all selected calendars", backend.includes('items: config.selectedCalendarIds.map(id => ({ id }))'), "Google FreeBusy must check every selected calendar");
assert("Calendar requires a writable primary", backend.includes('["owner", "writer"].includes(row.accessRole)') && backend.includes('No writable primary Google Calendar'), "New Apex events must never target a read-only calendar");
assert("Calendar availability fails closed", backend.includes('Google Calendar availability could not be verified') && !backend.includes('console.error("Calendar freebusy failed", error);\n    return [];'), "Google errors must not look like an empty calendar");
assert("Calendar records exact event and calendar IDs", backend.includes('calendarId: calendarResult.calendarId') && backend.includes('job.calendarId || job.sourceCalendarId'), "Updates and deletes must target the original event/calendar");
assert("Public Maintenance Clean is blocked", backend.includes('const publicServiceIds = new Set(["deep", "full", "tradie", "seats"])'), "Maintenance Clean is for existing regular clients");
assert("Public booking duration is server-owned", backend.includes('data.bookingEndTime = requestedStart.plus({ minutes: service.durationMinutes })'), "Browser-supplied end times must not control availability");
assert("Booking locks are server verified", backend.includes('serverVerified: true') && backend.includes('if (data.serverVerified !== true) return;'), "Direct Firestore locks must not block real availability");
assert("Storage rule source is owner-only", !storage.includes("request.auth == null"), "Job photos must remain private");
assert("Production cloud deploy excludes Storage", cloudWorkflow.includes("firestore:rules") && cloudWorkflow.includes('functions:${fn}') && !cloudWorkflow.includes("--only storage") && !cloudWorkflow.includes("functions,firestore:rules,storage"), "Storage IAM must not block Functions or Firestore deployment");
assert("Production cloud deploy is quota-safe", cloudWorkflow.includes('for fn in "${functions[@]}"') && cloudWorkflow.includes('sleep 8'), "Launch-critical Gen-2 functions must deploy sequentially so regional CPU quota cannot be exhausted by parallel revisions");
assert("Production cloud deploy excludes obsolete duplicate endpoints", !cloudWorkflow.includes('functions:getPublicBookingConfigV6') && !cloudWorkflow.includes('functions:listBookingAvailabilityV6') && !cloudWorkflow.includes('functions:submitBookingRequestV6'), "Launch deploy should update only endpoints used by the production client");
assert("Firestore rule source closes public direct booking writes", !rules.includes("validPublicBooking") && !rules.includes("allow read: if true"), "Branch rules must be ready to close legacy anonymous Firestore access");
assert("Hosting deploy is independently gated", hostingWorkflow.includes("Deploy Apex Hosting") && hostingWorkflow.includes("npm run build"), "Frontend deployment must remain independently deployable");
assert("Photos remain available", hqApp.includes('uploadPhotos') && hqApp.includes('photoCategories'), "Launch retains owner job photo storage");
assert("Hnry/payment workflow is present", hqApp.includes('Prepare Hnry Invoice') && hqApp.includes('Invoice Sent') && hqApp.includes('paidAmount'), "Jobs need the invoicing/payment workflow");
assert("Mobile has full navigation path", hqApp.includes('mobileMenu') && hqApp.includes('More'), "Photos, vouchers and settings must be reachable on iPhone");
assert("Customer editing is present", hqApp.includes('selectedCustomer') && hqApp.includes('Customer updated.'), "Existing customers must be editable");
assert("Follow-up dates are operational", hqApp.includes('followUpDueDate') && hqApp.includes('maintenanceDueDate'), "Follow-up and maintenance reminders need real dates");
assert("Official PWA logo is published", fs.existsSync("public/apex-logo-official.svg"), "The exact official Apex logo must exist in public output");
assert("Production cloud automation is enabled", read(".env.production").includes("VITE_APEX_CLOUD_ENABLED=true"), "Production must not silently disable cloud booking");
assert("Root check script exists", typeof packageJson.scripts?.check === "string", "CI must have a root verification command");
assert("Storage deploy is explicit", packageJson.scripts?.["deploy:storage"] === "firebase deploy --only storage", "Storage must be an intentional separate deployment");

for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}${check.ok ? "" : ` — ${check.detail}`}`);
const failures = checks.filter(check => !check.ok);
if (failures.length) {
  console.error(`\n${failures.length} launch architecture check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} launch architecture checks passed.`);
