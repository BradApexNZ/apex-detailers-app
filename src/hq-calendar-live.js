import { addDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import {
  getGoogleCalendarStatus,
  startGoogleCalendarConnect,
  syncJobToCalendar
} from "./apex-api";

let jobs = [];
let customers = [];
let selectedDate = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
let visibleMonth = selectedDate.slice(0, 7);
let calendarStatus = { connected: false };
let started = false;

const clean = value => String(value ?? "").trim();
const normal = value => clean(value).toLowerCase().replace(/\s+/g, " ");
const phoneKey = value => clean(value).replace(/\D/g, "");
const customerName = row => clean(row.customerName || row.name || row.businessName);
const activeJob = job => !["Archived", "Cancelled"].includes(job.status);
const jobSort = (a, b) => `${a.bookingDate || ""}${a.bookingTime || ""}`.localeCompare(`${b.bookingDate || ""}${b.bookingTime || ""}`);

function showToast(text) {
  document.querySelector("[data-apex-calendar-toast]")?.remove();
  const toast = document.createElement("div");
  toast.dataset.apexCalendarToast = "true";
  toast.className = "toast";
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function messageFor(error) {
  return clean(error?.message || "Google Calendar action failed.").replace(/^Firebase:\s*/i, "");
}

async function loadStatus() {
  try {
    calendarStatus = await getGoogleCalendarStatus();
  } catch (error) {
    calendarStatus = { connected: false, error: messageFor(error) };
  }
  renderSettings();
  renderCalendar();
}

async function connectGoogle(button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Opening Google…";
  try {
    const result = await startGoogleCalendarConnect();
    if (!result?.url) throw new Error("No Google authorization link was returned.");
    window.location.assign(result.url);
  } catch (error) {
    button.disabled = false;
    button.textContent = original;
    showToast(messageFor(error));
  }
}

function findSettingsSection() {
  return [...document.querySelectorAll(".settings > section")]
    .find(section => section.querySelector("h3")?.textContent.trim() === "Google Calendar");
}

function renderSettings() {
  const section = findSettingsSection();
  if (!section) return;
  section.classList.add("apexCalendarSettings");
  const card = section.querySelector(".integration");
  card?.classList.toggle("connected", Boolean(calendarStatus.connected));
  const title = card?.querySelector("b");
  const detail = card?.querySelector("span");
  if (title) title.textContent = calendarStatus.connected ? "Google Calendar synced" : "Google Calendar not connected";
  if (detail) detail.textContent = calendarStatus.connected
    ? `Connected${calendarStatus.email ? ` as ${calendarStatus.email}` : ""}. The encrypted refresh token keeps this connection active.`
    : (calendarStatus.error || "Connect Google Calendar to block busy times and sync confirmed jobs.");

  const buttons = [...section.querySelectorAll("button")];
  const connect = buttons.find(button => /connect|reconnect/i.test(button.textContent));
  const refresh = buttons.find(button => /refresh/i.test(button.textContent));
  if (connect && connect.dataset.liveWired !== "true") {
    const replacement = connect.cloneNode(true);
    connect.replaceWith(replacement);
    replacement.dataset.liveWired = "true";
    replacement.addEventListener("click", () => connectGoogle(replacement));
  }
  const liveConnect = [...section.querySelectorAll("button")].find(button => /connect|reconnect/i.test(button.textContent));
  if (liveConnect) liveConnect.textContent = calendarStatus.connected ? "Reconnect Google Calendar" : "Connect Google Calendar";
  if (refresh && refresh.dataset.liveWired !== "true") {
    const replacement = refresh.cloneNode(true);
    refresh.replaceWith(replacement);
    replacement.dataset.liveWired = "true";
    replacement.addEventListener("click", async () => {
      replacement.disabled = true;
      await loadStatus();
      replacement.disabled = false;
      showToast(calendarStatus.connected ? "Google Calendar is connected." : "Google Calendar is not connected.");
    });
  }
}

function findCalendarRoot() {
  const intro = [...document.querySelectorAll("main .intro")]
    .find(node => /schedule|calendar/i.test(node.querySelector("h2")?.textContent || ""));
  return intro?.parentElement || null;
}

function monthLabel(value) {
  return new Date(`${value}-01T12:00:00`).toLocaleDateString("en-NZ", { month: "long", year: "numeric" });
}

function shiftMonth(delta) {
  const date = new Date(`${visibleMonth}-01T12:00:00`);
  date.setMonth(date.getMonth() + delta);
  visibleMonth = date.toLocaleDateString("en-CA").slice(0, 7);
  renderCalendar();
}

function monthDays(value) {
  const [year, month] = value.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const days = new Date(year, month, 0).getDate();
  const mondayOffset = (first.getDay() + 6) % 7;
  return [
    ...Array.from({ length: mondayOffset }, () => null),
    ...Array.from({ length: days }, (_, index) => `${value}-${String(index + 1).padStart(2, "0")}`)
  ];
}

function syncState(job) {
  if (job.calendarEventId) return { key: "synced", label: "Synced", icon: "✓" };
  if (job.calendarSyncError) return { key: "failed", label: "Sync failed", icon: "!" };
  return { key: "pending", label: "Not synced", icon: "↻" };
}

async function retrySync(jobId, button) {
  button.disabled = true;
  button.textContent = "Syncing…";
  try {
    const result = await syncJobToCalendar({ jobId });
    showToast(result?.eventId ? "Google Calendar event synced." : "Job checked, but no event ID was returned.");
  } catch (error) {
    showToast(messageFor(error));
  } finally {
    button.disabled = false;
    button.textContent = "Retry sync";
  }
}

function customerExists(job) {
  const email = normal(job.email);
  const phone = phoneKey(job.phone);
  const name = normal(customerName(job));
  return customers.some(customer => {
    const customerEmail = normal(customer.email);
    const customerPhone = phoneKey(customer.phone);
    const existingName = normal(customer.businessName || `${customer.firstName || ""} ${customer.lastName || ""}`);
    return Boolean((email && customerEmail === email) || (phone && customerPhone === phone) || (name && existingName === name));
  });
}

function potentialCustomers() {
  const seen = new Set();
  return jobs.filter(activeJob).filter(job => {
    if (customerExists(job)) return false;
    const key = normal(job.email) || phoneKey(job.phone) || normal(customerName(job));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return Boolean(customerName(job) && (job.email || job.phone));
  }).slice(0, 12);
}

async function addPotentialCustomer(job, button) {
  const full = customerName(job);
  const parts = full.split(/\s+/).filter(Boolean);
  button.disabled = true;
  try {
    await addDoc(collection(db, "customers"), {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" "),
      businessName: "",
      phone: clean(job.phone),
      email: normal(job.email),
      address: clean(job.address),
      area: clean(job.area) || "Napier",
      preferredContact: job.email ? "email" : "text",
      customerType: "standard",
      notes: `Suggested from synced booking${job.calendarEventId ? ` / Google event ${job.calendarEventId}` : ""}.`,
      lastVehicle: clean(job.vehicle),
      sourceJobId: job.id,
      ownerUid: auth.currentUser?.uid || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    showToast(`${full} added to Customers.`);
  } catch (error) {
    button.disabled = false;
    showToast(messageFor(error));
  }
}

function renderCalendar() {
  const root = findCalendarRoot();
  if (!root) return;
  root.querySelector("[data-apex-calendar-upgrade]")?.remove();
  const oldList = root.querySelector(":scope > .calendar");
  if (oldList) oldList.hidden = true;
  const oldEmpty = root.querySelector(":scope > .empty");
  if (oldEmpty) oldEmpty.hidden = true;

  const panel = document.createElement("section");
  panel.dataset.apexCalendarUpgrade = "true";
  panel.className = "apexCalendarUpgrade";
  const byDate = jobs.filter(activeJob).reduce((map, job) => {
    if (!job.bookingDate) return map;
    (map[job.bookingDate] ||= []).push(job);
    return map;
  }, {});
  const selectedJobs = [...(byDate[selectedDate] || [])].sort(jobSort);
  const prospects = potentialCustomers();
  panel.innerHTML = `
    <div class="apexCalendarToolbar">
      <div><span class="eyebrow">LIVE APEX SCHEDULE</span><h3>${monthLabel(visibleMonth)}</h3></div>
      <div class="apexCalendarConnection ${calendarStatus.connected ? "connected" : "offline"}">
        <i>${calendarStatus.connected ? "✓" : "!"}</i>
        <span><b>${calendarStatus.connected ? "Google synced" : "Not connected"}</b><small>${calendarStatus.email || "Open Settings to connect"}</small></span>
      </div>
      <div class="apexMonthButtons"><button data-prev aria-label="Previous month">←</button><button data-today>Today</button><button data-next aria-label="Next month">→</button></div>
    </div>
    <div class="apexMonthGrid">
      ${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => `<b class="apexWeekday">${day}</b>`).join("")}
      ${monthDays(visibleMonth).map(date => {
        if (!date) return `<span class="apexBlankDay"></span>`;
        const count = byDate[date]?.length || 0;
        const syncProblems = (byDate[date] || []).filter(job => !job.calendarEventId).length;
        return `<button class="apexDay ${date === selectedDate ? "selected" : ""} ${date === new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" }) ? "today" : ""}" data-date="${date}"><span>${Number(date.slice(-2))}</span>${count ? `<em>${count}</em>` : ""}${syncProblems ? `<i title="Unsynced jobs">!</i>` : ""}</button>`;
      }).join("")}
    </div>
    <div class="apexDayPanel">
      <header><div><span class="eyebrow">SELECTED DAY</span><h3>${new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" })}</h3></div><strong>${selectedJobs.length} booking${selectedJobs.length === 1 ? "" : "s"}</strong></header>
      <div class="apexDayBookings">
        ${selectedJobs.length ? selectedJobs.map(job => {
          const state = syncState(job);
          return `<article class="apexBookingCard"><time>${clean(job.bookingTime) || "TBC"}</time><div><h4>${customerName(job) || "Unnamed booking"}</h4><p>${clean(job.vehicle) || "Vehicle not recorded"} · ${clean(job.packageName || job.serviceName) || "Service"}</p><small>${[job.address, job.area].filter(Boolean).join(", ") || "No address saved"}</small></div><span class="apexSyncBadge ${state.key}"><i>${state.icon}</i>${state.label}</span>${state.key !== "synced" ? `<button data-sync-job="${job.id}">Retry sync</button>` : ""}</article>`;
        }).join("") : `<div class="apexNoBookings">No bookings on this day.</div>`}
      </div>
    </div>
    <div class="apexProspects">
      <header><div><span class="eyebrow">CUSTOMER SUGGESTIONS</span><h3>Potential customers from bookings</h3></div><p>Matches synced booking contact details against your saved customers.</p></header>
      <div class="apexProspectGrid">${prospects.length ? prospects.map(job => `<article><div><b>${customerName(job)}</b><span>${clean(job.email) || clean(job.phone)}</span><small>${clean(job.vehicle) || "Booking contact"}</small></div><button data-add-customer="${job.id}">Add customer</button></article>`).join("") : `<div class="apexNoProspects">No new customer suggestions right now.</div>`}</div>
    </div>
  `;
  root.appendChild(panel);
  panel.querySelector("[data-prev]").addEventListener("click", () => shiftMonth(-1));
  panel.querySelector("[data-next]").addEventListener("click", () => shiftMonth(1));
  panel.querySelector("[data-today]").addEventListener("click", () => {
    selectedDate = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
    visibleMonth = selectedDate.slice(0, 7);
    renderCalendar();
  });
  panel.querySelectorAll("[data-date]").forEach(button => button.addEventListener("click", () => {
    selectedDate = button.dataset.date;
    renderCalendar();
  }));
  panel.querySelectorAll("[data-sync-job]").forEach(button => button.addEventListener("click", () => retrySync(button.dataset.syncJob, button)));
  panel.querySelectorAll("[data-add-customer]").forEach(button => button.addEventListener("click", () => {
    const job = jobs.find(row => row.id === button.dataset.addCustomer);
    if (job) addPotentialCustomer(job, button);
  }));
}

function injectStyles() {
  if (document.getElementById("apex-calendar-upgrade-styles")) return;
  const style = document.createElement("style");
  style.id = "apex-calendar-upgrade-styles";
  style.textContent = `
    [data-apex-google-quick],.apexGoogleQuickConnect,[data-apex-google-panel]{display:none!important}
    .apexCalendarUpgrade{display:grid;gap:16px}.apexCalendarToolbar,.apexDayPanel,.apexProspects{border:1px solid #2c2c31;border-radius:25px;background:linear-gradient(145deg,rgba(255,255,255,.055),transparent 40%),#111114;padding:20px}.apexCalendarToolbar{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:14px;border-color:#66561c}.apexCalendarToolbar h3,.apexDayPanel h3,.apexProspects h3{margin:5px 0 0;font-size:26px}.apexMonthButtons{display:flex;gap:7px}.apexMonthButtons button,.apexBookingCard button,.apexProspectGrid button{min-height:40px;padding:8px 13px;border:1px solid #4a421f;border-radius:12px;background:#ffd21f;color:#111;font-weight:900}.apexCalendarConnection{display:flex;align-items:center;gap:9px;padding:10px 13px;border:1px solid #704044;border-radius:14px;background:#35161a}.apexCalendarConnection.connected{border-color:#397c51;background:#173923}.apexCalendarConnection>i{display:grid;place-items:center;width:29px;height:29px;border-radius:50%;background:#d85d64;color:#111;font-style:normal;font-weight:1000}.apexCalendarConnection.connected>i{background:#66c77e}.apexCalendarConnection b,.apexCalendarConnection small{display:block}.apexCalendarConnection small{margin-top:2px;color:#aaa69e}.apexMonthGrid{display:grid;grid-template-columns:repeat(7,1fr);gap:7px;padding:13px;border:1px solid #2c2c31;border-radius:24px;background:#0e0e10}.apexWeekday{padding:7px;text-align:center;color:#aaa69e;font-size:11px}.apexDay,.apexBlankDay{position:relative;min-height:76px;border:1px solid #2c2c31;border-radius:15px;background:#151518;color:#fff}.apexDay{padding:12px;text-align:left}.apexDay:hover,.apexDay.selected{border-color:#ffd21f;background:linear-gradient(145deg,#3b3418,#171719);box-shadow:inset 0 0 0 1px #ffd21f55}.apexDay.today span{text-decoration:underline;text-decoration-color:#ffd21f;text-decoration-thickness:3px}.apexDay span{font-size:18px;font-weight:900}.apexDay em{position:absolute;right:8px;bottom:8px;display:grid;place-items:center;min-width:24px;height:24px;padding:0 6px;border-radius:99px;background:#ffd21f;color:#111;font-size:11px;font-style:normal;font-weight:1000}.apexDay>i{position:absolute;right:8px;top:8px;display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#b94c53;color:white;font-size:11px;font-style:normal;font-weight:1000}.apexDayPanel header,.apexProspects>header{display:flex;justify-content:space-between;align-items:end;gap:16px;margin-bottom:13px}.apexDayPanel header strong{color:#ffd21f}.apexDayBookings{display:grid;gap:8px}.apexBookingCard{display:grid;grid-template-columns:62px minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:14px;border:1px solid #2c2c31;border-radius:17px;background:#0d0d0f}.apexBookingCard time{font-size:17px;font-weight:1000;color:#ffd21f}.apexBookingCard h4{margin:0}.apexBookingCard p,.apexBookingCard small{display:block;margin:4px 0 0;color:#aaa69e}.apexSyncBadge{display:flex;align-items:center;gap:5px;padding:7px 9px;border-radius:99px;font-size:10px;font-weight:900}.apexSyncBadge i{font-style:normal}.apexSyncBadge.synced{background:#173923;color:#9de5ae}.apexSyncBadge.pending{background:#3a3215;color:#ffe57a}.apexSyncBadge.failed{background:#40191c;color:#ffb9bd}.apexProspectGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px}.apexProspectGrid article{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;border:1px solid #2c2c31;border-radius:16px;background:#0d0d0f}.apexProspectGrid b,.apexProspectGrid span,.apexProspectGrid small{display:block}.apexProspectGrid span,.apexProspectGrid small,.apexProspects header p{margin-top:4px;color:#aaa69e}.apexNoBookings,.apexNoProspects{padding:24px;border:1px dashed #39393d;border-radius:16px;color:#aaa69e;text-align:center}.apexCalendarSettings{border-color:#397c51!important}.apexCalendarSettings .integration.connected{box-shadow:0 0 25px rgba(70,170,100,.08)}
    @media(max-width:760px){.apexCalendarToolbar{grid-template-columns:1fr}.apexCalendarConnection{order:3}.apexMonthButtons{justify-content:space-between}.apexMonthButtons button{flex:1}.apexMonthGrid{gap:4px;padding:7px}.apexDay,.apexBlankDay{min-height:57px;border-radius:11px;padding:8px}.apexDay span{font-size:15px}.apexDay em{right:5px;bottom:5px;min-width:19px;height:19px;font-size:9px}.apexWeekday{font-size:9px;padding:5px 1px}.apexBookingCard{grid-template-columns:52px 1fr}.apexBookingCard .apexSyncBadge,.apexBookingCard button{grid-column:2}.apexProspectGrid{grid-template-columns:1fr}.apexDayPanel header,.apexProspects>header{align-items:flex-start;flex-direction:column}}
  `;
  document.head.appendChild(style);
}

function startSubscriptions() {
  if (started || !auth.currentUser) return;
  started = true;
  onSnapshot(collection(db, "jobs"), snapshot => {
    jobs = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
    renderCalendar();
  });
  onSnapshot(collection(db, "customers"), snapshot => {
    customers = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
    renderCalendar();
  });
  loadStatus();
}

function refresh() {
  injectStyles();
  document.querySelectorAll("[data-apex-google-quick],.apexGoogleQuickConnect,[data-apex-google-panel]").forEach(node => node.remove());
  renderSettings();
  renderCalendar();
  startSubscriptions();
}

let frame = 0;
const observer = new MutationObserver(() => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    refresh();
  });
});
observer.observe(document.documentElement, { childList: true, subtree: true });
refresh();
