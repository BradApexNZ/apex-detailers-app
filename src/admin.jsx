import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { auth, authPersistenceReady, db } from "./firebase";
import { approveBookingRequest, declineBookingRequest } from "./apex-api";
import { money } from "./booking-data";

// Stripped-down owner view: pending online requests to approve or decline, and
// what's on today and tomorrow. Everything else lives in the full HQ at /hq.
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
        <button type="button" className="danger" disabled={busy} onClick={() => onDecline(item)}>
          Decline
        </button>
        <button type="button" className="primary" disabled={busy} onClick={() => onApprove(item)}>
          Approve
        </button>
      </div>
    </article>
  );
}

function JobRow({ job }) {
  const addons = Array.isArray(job.addonNames) ? job.addonNames : [];
  return (
    <article className="adminCard adminJob">
      <time>
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
        </div>
      </div>
      {job.total != null && <b>{money(job.total)}</b>}
    </article>
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
  const owner = Boolean(user && ownerUids.includes(user.uid));
  const { canOffer: canInstall, install } = useInstall(message => {
    setToast(message);
    setTimeout(() => setToast(""), 6000);
  });
  const today = dayKey(0);
  const tomorrow = dayKey(1);

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
        query(collection(db, "jobs"), where("bookingDate", "in", [today, tomorrow])),
        s => setJobs(s.docs.map(d => ({ id: d.id, ...d.data() }))),
        fail("jobs")
      )
    ];
    return () => stops.forEach(stop => stop());
  }, [owner, today, tomorrow]);

  const pending = useMemo(() => [...requests].sort(byTime), [requests]);
  const active = useMemo(
    () => jobs.filter(job => job.mode !== "calendar-block" && !INACTIVE.has(String(job.status || "").toLowerCase())).sort(byTime),
    [jobs]
  );
  const todayJobs = active.filter(job => job.bookingDate === today);
  const tomorrowJobs = active.filter(job => job.bookingDate === tomorrow);

  const notify = message => {
    setToast(message);
    setTimeout(() => setToast(""), 4000);
  };

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

  async function decline(item) {
    if (!confirm(`Decline ${item.customerName}'s request? The slot is released and they're emailed.`)) return;
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
          <a href="/hq">Full HQ</a>
          <button type="button" onClick={() => signOut(auth)}>
            Sign out
          </button>
        </nav>
      </header>

      {dataError && <div className="adminError">{dataError}</div>}

      <Section title="Needs approval" count={pending.length} empty="No requests waiting.">
        {pending.map(item => (
          <RequestCard key={item.id} item={item} busy={busy} onApprove={approve} onDecline={decline} />
        ))}
      </Section>

      <Section title="Today" count={todayJobs.length} empty="Nothing booked today.">
        {todayJobs.map(job => (
          <JobRow key={job.id} job={job} />
        ))}
      </Section>

      <Section title="Tomorrow" count={tomorrowJobs.length} empty="Nothing booked tomorrow.">
        {tomorrowJobs.map(job => (
          <JobRow key={job.id} job={job} />
        ))}
      </Section>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Admin />);
