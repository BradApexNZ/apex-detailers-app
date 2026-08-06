import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { importGoogleCalendarEvents } from "./apex-api";

let running = false;
let lastRun = 0;

function toast(message) {
  document.querySelector("[data-apex-calendar-import-toast]")?.remove();
  const node = document.createElement("div");
  node.dataset.apexCalendarImportToast = "true";
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 4500);
}

async function importCalendar({ force = false, announce = false } = {}) {
  if (!auth.currentUser || running) return;
  if (!force && Date.now() - lastRun < 5 * 60 * 1000) return;
  running = true;
  try {
    const result = await importGoogleCalendarEvents({ daysBack: 30, daysForward: 365 });
    lastRun = Date.now();
    if (announce) toast(`Google Calendar checked: ${result.imported || 0} new, ${result.updated || 0} updated.`);
  } catch (error) {
    if (announce) toast(String(error?.message || "Google Calendar import failed.").replace(/^Firebase:\s*/i, ""));
    console.warn("Apex Google Calendar import failed", error);
  } finally {
    running = false;
  }
}

function isCalendarButton(target) {
  const button = target.closest("button");
  return button && /^calendar$/i.test(button.textContent.trim());
}

function addSettingsButton() {
  const section = [...document.querySelectorAll(".settings > section")]
    .find(item => item.querySelector("h3")?.textContent.trim() === "Google Calendar");
  if (!section || section.querySelector("[data-import-google-calendar]")) return;
  const button = document.createElement("button");
  button.className = "secondary";
  button.dataset.importGoogleCalendar = "true";
  button.textContent = "Sync bookings from Google now";
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Syncing Google bookings…";
    await importCalendar({ force: true, announce: true });
    button.disabled = false;
    button.textContent = "Sync bookings from Google now";
  });
  section.appendChild(button);
}

onAuthStateChanged(auth, user => {
  if (user) setTimeout(() => importCalendar(), 1500);
});

document.addEventListener("click", event => {
  if (isCalendarButton(event.target)) setTimeout(() => importCalendar({ force: true, announce: true }), 250);
  if (event.target.closest("button")?.textContent.trim() === "Settings") setTimeout(addSettingsButton, 250);
});

new MutationObserver(() => addSettingsButton()).observe(document.body, { childList: true, subtree: true });
