import React from "react";
import "./apex-hq-shell.css";

const defaultNav = [
  { id: "dashboard", label: "Dashboard", icon: "⌂" },
  { id: "customers", label: "Customers", icon: "◌" },
  { id: "jobs", label: "Jobs", icon: "◆" },
  { id: "bookings", label: "Bookings", icon: "◷" },
  { id: "payments", label: "Payments", icon: "$" },
  { id: "media", label: "Photos", icon: "▣" },
];

export default function ApexHQShell({
  activeView = "dashboard",
  onNavigate,
  onSignOut,
  navItems = defaultNav,
  title = "Dashboard",
  eyebrow = "Apex HQ",
  children,
}) {
  return (
    <div className="apex-shell">
      <aside className="apex-sidebar" aria-label="Primary navigation">
        <div className="apex-brand-block">
          <div className="apex-brand-mark" aria-hidden="true">A</div>
          <div>
            <strong>APEX HQ</strong>
            <span>Detailing command centre</span>
          </div>
        </div>

        <nav className="apex-sidebar-nav">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={activeView === item.id ? "is-active" : ""}
              onClick={() => onNavigate?.(item.id)}
            >
              <span className="apex-nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="apex-sidebar-footer">
          <div className="apex-system-status">
            <span className="apex-status-dot" />
            <div>
              <strong>System online</strong>
              <span>Firebase connected</span>
            </div>
          </div>
          <button type="button" className="apex-signout" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>

      <div className="apex-workspace">
        <header className="apex-topbar">
          <div>
            <span className="apex-eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
          </div>
          <div className="apex-topbar-actions">
            <span className="apex-live-pill"><span /> Live business data</span>
            <button type="button" className="apex-primary-action" onClick={() => onNavigate?.("new-quote")}>+ New quote</button>
          </div>
        </header>

        <main className="apex-main-content">{children}</main>
      </div>

      <nav className="apex-mobile-nav" aria-label="Mobile navigation">
        {navItems.slice(0, 5).map((item) => (
          <button
            type="button"
            key={item.id}
            className={activeView === item.id ? "is-active" : ""}
            onClick={() => onNavigate?.(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span>
            <small>{item.label}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}
