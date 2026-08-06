import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { getGoogleCalendarStatus, syncJobToCalendar } from "./apex-api";

let jobs = [];
let status = { connected: false };
let syncing = false;
let lastChecked = null;

const active = job => !["Archived", "Cancelled"].includes(job.status);
const unsynced = job => active(job) && job.bookingDate && !job.calendarEventId;
const clean = value => String(value ?? "").trim();

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 5000);
}

function nzTime(date = new Date()) {
  return date.toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit", timeZone: "Pacific/Auckland" });
}

async function refreshHealth() {
  try {
    status = await getGoogleCalendarStatus();
  } catch (error) {
    status = { connected: false, error: clean(error?.message) || "Calendar status unavailable" };
  }
  lastChecked = new Date();
  renderHealth();
}

async function syncAll(button) {
  if (syncing) return;
  const queue = jobs.filter(unsynced);
  if (!queue.length) return toast("Every active booking is already synced.");
  syncing = true;
  button.disabled = true;
  let success = 0;
  let failed = 0;
  for (let index = 0; index < queue.length; index += 1) {
    button.textContent = `Syncing ${index + 1}/${queue.length}…`;
    try {
      await syncJobToCalendar({ jobId: queue[index].id });
      success += 1;
    } catch {
      failed += 1;
    }
  }
  syncing = false;
  button.disabled = false;
  button.textContent = "Sync all missing";
  toast(`${success} booking${success === 1 ? "" : "s"} synced${failed ? `, ${failed} failed` : ""}.`);
  renderHealth();
}

function bookingUrl() {
  return `${window.location.origin}/book`;
}

async function shareBookingPage(button) {
  const url = bookingUrl();
  try {
    if (navigator.share) {
      await navigator.share({ title: "Book Apex Detailers", text: "Book your vehicle detail with Apex Detailers.", url });
      return;
    }
    await navigator.clipboard.writeText(url);
    button.textContent = "Link copied ✓";
    setTimeout(() => { button.textContent = "Share booking page"; }, 1800);
  } catch (error) {
    if (error?.name !== "AbortError") toast("Could not share the booking link.");
  }
}

function readinessItems() {
  const missing = jobs.filter(unsynced).length;
  return [
    { ok: Boolean(status.connected), label: status.connected ? "Google Calendar connected" : "Google Calendar needs attention" },
    { ok: missing === 0, label: missing ? `${missing} active booking${missing === 1 ? "" : "s"} not synced` : "All active bookings synced" },
    { ok: true, label: "Google busy times block public availability" },
    { ok: true, label: "Apex jobs block duplicate booking times" },
    { ok: true, label: "New Zealand date and time zone enabled" }
  ];
}

function renderHealth() {
  const calendar = document.querySelector("[data-apex-calendar-upgrade]");
  if (!calendar) return;
  let panel = calendar.querySelector("[data-apex-calendar-health]");
  if (!panel) {
    panel = document.createElement("section");
    panel.dataset.apexCalendarHealth = "true";
    panel.className = "apexCalendarHealth";
    calendar.prepend(panel);
  }
  const missing = jobs.filter(unsynced).length;
  const items = readinessItems();
  panel.innerHTML = `
    <header>
      <div><span class="eyebrow">SYNC HEALTH</span><h3>${status.connected ? "Calendar connection healthy" : "Calendar needs attention"}</h3><p>${status.connected ? `Connected${status.email ? ` as ${status.email}` : ""}` : (status.error || "Reconnect Google Calendar from Settings.")}</p></div>
      <div class="apexHealthScore ${status.connected && missing === 0 ? "good" : "warn"}"><b>${items.filter(item => item.ok).length}/${items.length}</b><span>checks passed</span></div>
    </header>
    <div class="apexHealthChecks">${items.map(item => `<span class="${item.ok ? "ok" : "bad"}"><i>${item.ok ? "✓" : "!"}</i>${item.label}</span>`).join("")}</div>
    <div class="apexHealthActions">
      <button type="button" data-sync-all ${missing ? "" : "disabled"}>${missing ? `Sync all missing (${missing})` : "Everything synced"}</button>
      <button type="button" class="secondary" data-refresh-health>Refresh connection</button>
      <button type="button" class="secondary" data-share-booking>Share booking page</button>
      <a href="/book" target="_blank" rel="noopener">Preview public page ↗</a>
    </div>
    <small>Last checked ${lastChecked ? nzTime(lastChecked) : "just now"} · Connection is stored securely and checked automatically.</small>
  `;
  panel.querySelector("[data-sync-all]")?.addEventListener("click", event => syncAll(event.currentTarget));
  panel.querySelector("[data-refresh-health]")?.addEventListener("click", async event => {
    event.currentTarget.disabled = true;
    await refreshHealth();
    event.currentTarget.disabled = false;
    toast(status.connected ? "Calendar connection confirmed." : "Calendar connection needs attention.");
  });
  panel.querySelector("[data-share-booking]")?.addEventListener("click", event => shareBookingPage(event.currentTarget));
}

function injectStyles() {
  if (document.getElementById("apex-calendar-hardening-styles")) return;
  const style = document.createElement("style");
  style.id = "apex-calendar-hardening-styles";
  style.textContent = `
    .apexCalendarHealth{display:grid;gap:14px;padding:18px;border:1px solid rgba(255,210,31,.28);border-radius:24px;background:linear-gradient(145deg,rgba(255,210,31,.08),rgba(255,255,255,.025));margin-bottom:16px}.apexCalendarHealth header{display:flex;justify-content:space-between;gap:16px;align-items:center}.apexCalendarHealth h3{margin:4px 0;font-size:24px}.apexCalendarHealth p,.apexCalendarHealth small{margin:0;color:#aaa}.apexHealthScore{display:grid;place-items:center;min-width:92px;padding:12px;border-radius:18px;background:#391c1f;border:1px solid #714248}.apexHealthScore.good{background:#173923;border-color:#397c51}.apexHealthScore b{font-size:24px}.apexHealthScore span{font-size:11px;color:#bbb}.apexHealthChecks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.apexHealthChecks span{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;background:#18181b;color:#bbb}.apexHealthChecks i{display:grid;place-items:center;width:23px;height:23px;border-radius:50%;font-style:normal;font-weight:900}.apexHealthChecks .ok i{background:#66c77e;color:#102015}.apexHealthChecks .bad i{background:#d85d64;color:#25080b}.apexHealthActions{display:flex;gap:9px;flex-wrap:wrap}.apexHealthActions button,.apexHealthActions a{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:9px 14px;border-radius:12px;border:1px solid #54491d;background:#ffd21f;color:#111;font-weight:900;text-decoration:none}.apexHealthActions .secondary,.apexHealthActions a{background:#202126;color:#eee;border-color:#3c3d44}.apexHealthActions button:disabled{opacity:.55}.apexSyncBadge.synced:after{content:" · live";opacity:.7}@media(max-width:720px){.apexCalendarHealth header{align-items:flex-start}.apexHealthChecks{grid-template-columns:1fr}.apexHealthActions>*{flex:1 1 100%}}
  `;
  document.head.appendChild(style);
}

function start() {
  injectStyles();
  onSnapshot(collection(db, "jobs"), snapshot => {
    jobs = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
    renderHealth();
  });
  refreshHealth();
  setInterval(refreshHealth, 5 * 60 * 1000);
  const observer = new MutationObserver(() => renderHealth());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

start();
