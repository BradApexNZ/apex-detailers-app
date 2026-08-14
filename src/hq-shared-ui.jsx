// Pure, presentation-only pieces shared between the real authenticated HQ
// app (hq-v6.jsx) and the public, unauthenticated marketing demo build
// (hq-marketing.jsx). Deliberately has zero Firebase/Auth/Firestore/API
// imports and no top-level side effects (no createRoot/render call) - if
// either of those ever creeps in here, both entry points that import from
// this file would inherit it, including the public one.
import { useEffect, useState } from "react";
import { money } from "./booking-data";

export const nameOf = c => c.businessName || [c.firstName, c.lastName].filter(Boolean).join(" ") || c.customerName || "Unnamed";
export const vehicleOf = j => j.vehicle || [j.vehicleYear, j.vehicleMake, j.vehicleModel].filter(Boolean).join(" ") || "Vehicle not added";
export const statusClass = value =>
  String(value || "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .join("-")
    .toLowerCase();
export const calendarSyncMeta = status => {
  switch (status) {
    case "synced":
    case "imported":
      return { label: "Synced", cls: "completed" };
    case "pending-hold-synced":
      return { label: "Hold synced", cls: "booked" };
    case "failed":
      return { label: "Sync failed", cls: "cancelled" };
    case "cancelled":
      return { label: "Cancelled", cls: "cancelled" };
    case "not-connected":
      return { label: "Not connected", cls: "lead" };
    default:
      return { label: "Not synced", cls: "lead" };
  }
};

export function Brand() {
  return (
    <div className="hqBrand">
      <img src="/apex-icon.svg" alt="Apex Detailers" />
      <div>
        <strong>APEX DETAILERS</strong>
        <span>HQ / V6 LAUNCH</span>
      </div>
    </div>
  );
}

const navIconShapes = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  inbox: (
    <>
      <rect x="3" y="4" width="18" height="15" rx="2" />
      <path d="M4 12h4l2 3h4l2-3h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </>
  ),
  jobs: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <rect x="9" y="2" width="6" height="3" rx="1" />
      <line x1="9" y1="11" x2="15" y2="11" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </>
  ),
  customers: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M15.5 14.2a5 5 0 0 1 5.5 5" />
    </>
  ),
  quotes: (
    <>
      <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M15 3v4h4" />
      <line x1="8" y1="12.5" x2="16" y2="12.5" />
      <line x1="8" y1="16.5" x2="13" y2="16.5" />
    </>
  ),
  photos: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="14" r="3.5" />
    </>
  ),
  vouchers: (
    <>
      <path d="M13 3 21 11l-8.5 8.5a1.5 1.5 0 0 1-2.1 0L3 12V4a1 1 0 0 1 1-1h9z" />
      <circle cx="8.5" cy="7.5" r="1.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </>
  )
};
export function NavIcon({ id }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {navIconShapes[id]}
    </svg>
  );
}

export function jobTimerSeconds(job) {
  const startedSeconds = job?.timerStartedAt ? job.timerStartedAt.seconds || job.timerStartedAt._seconds || 0 : 0;
  const running = Boolean(startedSeconds);
  return {
    running,
    seconds: (job?.timerElapsedSeconds || 0) + (running ? Math.max(0, Math.floor(Date.now() / 1000 - startedSeconds)) : 0)
  };
}
export function formatTimer(totalSeconds) {
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
export function ActiveJobPanel({ job, busy, onPause, onResume, onComplete, openTab }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!job) return;
    const { running } = jobTimerSeconds(job);
    if (!running) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [job]);
  if (!job) return null;
  const { running, seconds } = jobTimerSeconds(job);
  return (
    <section className="panel activeJobPanel">
      <div className="panel-head">
        <h3>Working on now</h3>
        <span className={`statusPill ${running ? "status-booked" : "status-lead"}`}>{running ? "Running" : "Paused"}</span>
      </div>
      <b className="pii">{job.customerName}</b>
      <span className="muted pii">
        {vehicleOf(job)} - {job.packageName}
      </span>
      <div className="activeJobTimer">{formatTimer(seconds)}</div>
      <div className="detailActions">
        {running ? (
          <button className="secondary" onClick={() => onPause(job)} disabled={busy}>
            Pause
          </button>
        ) : (
          <button className="secondary" onClick={() => onResume(job)} disabled={busy}>
            Resume
          </button>
        )}
        <button onClick={() => onComplete(job)} disabled={busy}>
          Complete job
        </button>
        <button className="text" onClick={() => openTab("jobs")}>
          Open in Jobs
        </button>
      </div>
    </section>
  );
}

export function Stat({ label, value, sensitive }) {
  return (
    <article className={sensitive ? "pii" : ""}>
      <span>{label}</span>
      <b>{value}</b>
    </article>
  );
}
export function RevenueChart({ points, total }) {
  const w = 400,
    h = 120,
    pad = 8;
  const max = Math.max(1, ...points);
  const stepX = points.length > 1 ? w / (points.length - 1) : w;
  const coords = points.map((v, i) => [i * stepX, h - pad - (v / max) * (h - pad * 2)]);
  const hasActivity = points.some(v => v > 0);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const last = coords[coords.length - 1];
  return (
    <div className="revenueChart">
      <div className="revenueChartHead">
        <div>
          <b className="pii">{money(total)}</b>
          <span>Revenue - last 30 days</span>
        </div>
      </div>
      {hasActivity ? (
        <svg className="revenueChartSvg pii" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" y1={h * 0.25} x2={w} y2={h * 0.25} className="chartGrid" />
          <line x1="0" y1={h * 0.5} x2={w} y2={h * 0.5} className="chartGrid" />
          <line x1="0" y1={h * 0.75} x2={w} y2={h * 0.75} className="chartGrid" />
          <path d={area} fill="url(#revenueFill)" />
          <polyline
            points={coords.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="none"
            stroke="var(--gold)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {last && <circle cx={last[0]} cy={last[1]} r="4.5" fill="var(--gold)" />}
        </svg>
      ) : (
        <div className="revenueChartEmpty muted">No paid jobs in the last 30 days yet.</div>
      )}
    </div>
  );
}
export function Intro({ title, text }) {
  return (
    <header className="intro">
      <span className="eyebrow">APEX OPERATIONS</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </header>
  );
}
export function Panel({ title, children }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
export function Agenda({ job, sync, open }) {
  const syncMeta = calendarSyncMeta(job.calendarSyncStatus);
  return (
    <div className="agenda">
      <time>
        <b>{new Date(`${job.bookingDate}T00:00:00`).getDate()}</b>
        <span>{new Date(`${job.bookingDate}T00:00:00`).toLocaleDateString("en-NZ", { month: "short" })}</span>
      </time>
      <div onClick={open}>
        <b className="pii">{job.customerName}</b>
        <span className="pii">
          {vehicleOf(job)} - {job.packageName}
        </span>
        <span className={`statusPill agendaSync status-${syncMeta.cls}`}>{syncMeta.label}</span>
      </div>
      <em>{job.bookingTime}</em>
      {sync && <button onClick={sync}>Sync</button>}
    </div>
  );
}
export function Empty({ text }) {
  return (
    <div className="empty">
      <b>-</b>
      <p>{text}</p>
    </div>
  );
}
