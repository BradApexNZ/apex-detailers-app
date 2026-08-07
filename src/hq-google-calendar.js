import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import {
  getGoogleCalendarStatus,
  importGoogleCalendarEvents,
  listGoogleCalendars,
  saveGoogleCalendarSelection,
  startGoogleCalendarConnect
} from "./apex-api";

let state = {
  connected: false,
  email: "",
  calendars: [],
  selectedCalendarIds: [],
  primaryCalendarId: "",
  loading: false,
  error: ""
};
let importRunning = false;
let lastAutomaticImport = 0;

const clean = value => String(value ?? "").trim();

function toast(message) {
  document.querySelector("[data-apex-google-toast]")?.remove();
  const node = document.createElement("div");
  node.dataset.apexGoogleToast = "true";
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 5000);
}

function calendarSection() {
  return [...document.querySelectorAll(".settings > section")]
    .find(section => section.querySelector("h3")?.textContent.trim() === "Google Calendar") || null;
}

function connectionMessage() {
  if (state.loading) return "Checking Google Calendar…";
  if (state.error) return state.error;
  if (!state.connected) return "Not connected. Connect the Google account that owns or can access your Apex calendars.";
  const selected = state.calendars.filter(calendar => state.selectedCalendarIds.includes(calendar.id));
  return `${state.email || "Google account connected"} · ${selected.length} calendar${selected.length === 1 ? "" : "s"} selected`;
}

function render() {
  const section = calendarSection();
  if (!section) return;

  section.querySelector("[data-apex-google-control]")?.remove();
  const existingButtons = [...section.querySelectorAll(":scope > button")];
  existingButtons.forEach(button => { button.hidden = true; });

  const control = document.createElement("div");
  control.dataset.apexGoogleControl = "true";
  control.className = "apexGoogleControl";
  control.innerHTML = `
    <div class="integration ${state.connected ? "connected" : ""}">
      <b>${state.connected ? "Google Calendar connected" : "Google Calendar not connected"}</b>
      <span>${connectionMessage()}</span>
    </div>
    <div class="apexGoogleActions">
      <button type="button" data-google-connect>${state.connected ? "Reconnect Google account" : "Connect Google account"}</button>
      <button type="button" class="secondary" data-google-refresh>Refresh status</button>
    </div>
    ${state.connected ? `
      <div class="apexGoogleCalendars">
        <h4>Calendars used by Apex</h4>
        <p class="muted">Selected calendars are imported into Apex and block public booking conflicts. Choose one primary calendar for new Apex bookings.</p>
        ${state.calendars.map(calendar => `
          <label class="apexGoogleCalendarRow">
            <input type="checkbox" data-calendar-id="${encodeURIComponent(calendar.id)}" ${state.selectedCalendarIds.includes(calendar.id) ? "checked" : ""}>
            <span><b>${calendar.name}</b><small>${calendar.accessRole}${calendar.primary ? " · Google primary" : ""}</small></span>
            <input type="radio" name="apex-primary-calendar" data-primary-id="${encodeURIComponent(calendar.id)}" ${state.primaryCalendarId === calendar.id ? "checked" : ""} ${state.selectedCalendarIds.includes(calendar.id) ? "" : "disabled"} aria-label="Use ${calendar.name} as primary">
          </label>
        `).join("") || `<p class="muted">No accessible calendars were returned by Google.</p>`}
        <div class="apexGoogleActions">
          <button type="button" data-google-save>Save calendar selection</button>
          <button type="button" class="secondary" data-google-sync>Sync bookings from Google now</button>
        </div>
      </div>
    ` : ""}
  `;
  section.appendChild(control);

  control.querySelector("[data-google-connect]")?.addEventListener("click", connect);
  control.querySelector("[data-google-refresh]")?.addEventListener("click", () => load(true));
  control.querySelectorAll("[data-calendar-id]").forEach(input => {
    input.addEventListener("change", () => {
      const id = decodeURIComponent(input.dataset.calendarId);
      const ids = new Set(state.selectedCalendarIds);
      if (input.checked) ids.add(id); else ids.delete(id);
      state.selectedCalendarIds = [...ids];
      if (!state.selectedCalendarIds.includes(state.primaryCalendarId)) state.primaryCalendarId = state.selectedCalendarIds[0] || "";
      render();
    });
  });
  control.querySelectorAll("[data-primary-id]").forEach(input => {
    input.addEventListener("change", () => {
      if (input.checked) state.primaryCalendarId = decodeURIComponent(input.dataset.primaryId);
    });
  });
  control.querySelector("[data-google-save]")?.addEventListener("click", saveSelection);
  control.querySelector("[data-google-sync]")?.addEventListener("click", () => syncBookings(true));
}

async function load(announce = false) {
  if (!auth.currentUser) return;
  state.loading = true;
  state.error = "";
  render();
  try {
    const [status, calendars] = await Promise.all([
      getGoogleCalendarStatus(),
      listGoogleCalendars()
    ]);
    state = {
      ...state,
      ...status,
      ...calendars,
      connected: Boolean(status?.connected && calendars?.connected),
      calendars: calendars?.calendars || [],
      selectedCalendarIds: calendars?.selectedCalendarIds || [],
      primaryCalendarId: calendars?.primaryCalendarId || "",
      loading: false,
      error: ""
    };
    if (announce) toast(state.connected ? "Google Calendar connection verified." : "Google Calendar is not connected.");
  } catch (error) {
    state.loading = false;
    state.error = clean(error?.message || "Could not load Google Calendar settings.").replace(/^Firebase:\s*/i, "");
    if (announce) toast(state.error);
  }
  render();
}

async function connect() {
  try {
    const result = await startGoogleCalendarConnect();
    if (!result?.url) throw new Error("Google did not return an authorization URL.");
    window.location.assign(result.url);
  } catch (error) {
    toast(clean(error?.message || "Could not start Google authorization.").replace(/^Firebase:\s*/i, ""));
  }
}

async function saveSelection() {
  if (!state.selectedCalendarIds.length) return toast("Select at least one Google Calendar.");
  try {
    await saveGoogleCalendarSelection({
      selectedCalendarIds: state.selectedCalendarIds,
      primaryCalendarId: state.primaryCalendarId || state.selectedCalendarIds[0]
    });
    toast("Google Calendar selection saved.");
    await syncBookings(true);
  } catch (error) {
    toast(clean(error?.message || "Could not save calendar selection.").replace(/^Firebase:\s*/i, ""));
  }
}

async function syncBookings(announce = false) {
  if (!auth.currentUser || importRunning) return;
  importRunning = true;
  try {
    const result = await importGoogleCalendarEvents({ daysBack: 30, daysForward: 365 });
    lastAutomaticImport = Date.now();
    if (announce) toast(`Google sync complete: ${result.imported || 0} added, ${result.updated || 0} updated across ${result.calendars || 0} calendar${result.calendars === 1 ? "" : "s"}.`);
  } catch (error) {
    if (announce) toast(clean(error?.message || "Google Calendar sync failed.").replace(/^Firebase:\s*/i, ""));
    console.error("Google Calendar sync failed", error);
  } finally {
    importRunning = false;
  }
}

function automaticSync() {
  if (Date.now() - lastAutomaticImport > 5 * 60 * 1000) syncBookings(false);
}

onAuthStateChanged(auth, user => {
  if (!user) return;
  setTimeout(async () => {
    await load(false);
    if (state.connected) automaticSync();
  }, 750);
});

document.addEventListener("click", event => {
  const button = event.target.closest?.("button");
  const label = button?.textContent.trim();
  if (label === "Settings") setTimeout(() => { render(); load(false); }, 50);
  if (label === "Calendar") setTimeout(automaticSync, 50);
});

new MutationObserver(() => render()).observe(document.body, { childList: true, subtree: true });

const style = document.createElement("style");
style.textContent = `
.apexGoogleControl{display:grid;gap:14px}.apexGoogleActions{display:flex;flex-wrap:wrap;gap:9px}.apexGoogleCalendars{display:grid;gap:10px;margin-top:4px}.apexGoogleCalendars h4{margin:0;font-size:18px}.apexGoogleCalendarRow{display:grid!important;grid-template-columns:auto 1fr auto;align-items:center;gap:11px;padding:12px!important;border:1px solid #34343a;border-radius:14px;background:#151518}.apexGoogleCalendarRow input{width:20px!important;height:20px!important;margin:0!important}.apexGoogleCalendarRow span{display:grid;gap:2px}.apexGoogleCalendarRow small{color:#a6a29a}.apexGoogleActions button{flex:1 1 180px}
`;
document.head.appendChild(style);
