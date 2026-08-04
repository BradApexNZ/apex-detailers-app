import { getGoogleCalendarStatus, startGoogleCalendarConnect } from "./apex-api";

const findSettingsSection = () => [...document.querySelectorAll(".settings > section")]
  .find(section => section.querySelector("h3")?.textContent.trim() === "Google Calendar");

function messageFor(error) {
  const raw = error?.message || "Google Calendar connection failed.";
  if (/secret|oauth|client|configuration|internal/i.test(raw)) {
    return "Google Calendar is live, but its Google OAuth credentials or Firebase Function secrets still need configuration.";
  }
  if (/not[- ]found|unavailable|failed-precondition/i.test(raw)) {
    return "The Calendar backend is not available yet. Check the latest Firebase Functions deployment.";
  }
  return raw.replace(/^Firebase:\s*/i, "");
}

function showToast(text) {
  document.querySelector("[data-apex-calendar-toast]")?.remove();
  const toast = document.createElement("div");
  toast.dataset.apexCalendarToast = "true";
  toast.className = "toast";
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6500);
}

async function openGoogle(button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Opening Google…";
  try {
    const result = await startGoogleCalendarConnect();
    if (!result?.url) throw new Error("The Calendar backend did not return a Google authorization link.");
    window.location.assign(result.url);
  } catch (error) {
    button.disabled = false;
    button.textContent = original;
    showToast(messageFor(error));
  }
}

async function status() {
  try {
    return await getGoogleCalendarStatus();
  } catch (error) {
    return { connected: false, error: messageFor(error) };
  }
}

function enable(control) {
  if (!control) return;
  control.disabled = false;
  control.classList.remove("apexCloudPaused");
  delete control.dataset.apexCloudPaused;
  control.removeAttribute("title");
}

async function refreshSettings(section) {
  const current = await status();
  const card = section.querySelector(".integration");
  card?.classList.toggle("connected", Boolean(current.connected));
  const heading = card?.querySelector("b");
  const detail = card?.querySelector("span");
  if (heading) heading.textContent = current.connected ? "Connected" : "Ready to connect";
  if (detail) detail.textContent = current.connected
    ? (current.email || "Google Calendar connected")
    : (current.error || "Connect Google to enable live availability, Calendar sync and booking emails.");
}

function wireSettings() {
  const section = findSettingsSection();
  if (!section) return;

  section.querySelector("[data-apex-cloud-notice]")?.remove();
  const buttons = [...section.querySelectorAll("button")];
  let connect = buttons.find(button => /connect(?: google)? calendar/i.test(button.textContent));
  let refresh = buttons.find(button => /refresh status/i.test(button.textContent));

  enable(connect);
  enable(refresh);

  if (connect && connect.dataset.apexCalendarWired !== "true") {
    const replacement = connect.cloneNode(true);
    connect.replaceWith(replacement);
    connect = replacement;
    enable(connect);
    connect.dataset.apexCalendarWired = "true";
    connect.textContent = "Connect Google Calendar";
    connect.addEventListener("click", () => openGoogle(connect));
  }

  if (refresh && refresh.dataset.apexCalendarWired !== "true") {
    const replacement = refresh.cloneNode(true);
    refresh.replaceWith(replacement);
    refresh = replacement;
    enable(refresh);
    refresh.dataset.apexCalendarWired = "true";
    refresh.addEventListener("click", async () => {
      refresh.disabled = true;
      await refreshSettings(section);
      enable(refresh);
      showToast("Calendar status refreshed.");
    });
  }

  refreshSettings(section);
}

function findCalendarPage() {
  const heading = [...document.querySelectorAll("main h2")]
    .find(node => node.textContent.trim() === "Calendar");
  return heading?.closest("main") || null;
}

async function ensureCalendarPanel() {
  const page = findCalendarPage();
  if (!page) return;

  let panel = page.querySelector("[data-apex-google-panel]");
  if (!panel) {
    panel = document.createElement("section");
    panel.dataset.apexGooglePanel = "true";
    panel.className = "panel apexGoogleCalendarPanel";
    panel.innerHTML = `
      <h3>Google Calendar sync</h3>
      <p class="muted" data-apex-google-detail>Checking connection…</p>
      <div class="apexGoogleCalendarActions">
        <button type="button" data-apex-google-connect>Connect Google Calendar</button>
        <button type="button" class="secondary" data-apex-google-refresh>Refresh status</button>
      </div>
    `;
    const intro = page.querySelector(".intro");
    if (intro?.nextSibling) page.insertBefore(panel, intro.nextSibling);
    else page.prepend(panel);

    const connect = panel.querySelector("[data-apex-google-connect]");
    const refresh = panel.querySelector("[data-apex-google-refresh]");
    connect.addEventListener("click", () => openGoogle(connect));
    refresh.addEventListener("click", () => updateCalendarPanel(panel, true));
  }

  panel.querySelectorAll("button").forEach(enable);
  await updateCalendarPanel(panel, false);
}

async function updateCalendarPanel(panel, notify = false) {
  const current = await status();
  const detail = panel.querySelector("[data-apex-google-detail]");
  const connect = panel.querySelector("[data-apex-google-connect]");
  panel.classList.toggle("connected", Boolean(current.connected));
  if (detail) detail.textContent = current.connected
    ? `Connected${current.email ? ` as ${current.email}` : ""}. Apex bookings can sync to Google Calendar.`
    : (current.error || "Not connected. Connect Google to activate live availability and booking sync.");
  if (connect) connect.textContent = current.connected ? "Reconnect Google Calendar" : "Connect Google Calendar";
  if (notify) showToast(current.connected ? "Google Calendar is connected." : "Google Calendar is not connected yet.");
}

function refreshCalendarControls() {
  wireSettings();
  ensureCalendarPanel();
}

let frame = 0;
const observer = new MutationObserver(() => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    refreshCalendarControls();
  });
});
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "disabled"] });
refreshCalendarControls();
