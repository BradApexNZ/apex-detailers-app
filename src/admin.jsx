import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { getMessaging, getToken, isSupported as messagingSupported } from "firebase/messaging";
import { app, auth, authPersistenceReady, db } from "./firebase";
import {
  approveBookingRequest,
  cancelBooking,
  declineBookingRequest,
  getCalendarLinkStatus,
  getGoogleCalendarEvents,
  registerOwnerDevice,
  startGoogleCalendarConnect
} from "./apex-api";
import { money } from "./booking-data";

// Owner app, three tabs: Home (today, tomorrow, the week ahead), Requests
// (approve/decline) and Calendar (month view of bookings, requests and the
// owner's own Google Calendar events). Runs independently of HQ.
const ownerUids = (
  import.meta.env.VITE_APEX_OWNER_UIDS || "fnc4G85CtmQVy0OooOzfOoSC9u22,FqDrn1aPFHXUB5ogb2rN9D7mRG42,maefd5cQ9qcIKSeU4b3yZKUL8UW2"
)
  .split(",")
  .map(v => v.trim())
  .filter(Boolean);

const ZONE = "Pacific/Auckland";
const dayKey = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString("en-CA", { timeZone: ZONE });
};
const prettyDate = dateStr => {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};
// Date strings are NZ calendar days (YYYY-MM-DD); do the arithmetic in UTC so
// DST changes never shift a day.
const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const mondayIndex = dateStr => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
};
const monthLabel = ym => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-NZ", { month: "long", year: "numeric", timeZone: "UTC" });
};
const shiftMonth = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const monthGrid = ym => {
  const first = `${ym}-01`;
  const start = addDays(first, -mondayIndex(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
};
const longDate = dateStr => {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
};
const INACTIVE = new Set(["cancelled", "declined", "deleted"]);
const byTime = (a, b) => `${a.bookingDate} ${a.bookingTime}`.localeCompare(`${b.bookingDate} ${b.bookingTime}`);
const vehicleOf = item => item.vehicle || [item.vehicleYear, item.vehicleMake, item.vehicleModel].filter(Boolean).join(" ");
const telOf = phone => `tel:${String(phone || "").replace(/\s/g, "")}`;
const mapsOf = item => `https://maps.google.com/?q=${encodeURIComponent([item.address, item.area].filter(Boolean).join(", "))}`;

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/apex-admin-sw.js", { scope: "/admin", updateViaCache: "none" })
      .catch(error => console.warn("Apex Admin install support could not start.", error));
  });
}

// Offers "Install app" where the browser supports it (Android/desktop Chrome),
// and Add to Home Screen instructions on iPhone, which has no install prompt.
function useInstall(notify) {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone);
  useEffect(() => {
    const onPrompt = event => {
      event.preventDefault();
      setPrompt(event);
    };
    const onInstalled = () => {
      setPrompt(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const canOffer = !installed && (Boolean(prompt) || isIos());
  const install = async () => {
    if (prompt) {
      prompt.prompt();
      await prompt.userChoice.catch(() => undefined);
      setPrompt(null);
    } else if (isIos()) {
      notify("In Safari: tap Share, then Add to Home Screen.");
    }
  };
  return { canOffer, install };
}

// Web push public key (Firebase console > Project settings > Cloud Messaging >
// Web Push certificates). Public by design; the private half stays with Firebase.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "BJMkP2xQs1EQywETeYkzY8Po_uzW5MmgZGUUGHMybI82y0jQSS6QMTHOG5AckzUMi35__CDztdPFwbzr3w_ZWFs";

// Booking-request notifications. iPhone only allows web push from the installed
// home-screen app, and permission must be asked from a tap.
function useNotifications(owner, notify) {
  const [status, setStatus] = useState("checking");
  const register = async test => {
    const registration =
      (await navigator.serviceWorker.getRegistration("/admin")) ||
      (await navigator.serviceWorker.register("/apex-admin-sw.js", { scope: "/admin", updateViaCache: "none" }));
    await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) throw new Error("No notification token.");
    await registerOwnerDevice({ token, userAgent: navigator.userAgent, test });
  };
  useEffect(() => {
    if (!owner) return;
    (async () => {
      const supported = "Notification" in window && "serviceWorker" in navigator && (await messagingSupported().catch(() => false));
      if (!supported) return setStatus(isIos() && !isStandalone() ? "install-first" : "unsupported");
      if (Notification.permission === "granted") {
        setStatus("on");
        // Refresh the token quietly each launch so it never goes stale.
        register(false).catch(err => console.warn("Notification token refresh failed", err));
      } else setStatus(Notification.permission === "denied" ? "blocked" : "off");
    })();
  }, [owner]);
  const enable = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setStatus(permission === "denied" ? "blocked" : "off");
      await register(true);
      setStatus("on");
      notify("Notifications on. A test one is on its way.");
    } catch (err) {
      console.error("Enable notifications failed", err);
      notify(err.message || "Could not turn on notifications.");
    }
  };
  return { status, enable };
}

function NotifyCard({ status, onEnable }) {
  if (status === "on" || status === "checking" || status === "unsupported") return null;
  const copy = {
    off: ["Turn on booking notifications", "Get a buzz on this phone the moment someone requests a booking."],
    blocked: ["Notifications are blocked", "Turn them on in your phone's Settings > Notifications > Apex Admin."],
    "install-first": ["Want booking notifications?", "Add Apex Admin to your Home Screen first (Share > Add to Home Screen), then open it from there."]
  }[status];
  return (
    <section className="adminCard adminCalendar is-bad">
      <div>
        <strong>{copy[0]}</strong>
        <span>{copy[1]}</span>
      </div>
      {status === "off" && (
        <button type="button" className="primary" onClick={onEnable}>
          Turn on
        </button>
      )}
    </section>
  );
}

function Login({ error, busy, onGoogle, onEmail }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <main className="adminLogin">
      <img src="/apex-icon.svg" alt="" className="adminMark" />
      <h1>Apex Admin</h1>
      <p>Approve bookings and see what's on.</p>
      <button type="button" className="primary" disabled={busy} onClick={onGoogle}>
        Sign in with Google
      </button>
      <form
        onSubmit={event => {
          event.preventDefault();
          onEmail(email, password);
        }}
      >
        <input type="email" autoComplete="username" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button type="submit" className="secondary" disabled={busy || !email || !password}>
          Sign in with email
        </button>
      </form>
      {error && <div className="adminError">{error}</div>}
    </main>
  );
}

function RequestCard({ item, busy, onApprove, onDecline }) {
  const addons = Array.isArray(item.addonNames) ? item.addonNames : [];
  // Two-tap decline instead of window.confirm, which some in-app browsers suppress.
  const [confirmDecline, setConfirmDecline] = useState(false);
  useEffect(() => {
    if (!confirmDecline) return undefined;
    const timer = setTimeout(() => setConfirmDecline(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmDecline]);
  return (
    <article className="adminCard adminCard--pending">
      <header>
        <div>
          <strong>{item.customerName}</strong>
          <span>
            {prettyDate(item.bookingDate)} · {item.bookingTime}
            {item.bookingEndTime ? `–${item.bookingEndTime}` : ""}
          </span>
        </div>
        <b>{item.estimatedFromPrice != null ? money(item.estimatedFromPrice) : "POA"}</b>
      </header>
      <dl>
        {item.companyName && (
          <>
            <dt>Company</dt>
            <dd>{item.companyName}</dd>
          </>
        )}
        <dt>Service</dt>
        <dd>
          {item.serviceName}
          {addons.length > 0 && <small> + {addons.join(", ")}</small>}
        </dd>
        <dt>Vehicle</dt>
        <dd>
          {vehicleOf(item) || "—"}
          {item.rego ? ` (${item.rego})` : ""}
        </dd>
        <dt>Where</dt>
        <dd>
          <a href={mapsOf(item)} target="_blank" rel="noreferrer">
            {item.address}
            {item.area ? `, ${item.area}` : ""}
          </a>
        </dd>
        <dt>Contact</dt>
        <dd>
          <a href={telOf(item.phone)}>{item.phone}</a> · <a href={`mailto:${item.email}`}>{item.email}</a>
        </dd>
        {item.notes && (
          <>
            <dt>Notes</dt>
            <dd>{item.notes}</dd>
          </>
        )}
      </dl>
      <div className="adminActions">
        <button
          type="button"
          className="danger"
          disabled={busy}
          onClick={() => {
            if (!confirmDecline) return setConfirmDecline(true);
            setConfirmDecline(false);
            onDecline(item);
          }}
        >
          {confirmDecline ? "Tap again to decline" : "Decline"}
        </button>
        <button type="button" className="primary" disabled={busy} onClick={() => onApprove(item)}>
          Approve
        </button>
      </div>
    </article>
  );
}

function JobRow({ job, busy, onCancel, onOpen, showDate = false }) {
  const addons = Array.isArray(job.addonNames) ? job.addonNames : [];
  const [confirmCancel, setConfirmCancel] = useState(false);
  useEffect(() => {
    if (!confirmCancel) return undefined;
    const timer = setTimeout(() => setConfirmCancel(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmCancel]);
  return (
    <article
      className="adminCard adminJob is-tappable"
      onClick={event => {
        if (onOpen && !event.target.closest("a, button")) onOpen({ kind: "job", ...job });
      }}
    >
      <time>
        {showDate && <small>{prettyDate(job.bookingDate)}</small>}
        {job.bookingTime || "—"}
        {job.bookingEndTime && <small>{job.bookingEndTime}</small>}
      </time>
      <div>
        <strong>{job.customerName || "Customer"}</strong>
        <span>
          {job.packageName || "Job"}
          {addons.length > 0 ? ` + ${addons.join(", ")}` : ""}
        </span>
        <span>
          {vehicleOf(job)}
          {job.rego ? ` · ${job.rego}` : ""}
        </span>
        <div className="adminJobLinks">
          {job.address && (
            <a href={mapsOf(job)} target="_blank" rel="noreferrer">
              Map
            </a>
          )}
          {job.phone && <a href={telOf(job.phone)}>Call</a>}
          <button
            type="button"
            className="adminJobCancel"
            disabled={busy}
            onClick={() => {
              if (!confirmCancel) return setConfirmCancel(true);
              setConfirmCancel(false);
              onCancel(job);
            }}
          >
            {confirmCancel ? "Tap again to cancel" : "Cancel"}
          </button>
        </div>
      </div>
      {job.total != null && <b>{money(job.total)}</b>}
    </article>
  );
}

// Someone else's time in the owner's Google Calendar (e.g. cooking class).
function EventRow({ event, onOpen }) {
  return (
    <button type="button" className="adminEvent" onClick={() => onOpen({ kind: "event", ...event })}>
      <time>{event.allDay ? "All day" : `${event.bookingTime}${event.bookingEndTime ? `–${event.bookingEndTime}` : ""}`}</time>
      <span>{event.title}</span>
    </button>
  );
}

function WeekStrip({ start, markers, onPick }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <section className="adminSection">
      <h2>This week</h2>
      <div className="adminWeek">
        {days.map(day => {
          const mark = markers[day] || {};
          return (
            <button type="button" key={day} className={day === start ? "is-today" : ""} onClick={() => onPick(day)}>
              <small>{prettyDate(day).split(" ")[0]}</small>
              <b>{Number(day.slice(8))}</b>
              <Dots mark={mark} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Dots({ mark }) {
  return (
    <i className="adminDots">
      {mark.jobs > 0 && <em className="dot-job" />}
      {mark.requests > 0 && <em className="dot-request" />}
      {mark.events > 0 && <em className="dot-event" />}
    </i>
  );
}

function MonthCalendar({ month, today, selected, markers, onMonth, onSelect }) {
  const days = monthGrid(month);
  return (
    <section className="adminCard adminMonth">
      <header>
        <button type="button" aria-label="Previous month" onClick={() => onMonth(shiftMonth(month, -1))}>
          ‹
        </button>
        <strong>{monthLabel(month)}</strong>
        <button type="button" aria-label="Next month" onClick={() => onMonth(shiftMonth(month, 1))}>
          ›
        </button>
      </header>
      <div className="adminMonthGrid">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="adminMonthHead">
            {d}
          </span>
        ))}
        {days.map(day => (
          <button
            type="button"
            key={day}
            className={[
              day.slice(0, 7) !== month && "is-out",
              day === today && "is-today",
              day === selected && "is-selected",
              day < today && "is-past"
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelect(day)}
          >
            <b>{Number(day.slice(8))}</b>
            <Dots mark={markers[day] || {}} />
          </button>
        ))}
      </div>
      <footer>
        <span>
          <em className="dot-job" /> Booking
        </span>
        <span>
          <em className="dot-request" /> Request
        </span>
        <span>
          <em className="dot-event" /> Your calendar
        </span>
      </footer>
    </section>
  );
}

function DayList({ jobs, requests, events, busy, onCancel, onOpen, empty }) {
  const count = jobs.length + requests.length + events.length;
  if (!count) return <p className="adminEmpty">{empty}</p>;
  return (
    <>
      {requests.map(item => (
        <button type="button" key={item.id} className="adminEvent is-request" onClick={() => onOpen({ kind: "request", ...item })}>
          <time>{item.bookingTime}</time>
          <span>
            Request · {item.customerName} · {item.serviceName}
          </span>
        </button>
      ))}
      {jobs.map(job => (
        <JobRow key={job.id} job={job} busy={busy} onCancel={onCancel} onOpen={onOpen} />
      ))}
      {events.map(event => (
        <EventRow key={event.id} event={event} onOpen={onOpen} />
      ))}
    </>
  );
}

// Full details for anything tapped: a booking, a request or a Google event.
function DetailSheet({ item, busy, onClose, onCancel, onApprove, onDecline }) {
  const [armed, setArmed] = useState("");
  useEffect(() => {
    const onKey = event => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(""), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  if (!item) return null;
  const addons = Array.isArray(item.addonNames) ? item.addonNames : [];
  const when = `${longDate(item.bookingDate)}${
    item.allDay ? " · all day" : item.bookingTime ? ` · ${item.bookingTime}${item.bookingEndTime ? `–${item.bookingEndTime}` : ""}` : ""
  }`;
  const price = item.kind === "job" ? item.total : item.estimatedFromPrice;
  const twoTap = (key, run) => () => {
    if (armed !== key) return setArmed(key);
    setArmed("");
    run();
  };
  return (
    <div className="adminSheetBackdrop" onClick={onClose}>
      <section className="adminSheet" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
        <span className="eyebrow">
          {item.kind === "event" ? item.calendarName || "Your calendar" : item.kind === "request" ? "Booking request" : "Booking"}
        </span>
        <h2>{item.kind === "event" ? item.title : item.customerName || "Customer"}</h2>
        <p className="adminSheetWhen">{when}</p>
        <dl>
          {item.kind !== "event" && (
            <>
              {item.companyName && (
                <>
                  <dt>Company</dt>
                  <dd>{item.companyName}</dd>
                </>
              )}
              <dt>Service</dt>
              <dd>
                {item.packageName || item.serviceName}
                {addons.length > 0 && <small> + {addons.join(", ")}</small>}
              </dd>
              {price != null && (
                <>
                  <dt>Price</dt>
                  <dd>{item.kind === "job" ? money(price) : `from ${money(price)}`}</dd>
                </>
              )}
              <dt>Vehicle</dt>
              <dd>
                {vehicleOf(item) || "—"}
                {item.rego ? ` (${item.rego})` : ""}
              </dd>
              {item.phone && (
                <>
                  <dt>Phone</dt>
                  <dd>
                    <a href={telOf(item.phone)}>{item.phone}</a>
                  </dd>
                </>
              )}
              {item.email && (
                <>
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${item.email}`}>{item.email}</a>
                  </dd>
                </>
              )}
            </>
          )}
          {item.address && (
            <>
              <dt>Where</dt>
              <dd>
                <a href={mapsOf(item)} target="_blank" rel="noreferrer">
                  {item.address}
                  {item.area ? `, ${item.area}` : ""}
                </a>
              </dd>
            </>
          )}
          {item.notes && (
            <>
              <dt>Notes</dt>
              <dd>{item.notes}</dd>
            </>
          )}
        </dl>
        <div className="adminSheetActions">
          {item.address && (
            <a className="secondary" href={mapsOf(item)} target="_blank" rel="noreferrer">
              Directions
            </a>
          )}
          {item.phone && (
            <a className="secondary" href={telOf(item.phone)}>
              Call
            </a>
          )}
          {item.kind === "job" && (
            <button type="button" className="danger" disabled={busy} onClick={twoTap("cancel", () => onCancel(item).then(onClose))}>
              {armed === "cancel" ? "Tap again to cancel" : "Cancel booking"}
            </button>
          )}
          {item.kind === "request" && (
            <>
              <button type="button" className="danger" disabled={busy} onClick={twoTap("decline", () => onDecline(item).then(onClose))}>
                {armed === "decline" ? "Tap again to decline" : "Decline"}
              </button>
              <button type="button" className="primary" disabled={busy} onClick={() => onApprove(item).then(onClose)}>
                Approve
              </button>
            </>
          )}
        </div>
        <button type="button" className="adminSheetClose" onClick={onClose}>
          Close
        </button>
      </section>
    </div>
  );
}

// Everything needed to raise the invoice in Hnry for a job, with one-tap copy.
function HnryCard({ job, notify }) {
  const addons = Array.isArray(job.addonNames) ? job.addonNames : [];
  const rows = [
    ["Full name", job.customerName],
    ["Company", job.companyName],
    ["Email", job.email],
    ["Phone", job.phone],
    ["Address", [job.address, job.area].filter(Boolean).join(", ")],
    ["Service", `${job.packageName || "Detail"}${addons.length ? ` + ${addons.join(", ")}` : ""}`],
    ["Amount", job.total != null ? money(job.total) : ""]
  ].filter(([, value]) => value);
  const copy = async (label, value) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label} copied.`);
    } catch {
      notify("Couldn't copy — press and hold to select instead.");
    }
  };
  return (
    <article className="adminCard adminHnry">
      <header>
        <strong>{job.customerName}</strong>
        <button type="button" className="secondary" onClick={() => copy("Invoice details", rows.map(([k, v]) => `${k}: ${v}`).join("\n"))}>
          Copy all
        </button>
      </header>
      <dl>
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt>{label}</dt>
            <dd>
              <span>{value}</span>
              <button type="button" onClick={() => copy(label, value)} aria-label={`Copy ${label}`}>
                Copy
              </button>
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </article>
  );
}

function TabBar({ tab, onTab, requestCount }) {
  const tabs = [
    ["home", "Home"],
    ["requests", "Requests"],
    ["calendar", "Calendar"]
  ];
  return (
    <nav className="adminTabs" aria-label="Sections">
      {tabs.map(([key, label]) => (
        <button type="button" key={key} className={tab === key ? "is-active" : ""} onClick={() => onTab(key)}>
          {label}
          {key === "requests" && requestCount > 0 && <em>{requestCount}</em>}
        </button>
      ))}
    </nav>
  );
}

// Bookings reach Google Calendar and customer emails send through one Google
// connection (the bookings@ account). This shows whether it's working and lets
// the owner reconnect without HQ.
function CalendarLink({ health, busy, onConnect }) {
  if (!health) return null;
  const ok = health.connected && health.healthy;
  return (
    <section className={`adminCard adminCalendar ${ok ? "is-ok" : "is-bad"}`}>
      <div>
        <strong>{ok ? "Google Calendar & email connected" : "Google Calendar & email not connected"}</strong>
        <span>
          {ok
            ? `Bookings sync to ${health.email}. Your calendar events block those times online.`
            : "New bookings won't reach your calendar and emails won't send. Connect as bookings@apexdetailers.co.nz."}
        </span>
      </div>
      <button type="button" className={ok ? "secondary" : "primary"} disabled={busy} onClick={onConnect}>
        {ok ? "Reconnect" : "Connect"}
      </button>
    </section>
  );
}

function Section({ title, count, empty, children }) {
  return (
    <section className="adminSection">
      <h2>
        {title}
        {count > 0 && <em>{count}</em>}
      </h2>
      {count ? children : <p className="adminEmpty">{empty}</p>}
    </section>
  );
}

function Admin() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [requests, setRequests] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [dataError, setDataError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [calendarHealth, setCalendarHealth] = useState(null);
  const [tab, setTabState] = useState(() => (["requests", "calendar"].includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : "home"));
  const [month, setMonth] = useState(() => dayKey(0).slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(() => dayKey(0));
  const [monthJobs, setMonthJobs] = useState([]);
  const [events, setEvents] = useState([]);
  const [eventsNote, setEventsNote] = useState("");
  const [sheet, setSheet] = useState(null);
  const owner = Boolean(user && ownerUids.includes(user.uid));
  const { canOffer: canInstall, install } = useInstall(message => {
    setToast(message);
    setTimeout(() => setToast(""), 6000);
  });
  const today = dayKey(0);
  const tomorrow = dayKey(1);
  const horizon = dayKey(14);
  const grid = useMemo(() => monthGrid(month), [month]);
  const gridStart = grid[0];
  const gridEnd = grid[grid.length - 1];

  const setTab = next => {
    setTabState(next);
    window.history.replaceState(null, "", next === "home" ? window.location.pathname : `#${next}`);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    // A notification tap (or anything else) that changes the hash switches tab.
    const onHash = () => {
      const next = window.location.hash.slice(1);
      if (["home", "requests", "calendar"].includes(next)) setTabState(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, next => {
        if (next && !ownerUids.includes(next.uid)) {
          signOut(auth);
          setAuthError("That account is not authorised for Apex Admin.");
          setUser(null);
        } else setUser(next);
        setReady(true);
      }),
    []
  );

  useEffect(() => {
    if (!owner) return;
    const fail = label => err => {
      console.error(`Apex Admin ${label} listener failed`, err);
      setDataError(`Could not load ${label}. Check your connection and refresh.`);
    };
    const stops = [
      onSnapshot(
        query(collection(db, "bookingRequests"), where("status", "==", "pending")),
        s => setRequests(s.docs.map(d => ({ id: d.id, ...d.data() }))),
        fail("booking requests")
      ),
      onSnapshot(
        query(collection(db, "jobs"), where("bookingDate", ">=", today), where("bookingDate", "<=", horizon)),
        s => setJobs(s.docs.map(d => ({ id: d.id, ...d.data() }))),
        fail("jobs")
      )
    ];
    return () => stops.forEach(stop => stop());
  }, [owner, today, horizon]);

  useEffect(() => {
    if (!owner) return undefined;
    return onSnapshot(
      query(collection(db, "jobs"), where("bookingDate", ">=", gridStart), where("bookingDate", "<=", gridEnd)),
      s => setMonthJobs(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error("Apex Admin month listener failed", err)
    );
  }, [owner, gridStart, gridEnd]);

  // The owner's own Google Calendar events (cooking class, appointments...),
  // read live. Covers the visible month plus the coming week for Home.
  const eventsFrom = gridStart < today ? gridStart : today;
  const eventsTo = gridEnd > addDays(today, 7) ? gridEnd : addDays(today, 7);
  useEffect(() => {
    if (!owner) return undefined;
    let stale = false;
    getGoogleCalendarEvents({ startDate: eventsFrom, endDate: eventsTo })
      .then(result => {
        if (stale) return;
        setEvents(Array.isArray(result?.events) ? result.events : []);
        setEventsNote(result?.degraded ? "Showing your calendar as busy blocks only." : "");
      })
      .catch(err => {
        if (stale) return;
        console.warn("Google Calendar events unavailable", err);
        setEventsNote("Couldn't load your Google Calendar events right now.");
      });
    return () => {
      stale = true;
    };
  }, [owner, eventsFrom, eventsTo]);

  useEffect(() => {
    if (!owner) return;
    if (new URLSearchParams(window.location.search).get("google") === "connected") {
      window.history.replaceState(null, "", window.location.pathname);
      setToast("Google Calendar connected.");
      setTimeout(() => setToast(""), 4000);
    }
    getCalendarLinkStatus()
      .then(setCalendarHealth)
      .catch(err => setCalendarHealth({ connected: false, healthy: false, error: err.message }));
  }, [owner]);

  const pending = useMemo(() => [...requests].sort(byTime), [requests]);
  const active = useMemo(
    () => jobs.filter(job => job.mode !== "calendar-block" && !INACTIVE.has(String(job.status || "").toLowerCase())).sort(byTime),
    [jobs]
  );
  const monthActive = useMemo(
    () => monthJobs.filter(job => job.mode !== "calendar-block" && !INACTIVE.has(String(job.status || "").toLowerCase())).sort(byTime),
    [monthJobs]
  );
  const allJobs = useMemo(() => {
    const byId = new Map([...monthActive, ...active].map(job => [job.id, job]));
    return [...byId.values()].sort(byTime);
  }, [monthActive, active]);
  const sortedEvents = useMemo(() => [...events].sort((a, b) => `${a.bookingDate} ${a.allDay ? "" : a.bookingTime}`.localeCompare(`${b.bookingDate} ${b.allDay ? "" : b.bookingTime}`)), [events]);
  const markers = useMemo(() => {
    const out = {};
    const bump = (day, key) => {
      if (!day) return;
      out[day] = out[day] || { jobs: 0, requests: 0, events: 0 };
      out[day][key] += 1;
    };
    allJobs.forEach(job => bump(job.bookingDate, "jobs"));
    pending.forEach(item => bump(item.bookingDate, "requests"));
    events.forEach(event => bump(event.bookingDate, "events"));
    return out;
  }, [allJobs, pending, events]);
  const dayOf = day => ({
    jobs: allJobs.filter(job => job.bookingDate === day),
    requests: pending.filter(item => item.bookingDate === day),
    events: sortedEvents.filter(event => event.bookingDate === day)
  });
  const pickDay = day => {
    setSelectedDay(day);
    setMonth(day.slice(0, 7));
    setTab("calendar");
  };

  const notify = message => {
    setToast(message);
    setTimeout(() => setToast(""), 4000);
  };
  const notifications = useNotifications(owner, notify);

  async function withAuth(run) {
    setAuthBusy(true);
    setAuthError("");
    try {
      await authPersistenceReady;
      await run();
    } catch (err) {
      setAuthError(err?.code === "auth/popup-closed-by-user" ? "" : "Sign-in failed. Try again.");
    }
    setAuthBusy(false);
  }

  async function approve(item) {
    setBusy(true);
    try {
      await approveBookingRequest({ requestId: item.id });
      notify(`${item.customerName} confirmed. Calendar updated and email sent.`);
    } catch (err) {
      notify(err.message || "Could not approve booking.");
    }
    setBusy(false);
  }

  async function connectCalendar() {
    setBusy(true);
    try {
      const { url } = await startGoogleCalendarConnect();
      window.location.assign(url);
    } catch (err) {
      notify(err.message || "Could not start Google connection.");
      setBusy(false);
    }
  }

  async function cancel(job) {
    setBusy(true);
    try {
      const result = await cancelBooking({ jobId: job.id });
      notify(result?.emailed ? `${job.customerName} cancelled and emailed. Slot released.` : `${job.customerName} cancelled. Slot released.`);
    } catch (err) {
      notify(err.message || "Could not cancel booking.");
    }
    setBusy(false);
  }

  async function decline(item) {
    setBusy(true);
    try {
      await declineBookingRequest({ requestId: item.id });
      notify("Request declined and slot released.");
    } catch (err) {
      notify(err.message || "Could not decline request.");
    }
    setBusy(false);
  }

  if (!ready) return <main className="adminLogin">Loading…</main>;
  if (!owner)
    return (
      <Login
        error={authError}
        busy={authBusy}
        onGoogle={() => withAuth(() => signInWithPopup(auth, new GoogleAuthProvider()))}
        onEmail={(email, password) => withAuth(() => signInWithEmailAndPassword(auth, email, password))}
      />
    );

  return (
    <main className="adminPage">
      <header className="adminTop">
        <div>
          <span className="eyebrow">APEX ADMIN</span>
          <h1>{new Date().toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", timeZone: ZONE })}</h1>
        </div>
        <nav>
          {canInstall && (
            <button type="button" className="adminInstall" onClick={install}>
              Install app
            </button>
          )}
          <button type="button" onClick={() => signOut(auth)}>
            Sign out
          </button>
        </nav>
      </header>

      {dataError && <div className="adminError">{dataError}</div>}

      {tab === "home" && (
        <>
          <NotifyCard status={notifications.status} onEnable={notifications.enable} />
          <CalendarLink health={calendarHealth} busy={busy} onConnect={connectCalendar} />

          {pending.length > 0 && (
            <button type="button" className="adminCard adminNudge" onClick={() => setTab("requests")}>
              <strong>
                {pending.length} booking request{pending.length === 1 ? "" : "s"} waiting
              </strong>
              <span>Tap to review →</span>
            </button>
          )}

          <section className="adminSection">
            <h2>
              Today
              {dayOf(today).jobs.length > 0 && <em>{dayOf(today).jobs.length}</em>}
            </h2>
            <DayList {...dayOf(today)} busy={busy} onCancel={cancel} onOpen={setSheet} empty="Nothing on today." />
          </section>

          {dayOf(today).jobs.length > 0 && (
            <section className="adminSection">
              <h2>Invoice details for Hnry</h2>
              {dayOf(today).jobs.map(job => (
                <HnryCard key={job.id} job={job} notify={notify} />
              ))}
            </section>
          )}

          <section className="adminSection">
            <h2>
              Tomorrow
              {dayOf(tomorrow).jobs.length > 0 && <em>{dayOf(tomorrow).jobs.length}</em>}
            </h2>
            <DayList {...dayOf(tomorrow)} busy={busy} onCancel={cancel} onOpen={setSheet} empty="Nothing on tomorrow." />
          </section>

          <WeekStrip start={today} markers={markers} onPick={pickDay} />
        </>
      )}

      {tab === "requests" && (
        <Section title="Needs approval" count={pending.length} empty="No requests waiting. New ones will buzz your phone.">
          {pending.map(item => (
            <RequestCard key={item.id} item={item} busy={busy} onApprove={approve} onDecline={decline} />
          ))}
        </Section>
      )}

      {tab === "calendar" && (
        <>
          <MonthCalendar
            month={month}
            today={today}
            selected={selectedDay}
            markers={markers}
            onMonth={setMonth}
            onSelect={setSelectedDay}
          />
          {eventsNote && <p className="adminNote">{eventsNote}</p>}
          <section className="adminSection">
            <h2>{selectedDay === today ? "Today" : selectedDay === tomorrow ? "Tomorrow" : longDate(selectedDay)}</h2>
            <DayList
              {...dayOf(selectedDay)}
              busy={busy}
              onCancel={cancel}
              onOpen={setSheet}
              empty={selectedDay < today ? "Nothing was booked." : "Nothing on — free for bookings."}
            />
          </section>
        </>
      )}

      <DetailSheet
        key={sheet ? `${sheet.kind}:${sheet.id}` : "none"}
        item={sheet}
        busy={busy}
        onClose={() => setSheet(null)}
        onCancel={cancel}
        onApprove={approve}
        onDecline={decline}
      />

      <TabBar tab={tab} onTab={setTab} requestCount={pending.length} />

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Admin />);
