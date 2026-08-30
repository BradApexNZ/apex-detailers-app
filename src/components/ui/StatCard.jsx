import React from "react";

export default function StatCard({ label, value, detail, icon, tone = "default" }) {
  return (
    <article className={`hq-stat-card hq-stat-card--${tone}`}>
      <div className="hq-stat-card__topline">
        <span className="hq-stat-card__label">{label}</span>
        {icon ? <span className="hq-stat-card__icon" aria-hidden="true">{icon}</span> : null}
      </div>
      <strong className="hq-stat-card__value">{value}</strong>
      {detail ? <span className="hq-stat-card__detail">{detail}</span> : null}
    </article>
  );
}
