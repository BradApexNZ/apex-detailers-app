import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";

const OWNER_UIDS = (import.meta.env.VITE_APEX_OWNER_UIDS || "FqDrn1aPFHXUB5ogb2rN9D7mRG42")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

const state = {
  jobs: [],
  locks: [],
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" })
};

let stopJobs;
let stopLocks;

const dateKey = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const isCancelled = job => ["Archived", "Cancelled"].includes(job.status);
const jobsFor = date => state.jobs
  .filter(job => job.bookingDate === date && !isCancelled(job))
  .sort((a, b) => String(a.bookingTime || "").localeCompare(String(b.bookingTime || "")));
const locksFor = date => state.locks
  .filter(lock => lock.date === date && lock.source === "apex-hq")
  .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")));

function monthTitle() {
  return state.month.toLocaleDateString("en-NZ", { month: "long", year: "numeric" });
}

function calendarDays() {
  const year = state.month.getFullYear();
  const month = state.month.getMonth();
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function shareBookingLink() {
  const url = `${window.location.origin}/book`;
  if (navigator.share) {
    return navigator.share({ title: "Book Apex Detailers", text: "Request your Apex Detailers booking online.", url });
  }
  return navigator.clipboard.writeText(url).then(() => toast("Booking link copied."));
}

function toast(message) {
  document.querySelector("[data-apex-booking-toast]")?.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.dataset.apexBookingToast = "true";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3500);
}

async function blockTime(form) {
  const date = form.elements.date.value;
  const fullDay = form.elements.fullDay.checked;
  const startTime = fullDay ? "08:00" : form.elements.startTime.value;
  const endTime = fullDay ? "18:00" : form.elements.endTime.value;
  const reason = form.elements.reason.value.trim() || (fullDay ? "Day off" : "Unavailable");

  if (!date || !startTime || !endTime) throw new Error("Choose a date and time.");
  if (startTime >= endTime) throw new Error("The finish time must be after the start time.");

  await addDoc(collection(db, "bookingLocks"), {
    date,
    startTime,
    endTime,
    reason,
    status: "blocked",
    source: "apex-hq",
    fullDay,
    ownerUid: auth.currentUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  state.selectedDate = date;
  toast(fullDay ? "Day blocked from public bookings." : "Time blocked from public bookings.");
}

async function removeLock(id) {
  if (!window.confirm("Make this time available for public bookings again?")) return;
  await deleteDoc(doc(db, "bookingLocks", id));
  toast("Blocked time removed.");
}

function render() {
  const calendarPage = [...document.querySelectorAll("main")]
    .find(main => main.querySelector(".intro h2")?.textContent.trim() === "Schedule");
  if (!calendarPage) return;

  document.querySelectorAll("[data-apex-native-booking]").forEach(node => node.remove());

  const selectedJobs = jobsFor(state.selectedDate);
  const selectedLocks = locksFor(state.selectedDate);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });

  const section = document.createElement("section");
  section.className = "nativeBooking";
  section.dataset.apexNativeBooking = "true";
  section.innerHTML = `
    <div class="nativeBookingTop">
      <div>
        <span class="eyebrow">APEX BOOKING SYSTEM</span>
        <h3>Bookings calendar</h3>
        <p>Jobs and time off stored directly in Apex HQ. Google Calendar is not required.</p>
      </div>
      <div class="nativeBookingActions">
        <button type="button" data-share-booking>Share booking link</button>
        <a href="/book" target="_blank" rel="noopener">Open public page</a>
      </div>
    </div>
    <div class="nativeCalendarHeader">
      <button type="button" data-month-prev aria-label="Previous month">←</button>
      <strong>${escapeHtml(monthTitle())}</strong>
      <button type="button" data-month-next aria-label="Next month">→</button>
    </div>
    <div class="nativeWeekdays">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => `<span>${day}</span>`).join("")}</div>
    <div class="nativeCalendarGrid">
      ${calendarDays().map(date => {
        const key = dateKey(date);
        const jobs = jobsFor(key);
        const locks = locksFor(key);
        const outside = date.getMonth() !== state.month.getMonth();
        return `<button type="button" class="nativeDay ${outside ? "outside" : ""} ${key === today ? "today" : ""} ${key === state.selectedDate ? "selected" : ""}" data-date="${key}">
          <b>${date.getDate()}</b>
          <span>${jobs.length ? `${jobs.length} job${jobs.length === 1 ? "" : "s"}` : ""}</span>
          ${locks.length ? `<em>${locks.some(lock => lock.fullDay) ? "OFF" : "BLOCKED"}</em>` : ""}
        </button>`;
      }).join("")}
    </div>
    <div class="nativeBookingDetail">
      <div class="nativeDayAgenda">
        <span class="eyebrow">${escapeHtml(state.selectedDate)}</span>
        <h4>Day schedule</h4>
        ${selectedJobs.map(job => `<article><time>${escapeHtml(job.bookingTime || "Time TBC")}</time><div><b>${escapeHtml(job.customerName || "Customer")}</b><span>${escapeHtml(job.vehicle || job.packageName || "Detailing job")}</span></div></article>`).join("") || "<p class=\"muted\">No confirmed jobs on this date.</p>"}
        ${selectedLocks.map(lock => `<article class="blocked"><time>${escapeHtml(lock.startTime)}–${escapeHtml(lock.endTime)}</time><div><b>${escapeHtml(lock.reason || "Unavailable")}</b><span>Hidden from the public booking page</span></div><button type="button" data-remove-lock="${lock.id}">Remove</button></article>`).join("")}
      </div>
      <form class="nativeBlockForm">
        <span class="eyebrow">BLOCK AVAILABILITY</span>
        <h4>Book time off</h4>
        <label>Date<input name="date" type="date" value="${escapeHtml(state.selectedDate)}" required></label>
        <label class="nativeFullDay"><input name="fullDay" type="checkbox" checked> Block the full working day</label>
        <div class="nativeTimeFields">
          <label>From<input name="startTime" type="time" value="08:00"></label>
          <label>Until<input name="endTime" type="time" value="18:00"></label>
        </div>
        <label>Reason<input name="reason" placeholder="Day off, appointment, unavailable…"></label>
        <button type="submit">Block public bookings</button>
      </form>
    </div>`;

  calendarPage.querySelector(".intro")?.after(section);

  section.querySelector("[data-share-booking]")?.addEventListener("click", () => shareBookingLink().catch(() => toast("Could not share the link.")));
  section.querySelector("[data-month-prev]")?.addEventListener("click", () => {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
    render();
  });
  section.querySelector("[data-month-next]")?.addEventListener("click", () => {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
    render();
  });
  section.querySelectorAll("[data-date]").forEach(button => button.addEventListener("click", () => {
    state.selectedDate = button.dataset.date;
    render();
  }));
  section.querySelectorAll("[data-remove-lock]").forEach(button => button.addEventListener("click", () => {
    removeLock(button.dataset.removeLock).catch(error => toast(error.message || "Could not remove blocked time."));
  }));

  const form = section.querySelector(".nativeBlockForm");
  const fullDay = form.elements.fullDay;
  const timeFields = form.querySelector(".nativeTimeFields");
  const updateTimeVisibility = () => timeFields.hidden = fullDay.checked;
  fullDay.addEventListener("change", updateTimeVisibility);
  updateTimeVisibility();
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await blockTime(form);
      form.reset();
    } catch (error) {
      toast(error.message || "Could not block this time.");
    } finally {
      button.disabled = false;
    }
  });
}

function hideGoogleCalendarUi() {
  [...document.querySelectorAll(".settings > section")].forEach(section => {
    if (section.querySelector("h3")?.textContent.trim() === "Google Calendar") section.remove();
  });
  document.querySelectorAll(".agenda > button").forEach(button => {
    if (/sync/i.test(button.textContent)) button.remove();
  });
}

function wire() {
  hideGoogleCalendarUi();
  render();
}

const observer = new MutationObserver(wire);
observer.observe(document.documentElement, { childList: true, subtree: true });

onAuthStateChanged(auth, user => {
  stopJobs?.();
  stopLocks?.();
  if (!user || !OWNER_UIDS.includes(user.uid)) return;
  stopJobs = onSnapshot(collection(db, "jobs"), snapshot => {
    state.jobs = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    render();
  });
  stopLocks = onSnapshot(collection(db, "bookingLocks"), snapshot => {
    state.locks = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    render();
  });
});

wire();
