import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { getGoogleCalendarEvents, importGoogleCalendarEvents } from "./apex-api";

const SECONDARY_TABS = ["Quotes", "Photos", "Vouchers", "Settings"];
let jobs = [];
let googleEvents = [];
let monthCursor = new Date();
let selectedDate = null;
let syncInFlight = false;
let liveFetchInFlight = false;
let lastLiveRange = "";

const clean = value => String(value || "").trim();
const isoDate = date => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

function buttons() {
  return [...document.querySelectorAll("button")];
}

function buttonByLabel(label) {
  const wanted = label.toLowerCase();
  return buttons().find(button => clean(button.textContent).toLowerCase() === wanted);
}

function navigateTo(label) {
  const target = buttonByLabel(label);
  if (!target) return;
  closeMoreSheet();
  target.click();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeMoreSheet() {
  document.querySelector("[data-apex-more-sheet]")?.remove();
}

function openMoreSheet() {
  closeMoreSheet();
  const back = document.createElement("div");
  back.dataset.apexMoreSheet = "true";
  back.className = "apexMoreBack";
  back.innerHTML = `
    <section class="apexMoreSheet" role="dialog" aria-modal="true" aria-label="More Apex HQ tools">
      <header><div><span>APEX HQ</span><h2>More</h2></div><button type="button" data-close-more aria-label="Close">×</button></header>
      <div class="apexMoreGrid">
        ${SECONDARY_TABS.map(label => `<button type="button" data-apex-more-target="${label}"><strong>${label}</strong><span>Open ${label.toLowerCase()}</span></button>`).join("")}
      </div>
    </section>`;
  back.addEventListener("click", event => {
    if (event.target === back || event.target.closest("[data-close-more]")) {
      closeMoreSheet();
      return;
    }
    const target = event.target.closest("[data-apex-more-target]");
    if (target) navigateTo(target.dataset.apexMoreTarget);
  });
  document.body.appendChild(back);
}

// Use one delegated handler instead of binding a React-rendered button that can be
// replaced on every navigation/render. This makes More reliable on mobile.
document.addEventListener("click", event => {
  const button = event.target.closest?.("button");
  if (!button) return;
  if (clean(button.textContent).toLowerCase() !== "more") return;
  if (button.closest("[data-apex-more-sheet]")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openMoreSheet();
}, true);

function isCalendarPage() {
  const topTitle = document.querySelector(".top h1");
  return clean(topTitle?.textContent).toLowerCase() === "calendar" || Boolean(document.querySelector(".calendarSettings"));
}

function eventLabel(job) {
  return clean(job.customerName || job.title || job.packageName || "Booking");
}

function eventTime(job) {
  if (job.allDay) return "";
  return clean(job.bookingTime || job.startTime || "");
}

function sourceLabel(job) {
  return String(job.source || "").startsWith("google-calendar") || job.calendarImported ? "Google" : "Apex";
}

function eventKey(job) {
  if (sourceLabel(job) === "Google") {
    return `google:${clean(job.calendarId || job.sourceCalendarId)}:${clean(job.calendarEventId || job.sourceCalendarEventId || job.id)}`;
  }
  return `apex:${clean(job.id || job.jobId || `${job.bookingDate}:${job.bookingTime}:${eventLabel(job)}`)}`;
}

function allEvents() {
  const merged = new Map();
  // Firestore first so direct Google data can overwrite stale imported copies.
  for (const row of jobs) merged.set(eventKey(row), row);
  for (const row of googleEvents) merged.set(eventKey(row), row);
  return [...merged.values()];
}

function eventsFor(date) {
  return allEvents()
    .filter(job => clean(job.bookingDate) === date && !["Cancelled", "Archived"].includes(job.status))
    .sort((a, b) => eventTime(a).localeCompare(eventTime(b)));
}

function renderSelected(container) {
  const list = container.querySelector("[data-calendar-day-list]");
  if (!list) return;
  const date = selectedDate || isoDate(new Date());
  const rows = eventsFor(date);
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" });
  list.innerHTML = `<div class="apexDayHead"><strong>${dateLabel}</strong><span>${rows.length ? `${rows.length} item${rows.length === 1 ? "" : "s"}` : "Clear"}</span></div>` +
    (rows.length ? rows.map(job => `
      <article class="apexCalendarEvent ${sourceLabel(job).toLowerCase()}">
        <time>${eventTime(job) || "All day"}</time>
        <div><strong>${eventLabel(job)}</strong><span>${clean(job.address || job.packageName || job.vehicle || job.status || "Booking")}</span></div>
        <em>${sourceLabel(job)}</em>
      </article>`).join("") : `<div class="apexCalendarEmpty">No bookings or Google Calendar blocks on this day.</div>`);
}

function visibleRange() {
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  return {
    startDate: isoDate(new Date(year, month, 1)),
    endDate: isoDate(new Date(year, month + 1, 0))
  };
}

async function fetchLiveGoogleEvents({ force = false } = {}) {
  if (!isCalendarPage() || liveFetchInFlight) return;
  const range = visibleRange();
  const rangeKey = `${range.startDate}:${range.endDate}`;
  if (!force && rangeKey === lastLiveRange) return;
  liveFetchInFlight = true;
  try {
    const result = await getGoogleCalendarEvents(range);
    googleEvents = Array.isArray(result?.events) ? result.events : [];
    lastLiveRange = rangeKey;
    renderCalendar();
  } catch (error) {
    console.warn("Apex live Google Calendar feed unavailable", error);
  } finally {
    liveFetchInFlight = false;
  }
}

function renderCalendar() {
  const container = document.querySelector("[data-apex-month-calendar]");
  if (!container) return;
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const mondayOffset = (first.getDay() + 6) % 7;
  const totalCells = Math.ceil((mondayOffset + last.getDate()) / 7) * 7;
  const today = isoDate(new Date());
  const monthName = first.toLocaleDateString("en-NZ", { month: "long", year: "numeric" });

  let cells = "";
  for (let index = 0; index < totalCells; index++) {
    const day = index - mondayOffset + 1;
    if (day < 1 || day > last.getDate()) {
      cells += `<div class="apexCalCell muted"></div>`;
      continue;
    }
    const date = isoDate(new Date(year, month, day));
    const dayEvents = eventsFor(date);
    const apexCount = dayEvents.filter(job => sourceLabel(job) === "Apex").length;
    const googleCount = dayEvents.length - apexCount;
    cells += `<button type="button" class="apexCalCell${date === today ? " today" : ""}${date === selectedDate ? " selected" : ""}" data-apex-calendar-date="${date}">
      <b>${day}</b>
      <span class="apexCalDots">${apexCount ? `<i class="apexDot apex" title="${apexCount} Apex"></i>` : ""}${googleCount ? `<i class="apexDot google" title="${googleCount} Google"></i>` : ""}</span>
    </button>`;
  }

  container.innerHTML = `
    <section class="apexMonthPanel">
      <header class="apexMonthHead">
        <div><span>LIVE SCHEDULE</span><h2>${monthName}</h2></div>
        <div><button type="button" data-cal-prev aria-label="Previous month">←</button><button type="button" data-cal-today>Today</button><button type="button" data-cal-next aria-label="Next month">→</button></div>
      </header>
      <div class="apexCalWeek"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
      <div class="apexCalGrid">${cells}</div>
      <div class="apexCalendarLegend"><span><i class="apexDot apex"></i>Apex booking</span><span><i class="apexDot google"></i>Google block</span></div>
      <div data-calendar-day-list></div>
    </section>`;

  container.querySelector("[data-cal-prev]")?.addEventListener("click", () => {
    monthCursor = new Date(year, month - 1, 1);
    lastLiveRange = "";
    renderCalendar();
    fetchLiveGoogleEvents({ force: true });
  });
  container.querySelector("[data-cal-next]")?.addEventListener("click", () => {
    monthCursor = new Date(year, month + 1, 1);
    lastLiveRange = "";
    renderCalendar();
    fetchLiveGoogleEvents({ force: true });
  });
  container.querySelector("[data-cal-today]")?.addEventListener("click", () => {
    monthCursor = new Date();
    selectedDate = isoDate(new Date());
    lastLiveRange = "";
    renderCalendar();
    fetchLiveGoogleEvents({ force: true });
  });
  container.querySelectorAll("[data-apex-calendar-date]").forEach(button => button.addEventListener("click", () => {
    selectedDate = button.dataset.apexCalendarDate;
    renderCalendar();
  }));
  renderSelected(container);
}

async function opportunisticGoogleSync() {
  if (syncInFlight || !isCalendarPage()) return;
  syncInFlight = true;
  try {
    // Keep Firestore history in sync, but do not make the live Calendar UI depend on it.
    await importGoogleCalendarEvents({ daysBack: 30, daysForward: 365 });
  } catch (error) {
    console.warn("Apex Google Calendar history import unavailable", error);
  } finally {
    syncInFlight = false;
  }
}

function ensureCalendar() {
  if (!isCalendarPage()) {
    document.querySelector("[data-apex-month-calendar]")?.remove();
    googleEvents = [];
    lastLiveRange = "";
    return;
  }
  if (document.querySelector("[data-apex-month-calendar]")) return;
  const anchor = document.querySelector(".calendarSettings") || document.querySelector("main .empty") || document.querySelector(".workspace main");
  if (!anchor) return;
  const host = document.createElement("div");
  host.dataset.apexMonthCalendar = "true";
  if (anchor.classList?.contains("calendarSettings") || anchor.classList?.contains("empty")) anchor.parentElement?.insertBefore(host, anchor);
  else anchor.prepend(host);
  selectedDate ||= isoDate(new Date());
  renderCalendar();
  fetchLiveGoogleEvents({ force: true });
  opportunisticGoogleSync();
}

onSnapshot(collection(db, "jobs"), snapshot => {
  jobs = snapshot.docs.map(row => ({ id: row.id, ...row.data() }));
  renderCalendar();
}, () => undefined);

function refreshEnhancements() {
  ensureCalendar();
}

new MutationObserver(refreshEnhancements).observe(document.body, { childList: true, subtree: true });
window.addEventListener("popstate", refreshEnhancements);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshEnhancements();
    fetchLiveGoogleEvents({ force: true });
  }
});
refreshEnhancements();
