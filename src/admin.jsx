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
import { RELOCK_AFTER_MS, checkPin, clearPin, hasPin, savePin } from "./admin-lock";

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
// Midnight-to-midnight events (e.g. a whole-day block) read as "All day".
const isAllDay = item => item.allDay || (item.bookingTime === "00:00" && (!item.bookingEndTime || item.bookingEndTime === "00:00"));
const timeRange = item => (isAllDay(item) ? "All day" : `${item.bookingTime || ""}${item.bookingEndTime ? `–${item.bookingEndTime}` : ""}`);
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
  const [useEmail, setUseEmail] = useState(false);
  return (
    <main className="adminLock adminSignIn">
      <img src="/apex-icon-192.png" alt="" className="adminLockMark" />
      <h1>Apex Admin</h1>
      <p>Sign in to manage your bookings.</p>
      {!useEmail ? (
        <>
          <button type="button" className="primary" disabled={busy} onClick={onGoogle}>
            Continue with Google
          </button>
          <button type="button" className="adminLockLink" onClick={() => setUseEmail(true)}>
            Sign in with email instead
          </button>
        </>
      ) : (
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
          <button type="submit" className="primary" disabled={busy || !email || !password}>
            Sign in
          </button>
          <button type="button" className="adminLockLink" onClick={() => setUseEmail(false)}>
            Back
          </button>
        </form>
      )}
      {error && <div className="adminError">{error}</div>}
      <small className="adminSignInNote">After signing in you'll set a 4-digit PIN for this phone.</small>
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
      <time>{timeRange(event)}</time>
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
  const when = `${longDate(item.bookingDate)}${item.bookingTime || item.allDay ? ` · ${timeRange(item)}` : ""}`;
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
          {item.kind === "event" ? "Your calendar" : item.kind === "request" ? "Booking request" : "Booking"}
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
// connection (the bookings@ account). A small pill shows it's healthy; tapping it
// opens the account sheet (reconnect, change PIN, sign out).
function SyncPill({ health, onOpen }) {
  const state = !health ? "checking" : health.connected && health.healthy ? "ok" : "bad";
  return (
    <button type="button" className={`adminPill is-${state}`} onClick={onOpen}>
      <i />
      {state === "ok" ? "Synced" : state === "bad" ? "Reconnect" : "Checking"}
    </button>
  );
}

function AccountSheet({ user, health, notifyStatus, onEnableNotify, busy, onConnect, onChangePin, onSignOut, onClose, canInstall, onInstall }) {
  const ok = health && health.connected && health.healthy;
  return (
    <div className="adminSheetBackdrop" onClick={onClose}>
      <section className="adminSheet" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
        <span className="eyebrow">Account</span>
        <h2>{user?.displayName || "Apex Admin"}</h2>
        <p className="adminSheetWhen">{user?.email}</p>
        <dl>
          <dt>Calendar</dt>
          <dd>
            {!health
              ? "Checking…"
              : ok
                ? `Synced with ${health.email}. Bookings go into your Google Calendar and your events block those times online.`
                : "Not connected — bookings won't reach your calendar and emails won't send. Reconnect as bookings@apexdetailers.co.nz."}
          </dd>
          <dt>Alerts</dt>
          <dd>
            {notifyStatus === "on"
              ? "On — this phone buzzes for new booking requests."
              : notifyStatus === "blocked"
                ? "Blocked — turn on in Settings > Notifications > Apex Admin."
                : notifyStatus === "install-first"
                  ? "Add Apex Admin to your Home Screen first."
                  : "Off."}
          </dd>
        </dl>
        <div className="adminSheetActions">
          <button type="button" className={ok ? "secondary" : "primary"} disabled={busy} onClick={onConnect}>
            {ok ? "Reconnect Google" : "Connect Google"}
          </button>
          {notifyStatus === "off" && (
            <button type="button" className="primary" onClick={onEnableNotify}>
              Turn on alerts
            </button>
          )}
          {canInstall && (
            <button type="button" className="secondary" onClick={onInstall}>
              Install app
            </button>
          )}
          <button type="button" className="secondary" onClick={onChangePin}>
            Change PIN
          </button>
          <button type="button" className="danger" onClick={onSignOut}>
            Sign out
          </button>
        </div>
        <button type="button" className="adminSheetClose" onClick={onClose}>
          Close
        </button>
      </section>
    </div>
  );
}

function PinDots({ filled, shake }) {
  return (
    <div className={`adminPinDots ${shake ? "is-shake" : ""}`} aria-hidden="true">
      {[0, 1, 2, 3].map(i => (
        <i key={i} className={i < filled ? "is-on" : ""} />
      ))}
    </div>
  );
}

function PinPad({ onDigit, onBack, disabled }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
  return (
    <div className="adminPinPad">
      {keys.map((key, i) =>
        key === "" ? (
          <span key={i} />
        ) : key === "back" ? (
          <button key={i} type="button" className="is-back" onClick={onBack} disabled={disabled} aria-label="Delete">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 4H8l-6 8 6 8h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z" strokeLinejoin="round" />
              <path d="M18 9l-6 6M12 9l6 6" strokeLinecap="round" />
            </svg>
          </button>
        ) : (
          <button key={i} type="button" onClick={() => onDigit(key)} disabled={disabled}>
            {key}
          </button>
        )
      )}
    </div>
  );
}

// mode "setup": choose + confirm a PIN. mode "unlock": enter it.
function PinScreen({ mode, user, onDone, onSignOut }) {
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState("");
  const [message, setMessage] = useState("");
  const [shake, setShake] = useState(false);
  const [working, setWorking] = useState(false);
  const firstName = (user?.displayName || "").split(" ")[0];
  const stage = mode === "setup" ? (first ? "confirm" : "choose") : "unlock";
  const title = stage === "choose" ? "Create your PIN" : stage === "confirm" ? "Confirm your PIN" : `Welcome back${firstName ? `, ${firstName}` : ""}`;
  const hint =
    stage === "choose" ? "You'll use these 4 digits to open Apex Admin." : stage === "confirm" ? "Enter it once more." : "Enter your PIN";

  const fail = text => {
    setMessage(text);
    setShake(true);
    setTimeout(() => {
      setShake(false);
      setPin("");
      setWorking(false);
    }, 420);
  };

  async function complete(value) {
    setWorking(true);
    if (stage === "choose") {
      setTimeout(() => {
        setFirst(value);
        setPin("");
        setWorking(false);
      }, 160);
      return;
    }
    if (stage === "confirm") {
      if (value !== first) {
        setFirst("");
        return fail("Those didn't match. Start again.");
      }
      await savePin(user.uid, value);
      return onDone();
    }
    const result = await checkPin(user.uid, value);
    if (result.ok) return onDone();
    if (result.remaining <= 0) return onSignOut("Too many wrong PINs. Sign in again to continue.");
    fail(`Wrong PIN. ${result.remaining} ${result.remaining === 1 ? "try" : "tries"} left.`);
  }

  const digit = d => {
    if (working || pin.length >= 4) return;
    setMessage("");
    const next = pin + d;
    setPin(next);
    if (next.length === 4) complete(next);
  };

  useEffect(() => {
    const onKey = event => {
      if (/^\d$/.test(event.key)) digit(event.key);
      else if (event.key === "Backspace") setPin(p => p.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className="adminLock">
      <img src="/apex-icon-192.png" alt="" className="adminLockMark" />
      <h1>{title}</h1>
      <p>{hint}</p>
      <PinDots filled={pin.length} shake={shake} />
      <p className="adminLockMessage" role="status">
        {message}
      </p>
      <PinPad onDigit={digit} onBack={() => !working && setPin(p => p.slice(0, -1))} disabled={working} />
      <button type="button" className="adminLockLink" onClick={() => onSignOut("")}>
        {mode === "setup" ? "Use a different account" : "Forgot PIN? Sign in again"}
      </button>
    </main>
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
  const signedIn = Boolean(user && ownerUids.includes(user.uid));
  const [unlocked, setUnlocked] = useState(false);
  const [lockNotice, setLockNotice] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  // Everything below the PIN screen (listeners, calendar, notifications) only
  // runs once the app is unlocked.
  const owner = signedIn && unlocked;
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
        if (!next) setUnlocked(false);
        else setLockNotice("");
        setReady(true);
      }),
    []
  );

  // Like a banking app: leave for more than a minute and it asks for the PIN again.
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER_MS) {
        setUnlocked(false);
        setAccountOpen(false);
        setSheet(null);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

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
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => `${a.bookingDate} ${isAllDay(a) ? "" : a.bookingTime}`.localeCompare(`${b.bookingDate} ${isAllDay(b) ? "" : b.bookingTime}`)),
    [events]
  );
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

  function fullSignOut(reason = "") {
    clearPin();
    setUnlocked(false);
    setAccountOpen(false);
    setLockNotice(reason);
    signOut(auth);
  }

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

  if (!ready) return <main className="adminLock" />;
  if (!signedIn)
    return (
      <Login
        error={authError || lockNotice}
        busy={authBusy}
        onGoogle={() => withAuth(() => signInWithPopup(auth, new GoogleAuthProvider()))}
        onEmail={(email, password) => withAuth(() => signInWithEmailAndPassword(auth, email, password))}
      />
    );
  if (!unlocked)
    return (
      <PinScreen
        key={hasPin(user.uid) ? "unlock" : "setup"}
        mode={hasPin(user.uid) ? "unlock" : "setup"}
        user={user}
        onDone={() => setUnlocked(true)}
        onSignOut={fullSignOut}
      />
    );

  return (
    <main className="adminPage">
      <header className="adminHead">
        <div className="adminHeadRow">
          <span className="eyebrow">APEX ADMIN</span>
          <SyncPill health={calendarHealth} onOpen={() => setAccountOpen(true)} />
        </div>
        <h1>{new Date().toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", timeZone: ZONE })}</h1>
      </header>

      {dataError && <div className="adminError">{dataError}</div>}

      {tab === "home" && (
        <>
          <NotifyCard status={notifications.status} onEnable={notifications.enable} />

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

      {accountOpen && (
        <AccountSheet
          user={user}
          health={calendarHealth}
          notifyStatus={notifications.status}
          onEnableNotify={notifications.enable}
          busy={busy}
          onConnect={connectCalendar}
          canInstall={canInstall}
          onInstall={install}
          onChangePin={() => {
            clearPin();
            setAccountOpen(false);
            setUnlocked(false);
          }}
          onSignOut={() => fullSignOut("")}
          onClose={() => setAccountOpen(false)}
        />
      )}

      <TabBar tab={tab} onTab={setTab} requestCount={pending.length} />

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Admin />);
