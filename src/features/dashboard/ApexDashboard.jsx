import React, { useMemo } from "react";
import StatCard from "../../components/StatCard";

const nzMoney = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
  maximumFractionDigits: 0,
});

const activeQuoteStatuses = new Set(["Lead", "Quote Requested", "Quote Sent", "Approved"]);
const unpaidStatuses = new Set(["Completed", "Prepare Hnry Invoice", "Invoice Sent"]);

export default function ApexDashboard({ jobs = [], onAction, today = new Date() }) {
  const metrics = useMemo(() => {
    const month = today.getMonth();
    const year = today.getFullYear();
    const isoDate = today.toISOString().slice(0, 10);

    const todaysJobs = jobs.filter((job) => job.bookingDate === isoDate);
    const pendingQuotes = jobs.filter((job) => activeQuoteStatuses.has(job.status));
    const unpaid = jobs.filter((job) => unpaidStatuses.has(job.status));
    const followUps = jobs.filter((job) => job.status === "Paid" && !job.reviewRequestSent);
    const monthRevenue = jobs
      .filter((job) => {
        if (!job.bookingDate || job.status !== "Paid") return false;
        const date = new Date(`${job.bookingDate}T00:00:00`);
        return date.getMonth() === month && date.getFullYear() === year;
      })
      .reduce((total, job) => total + Number(job.total || job.quoteTotal || job.manualTotal || 0), 0);

    const outstanding = unpaid.reduce(
      (total, job) => total + Math.max(0, Number(job.total || job.quoteTotal || 0) - Number(job.paidAmount || 0)),
      0,
    );

    return { todaysJobs, pendingQuotes, unpaid, followUps, monthRevenue, outstanding };
  }, [jobs, today]);

  const quickActions = [
    ["new-quote", "New quote", "Build and send pricing"],
    ["new-booking", "New booking", "Schedule confirmed work"],
    ["new-customer", "Add customer", "Create a customer profile"],
    ["media", "Upload photos", "Add job progress images"],
  ];

  return (
    <section className="apex-dashboard-grid" aria-label="Apex HQ dashboard">
      <div className="apex-span-3"><StatCard label="Today’s jobs" value={metrics.todaysJobs.length} note="Scheduled for today" /></div>
      <div className="apex-span-3"><StatCard label="Pending quotes" value={metrics.pendingQuotes.length} note="Waiting for action" /></div>
      <div className="apex-span-3"><StatCard label="Month revenue" value={nzMoney.format(metrics.monthRevenue)} note="Paid jobs this month" /></div>
      <div className="apex-span-3"><StatCard label="Outstanding" value={nzMoney.format(metrics.outstanding)} note={`${metrics.unpaid.length} payment${metrics.unpaid.length === 1 ? "" : "s"}`} /></div>

      <article className="apex-panel apex-span-12">
        <div className="apex-panel-header"><h2>Quick actions</h2><span>Run the business faster</span></div>
        <div className="apex-panel-body apex-quick-actions">
          {quickActions.map(([id, title, detail]) => (
            <button className="apex-quick-action" type="button" key={id} onClick={() => onAction?.(id)}>
              <strong>{title}</strong><span>{detail}</span>
            </button>
          ))}
        </div>
      </article>

      <article className="apex-panel apex-span-7">
        <div className="apex-panel-header"><h2>Today’s schedule</h2><span>{metrics.todaysJobs.length} jobs</span></div>
        <div className="apex-panel-body">
          {metrics.todaysJobs.length ? metrics.todaysJobs.map((job) => (
            <div key={job.id} className="apex-dashboard-row">
              <div><strong>{job.bookingTime || "Time TBC"}</strong><span>{job.customerName || "Unnamed customer"}</span></div>
              <div><strong>{[job.vehicleMake, job.vehicleModel].filter(Boolean).join(" ") || "Vehicle"}</strong><span>{job.packageName || "Detailing service"}</span></div>
              <span className="apex-row-status">{job.status || "Booked"}</span>
            </div>
          )) : <div className="apex-empty-state">No work is scheduled for today.</div>}
        </div>
      </article>

      <article className="apex-panel apex-span-5">
        <div className="apex-panel-header"><h2>Needs attention</h2><span>Current workload</span></div>
        <div className="apex-panel-body apex-attention-list">
          <button type="button" onClick={() => onAction?.("quotes")}><span>Quotes awaiting action</span><strong>{metrics.pendingQuotes.length}</strong></button>
          <button type="button" onClick={() => onAction?.("payments")}><span>Outstanding payments</span><strong>{metrics.unpaid.length}</strong></button>
          <button type="button" onClick={() => onAction?.("follow-ups")}><span>Review follow-ups due</span><strong>{metrics.followUps.length}</strong></button>
        </div>
      </article>
    </section>
  );
}
