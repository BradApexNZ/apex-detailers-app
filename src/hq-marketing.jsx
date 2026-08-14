import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ActiveJobPanel,
  Agenda,
  Brand,
  Empty,
  Intro,
  NavIcon,
  Panel,
  RevenueChart,
  Stat,
  calendarSyncMeta,
  formatTimer,
  jobTimerSeconds,
  nameOf,
  statusClass,
  vehicleOf
} from "./hq-shared-ui";
import { formatDate, money } from "./booking-data";
import { demoCustomers, demoInquiries, demoJobs, demoRequests } from "./hq-marketing-data";

const nav = [
  ["dashboard", "Command"],
  ["inbox", "Inbox"],
  ["calendar", "Calendar"],
  ["jobs", "Jobs"],
  ["customers", "Customers"],
  ["quotes", "Quotes"]
];

const todayNZ = () => new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
const timeAgo = timestamp => {
  const seconds = timestamp?.seconds || timestamp?._seconds;
  if (!seconds) return "";
  const diffMinutes = Math.max(0, Math.round((Date.now() - seconds * 1000) / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
};

function AnimatedNumber({ value, format }) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const duration = 900;
    let raf;
    const tick = now => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return format ? format(display) : display;
}

function App() {
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState("");
  const demoNotice = () => {
    setToast("Demo build with sample data — nothing here is real or saved.");
    setTimeout(() => setToast(""), 3200);
  };

  const jobs = demoJobs,
    requests = demoRequests,
    inquiries = demoInquiries,
    customers = demoCustomers;
  const today = todayNZ();
  const pending = requests.filter(r => r.status === "pending");
  const newInquiries = inquiries.filter(i => i.status === "new");
  const upcoming = jobs
    .filter(j => j.bookingDate >= today && !["Archived", "Cancelled"].includes(j.status) && j.status !== "Quote Sent")
    .sort((a, b) => `${a.bookingDate}${a.bookingTime}`.localeCompare(`${b.bookingDate}${b.bookingTime}`));
  const quotes = jobs.filter(j => ["Lead", "Quote Requested", "Quote Sent", "Approved"].includes(j.status));
  const followups = jobs.filter(j => j.status === "Paid");
  const completed = jobs.filter(j => ["Completed", "Prepare Hnry Invoice", "Invoice Sent", "Paid", "Review Request Sent"].includes(j.status));
  const activeJobsCount = jobs.filter(j => ["Booked", "In Progress"].includes(j.status)).length;
  const jobsNeedingInvoice = jobs.filter(j => j.status === "Completed").length;
  const activeJob = jobs.find(j => j.status === "In Progress") || null;
  const needsSyncCount = upcoming.filter(j => !j.calendarSyncStatus || ["failed", "not-connected"].includes(j.calendarSyncStatus)).length;
  const month = today.slice(0, 7);
  const monthRevenue = jobs
    .filter(j => ["Paid", "Review Request Sent"].includes(j.status) && String(j.bookingDate || "").startsWith(month))
    .reduce((sum, j) => sum + Number(j.paidAmount || j.total || 0), 0);
  const revenueTrend = (() => {
    const paidJobs = jobs.filter(j => ["Paid", "Review Request Sent"].includes(j.status));
    const points = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(`${today}T00:00:00`);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
      points.push(paidJobs.filter(j => j.bookingDate === key).reduce((sum, j) => sum + Number(j.paidAmount || j.total || 0), 0));
    }
    return points;
  })();

  return (
    <div className="shell">
      <aside>
        <Brand />
        <nav>
          {nav.map(([id, label]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              <i>
                <NavIcon id={id} />
              </i>
              {label}
              {id === "inbox" && pending.length + newInquiries.length > 0 && <em>{pending.length + newInquiries.length}</em>}
            </button>
          ))}
        </nav>
        <footer>
          <div className="hqBrand" style={{ opacity: 0.65, fontSize: 11, padding: "10px 4px" }}>
            DEMO BUILD &middot; sample data only
          </div>
        </footer>
      </aside>
      <div className="workspace">
        <header className="top">
          <div>
            <span className="eyebrow">
              APEX HQ - {new Date().toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" }).toUpperCase()}
            </span>
            <h1>{nav.find(n => n[0] === tab)?.[1]}</h1>
          </div>
          <div className="topActions">
            <button className="secondaryTop" onClick={demoNotice}>
              + Quote
            </button>
            <button className="secondaryTop" onClick={demoNotice}>
              + Customer
            </button>
            <button onClick={demoNotice}>+ Booking</button>
          </div>
        </header>
        <main>
          {tab === "dashboard" && (
            <>
              <section className="command">
                <div>
                  <span className="eyebrow">TODAY'S COMMAND DECK</span>
                  <h2>
                    {upcoming.filter(j => j.bookingDate === today).length
                      ? `${upcoming.filter(j => j.bookingDate === today).length} vehicle${upcoming.filter(j => j.bookingDate === today).length === 1 ? "" : "s"} on today.`
                      : "The day is clear."}
                  </h2>
                  <p>
                    {pending.length} booking request{pending.length === 1 ? "" : "s"}, {quotes.length} active quote
                    {quotes.length === 1 ? "" : "s"}, and {followups.length} review follow-up{followups.length === 1 ? "" : "s"} waiting.
                  </p>
                  <div className="heroActions">
                    <button onClick={demoNotice}>+ Add booking</button>
                    <button className="secondaryTop" onClick={demoNotice}>
                      + Create quote
                    </button>
                  </div>
                </div>
                <article>
                  <span className="eyebrow">NEXT UP</span>
                  {upcoming[0] ? (
                    <>
                      <b>
                        {formatDate(upcoming[0].bookingDate)} - {upcoming[0].bookingTime}
                      </b>
                      <h3>{upcoming[0].customerName}</h3>
                      <p>{vehicleOf(upcoming[0])}</p>
                    </>
                  ) : (
                    <h3>No upcoming booking.</h3>
                  )}
                </article>
              </section>
              {activeJob && (
                <ActiveJobPanel job={activeJob} busy={false} onPause={demoNotice} onResume={demoNotice} onComplete={demoNotice} openTab={setTab} />
              )}
              <section className="stats">
                <Stat label="This month paid" value={<AnimatedNumber value={monthRevenue} format={money} />} />
                <Stat label="Completed" value={<AnimatedNumber value={completed.length} />} />
                <Stat label="Today's jobs" value={<AnimatedNumber value={upcoming.filter(j => j.bookingDate === today).length} />} />
                <Stat label="Pending requests" value={<AnimatedNumber value={pending.length} />} />
                <Stat label="Active quotes" value={<AnimatedNumber value={quotes.length} />} />
                <Stat label="Follow-ups" value={<AnimatedNumber value={followups.length} />} />
              </section>
              <div className="dashboardGrid">
                <Panel title="Coming up">
                  {upcoming.slice(0, 6).map(j => (
                    <Agenda key={j.id} job={j} open={demoNotice} />
                  ))}
                  {!upcoming.length && <Empty text="No upcoming bookings." />}
                </Panel>
                <div className="dashboardCol">
                  <section className="panel">
                    <RevenueChart points={revenueTrend} total={monthRevenue} />
                  </section>
                </div>
              </div>
            </>
          )}
          {tab === "inbox" && (
            <>
              <div className="sectionLead">
                <Intro
                  title="Inbox"
                  text={
                    pending.length || newInquiries.length
                      ? `${pending.length} booking request${pending.length === 1 ? "" : "s"} and ${newInquiries.length} inquir${newInquiries.length === 1 ? "y" : "ies"} waiting.`
                      : "Booking requests and enquiries arrive here."
                  }
                />
              </div>
              <div className="cards">
                {pending.map(r => (
                  <article className="request" key={r.id}>
                    <header>
                      <div>
                        <h3>{r.customerName}</h3>
                        <span>
                          {r.email} - {r.phone}
                        </span>
                      </div>
                      <b>
                        {formatDate(r.bookingDate)}
                        <small>{r.bookingTime}</small>
                      </b>
                    </header>
                    <p>
                      {[r.vehicleYear, r.vehicleMake, r.vehicleModel].filter(Boolean).join(" ")} - {r.serviceName}
                    </p>
                    <p>
                      {r.address}, {r.area}
                    </p>
                    {r.notes && <blockquote>{r.notes}</blockquote>}
                    <footer>
                      <button onClick={demoNotice}>Confirm</button>
                      <button className="danger" onClick={demoNotice}>
                        Decline
                      </button>
                      {timeAgo(r.createdAt) && <em className="waitBadge">waiting {timeAgo(r.createdAt)}</em>}
                    </footer>
                  </article>
                ))}
                {newInquiries.map(i => (
                  <article className="request inquiry" key={i.id}>
                    <header>
                      <div>
                        <h3>{i.name}</h3>
                        <span>
                          {i.email} - {i.phone}
                        </span>
                      </div>
                      <b>INQUIRY</b>
                    </header>
                    <blockquote>{i.message}</blockquote>
                    <footer>
                      <button onClick={demoNotice}>Mark resolved</button>
                      {timeAgo(i.createdAt) && <em className="waitBadge">waiting {timeAgo(i.createdAt)}</em>}
                    </footer>
                  </article>
                ))}
              </div>
              {!pending.length && !newInquiries.length && <Empty text="Nothing waiting in the inbox." />}
            </>
          )}
          {tab === "calendar" && (
            <>
              <Intro
                title="Schedule"
                text={
                  upcoming.length
                    ? `${upcoming.length} upcoming, ${needsSyncCount} need${needsSyncCount === 1 ? "s" : ""} calendar sync.`
                    : "Confirmed jobs with exact Google sync status."
                }
              />
              <div className="calendar">
                {upcoming.map(j => (
                  <Agenda key={j.id} job={j} open={demoNotice} sync={demoNotice} />
                ))}
              </div>
              {!upcoming.length && <Empty text="No upcoming bookings." />}
            </>
          )}
          {tab === "jobs" && (
            <>
              <div className="sectionLead">
                <Intro
                  title="Jobs"
                  text={
                    activeJobsCount || jobsNeedingInvoice
                      ? `${activeJobsCount} active, ${jobsNeedingInvoice} ready to invoice.`
                      : "Operational job pipeline, Hnry handoff, payment and review status."
                  }
                />
                <button onClick={demoNotice}>+ Add job</button>
              </div>
              <div className="table">
                {[...jobs]
                  .filter(j => !["Lead", "Quote Requested", "Quote Sent"].includes(j.status))
                  .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                  .map(j => (
                    <div className="job" key={j.id} onClick={demoNotice}>
                      <i>JB</i>
                      <div>
                        <b>{j.customerName}</b>
                        <span>{vehicleOf(j)}</span>
                      </div>
                      <div>
                        <b>{j.packageName}</b>
                        <span>{j.bookingDate ? `${formatDate(j.bookingDate)} - ${j.bookingTime || ""}` : "No booking date"}</span>
                      </div>
                      <strong>{money(j.total)}</strong>
                      <span className={`statusPill status-${statusClass(j.status)}`}>{j.status || "Booked"}</span>
                    </div>
                  ))}
              </div>
            </>
          )}
          {tab === "customers" && (
            <>
              <div className="sectionLead">
                <Intro title="Customers" text={`${customers.length} customers. Tap a card to edit it.`} />
                <div className="customerActions">
                  <button onClick={demoNotice}>+ Add customer</button>
                </div>
              </div>
              <div className="customerGrid">
                {customers.map(c => {
                  const history = jobs.filter(j => j.customerId === c.id),
                    vehicles = [...new Set(history.map(vehicleOf).filter(v => v !== "Vehicle not added"))];
                  return (
                    <article key={c.id} onClick={demoNotice} style={{ cursor: "pointer" }}>
                      <header>
                        <i>{nameOf(c).slice(0, 1)}</i>
                        <div>
                          <h3>{nameOf(c)}</h3>
                          <span>
                            {c.phone || "No phone"}
                            {c.email ? ` - ${c.email}` : ""}
                          </span>
                        </div>
                      </header>
                      <p>{c.address || c.area || "No address saved"}</p>
                      <p>{vehicles.slice(0, 3).join(" / ") || "No vehicle saved"}</p>
                      <footer>
                        <b>{history.length} jobs</b>
                        <b>
                          {money(
                            history
                              .filter(j => ["Paid", "Review Request Sent"].includes(j.status))
                              .reduce((sum, j) => sum + Number(j.paidAmount || j.total || 0), 0)
                          )}
                        </b>
                      </footer>
                    </article>
                  );
                })}
              </div>
            </>
          )}
          {tab === "quotes" && (
            <>
              <div className="sectionLead">
                <Intro
                  title="Quotes"
                  text={
                    quotes.length
                      ? `${quotes.length} active quotes. Create, price and convert work into booked jobs.`
                      : "Create, price and convert quote work into booked jobs."
                  }
                />
                <button onClick={demoNotice}>+ Create quote</button>
              </div>
              <div className="cards">
                {quotes.map(q => (
                  <article className="request quoteCard" key={q.id}>
                    <header>
                      <div>
                        <h3>{q.customerName}</h3>
                        <span>{vehicleOf(q)}</span>
                      </div>
                      <b>
                        {money(q.total)}
                        <span className={`statusPill quoteStatus status-${statusClass(q.status)}`}>{q.status || "Lead"}</span>
                      </b>
                    </header>
                    <p>{q.packageName}</p>
                    <footer>
                      <button onClick={demoNotice}>Convert to booking</button>
                    </footer>
                  </article>
                ))}
                {!quotes.length && <Empty text="No active quotes." />}
              </div>
            </>
          )}
        </main>
      </div>
      <nav className="mobile">
        {nav.map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            <i>
              <NavIcon id={id} />
              {id === "inbox" && pending.length + newInquiries.length > 0 && <em>{pending.length + newInquiries.length}</em>}
            </i>
            <small>{label}</small>
          </button>
        ))}
      </nav>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
