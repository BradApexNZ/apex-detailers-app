import { getGoogleCalendarStatus, startGoogleCalendarConnect } from "./apex-api";

const STALE_SELECTORS = [
  "[data-apex-calendar-upgrade]",
  "[data-apex-sync-health]",
  ".apexCalendarUpgrade",
  ".apexSyncHealth"
];

function removeStaleCalendarOverlays() {
  STALE_SELECTORS.forEach(selector => {
    document.querySelectorAll(selector).forEach(node => node.remove());
  });
  ["apex-calendar-upgrade-styles", "apex-calendar-hardening-styles"].forEach(id => {
    document.getElementById(id)?.remove();
  });
}

function settingsSection() {
  return [...document.querySelectorAll("main section, .settings > section")]
    .find(section => /google calendar/i.test(section.querySelector("h3,h2")?.textContent || ""));
}

function ensureStatusRow(section) {
  let row = section.querySelector("[data-google-calendar-recovery]");
  if (row) return row;
  row = document.createElement("div");
  row.dataset.googleCalendarRecovery = "true";
  row.className = "integration googleCalendarRecovery";
  row.innerHTML = `
    <div class="googleCalendarRecoveryIcon">G</div>
    <div class="googleCalendarRecoveryCopy">
      <b>Checking Google Calendar…</b>
      <span>Verifying your connection.</span>
    </div>
    <button type="button">Connect Google Calendar</button>
  `;
  section.appendChild(row);
  return row;
}

async function renderGoogleStatus() {
  const section = settingsSection();
  if (!section) return;
  const row = ensureStatusRow(section);
  const title = row.querySelector("b");
  const detail = row.querySelector("span");
  const button = row.querySelector("button");
  try {
    const status = await getGoogleCalendarStatus();
    row.classList.toggle("connected", Boolean(status?.connected));
    title.textContent = status?.connected ? "Google Calendar connected" : "Google Calendar not connected";
    detail.textContent = status?.connected
      ? `Connected${status.email ? ` as ${status.email}` : ""}. Confirmed bookings can sync automatically.`
      : "Connect Google Calendar to sync confirmed bookings and block busy times.";
    button.textContent = status?.connected ? "Reconnect" : "Connect";
  } catch (error) {
    row.classList.remove("connected");
    title.textContent = "Google Calendar status unavailable";
    detail.textContent = error?.message || "Refresh the page and try again.";
    button.textContent = "Try again";
  }
  if (button.dataset.wired !== "true") {
    button.dataset.wired = "true";
    button.addEventListener("click", async () => {
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Opening Google…";
      try {
        const result = await startGoogleCalendarConnect();
        if (!result?.url) throw new Error("No Google authorization URL was returned.");
        window.location.assign(result.url);
      } catch (error) {
        button.disabled = false;
        button.textContent = original;
        alert(error?.message || "Google Calendar connection failed.");
      }
    });
  }
}

function injectStyles() {
  if (document.getElementById("google-calendar-recovery-styles")) return;
  const style = document.createElement("style");
  style.id = "google-calendar-recovery-styles";
  style.textContent = `
    .googleCalendarRecovery{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;margin-top:14px;padding:14px;border:1px solid #34343a;border-radius:18px;background:#151519}
    .googleCalendarRecovery.connected{border-color:#397c51;background:#14251a}
    .googleCalendarRecoveryIcon{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#fff;color:#111;font-weight:900}
    .googleCalendarRecoveryCopy{display:grid;gap:3px;min-width:0}.googleCalendarRecoveryCopy b{font-size:15px}.googleCalendarRecoveryCopy span{font-size:12px;color:#aaa;line-height:1.35}
    .googleCalendarRecovery button{min-height:40px;padding:8px 12px;border:0;border-radius:12px;background:#f5c400;color:#111;font-weight:900}
    @media(max-width:620px){.googleCalendarRecovery{grid-template-columns:auto 1fr}.googleCalendarRecovery button{grid-column:1/-1;width:100%}}
  `;
  document.head.appendChild(style);
}

let scheduled = false;
function reconcile() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    removeStaleCalendarOverlays();
    renderGoogleStatus();
  });
}

injectStyles();
removeStaleCalendarOverlays();
reconcile();

document.addEventListener("click", event => {
  const navButton = event.target.closest("nav button");
  if (navButton) setTimeout(reconcile, 0);
});

new MutationObserver(reconcile).observe(document.body, { childList: true, subtree: true });
