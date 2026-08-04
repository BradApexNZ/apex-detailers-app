import { getGoogleCalendarStatus, startGoogleCalendarConnect } from "./apex-api";

const findCalendarSection = () => [...document.querySelectorAll(".settings > section")]
  .find(section => section.querySelector("h3")?.textContent.trim() === "Google Calendar");

function messageFor(error) {
  const raw = error?.message || "Google Calendar connection failed.";
  if (/secret|oauth|client|configuration|internal/i.test(raw)) {
    return "Google Calendar is live, but its Google OAuth credentials or Firebase Function secrets still need configuration.";
  }
  if (/not[- ]found|unavailable|failed-precondition/i.test(raw)) {
    return "The Calendar backend is not available yet. Deploy the Firebase Functions, then try again.";
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

async function refresh(section) {
  const card = section.querySelector(".integration");
  try {
    const status = await getGoogleCalendarStatus();
    card?.classList.toggle("connected", Boolean(status.connected));
    const heading = card?.querySelector("b");
    const detail = card?.querySelector("span");
    if (heading) heading.textContent = status.connected ? "Connected" : "Ready to connect";
    if (detail) detail.textContent = status.connected
      ? (status.email || "Google Calendar connected")
      : "Connect your Google account to enable live availability, Calendar sync and booking emails.";
  } catch (error) {
    const heading = card?.querySelector("b");
    const detail = card?.querySelector("span");
    if (heading) heading.textContent = "Connection setup required";
    if (detail) detail.textContent = messageFor(error);
  }
}

function wireCalendarSection() {
  const section = findCalendarSection();
  if (!section || section.dataset.apexCalendarLive === "true") return;
  section.dataset.apexCalendarLive = "true";

  const buttons = [...section.querySelectorAll("button")];
  const oldConnect = buttons.find(button => /connect calendar/i.test(button.textContent));
  const oldRefresh = buttons.find(button => /refresh status/i.test(button.textContent));

  if (oldConnect) {
    const connect = oldConnect.cloneNode(true);
    oldConnect.replaceWith(connect);
    connect.disabled = false;
    connect.classList.remove("apexCloudPaused");
    connect.textContent = "Connect Google Calendar";
    connect.addEventListener("click", async () => {
      connect.disabled = true;
      connect.textContent = "Opening Google…";
      try {
        const result = await startGoogleCalendarConnect();
        if (!result?.url) throw new Error("The Calendar backend did not return a Google authorization link.");
        window.location.assign(result.url);
      } catch (error) {
        connect.disabled = false;
        connect.textContent = "Connect Google Calendar";
        showToast(messageFor(error));
        await refresh(section);
      }
    });
  }

  if (oldRefresh) {
    const refreshButton = oldRefresh.cloneNode(true);
    oldRefresh.replaceWith(refreshButton);
    refreshButton.disabled = false;
    refreshButton.classList.remove("apexCloudPaused");
    refreshButton.addEventListener("click", async () => {
      refreshButton.disabled = true;
      try {
        await refresh(section);
        showToast("Calendar status refreshed.");
      } finally {
        refreshButton.disabled = false;
      }
    });
  }

  refresh(section);
}

const observer = new MutationObserver(wireCalendarSection);
observer.observe(document.documentElement, { childList: true, subtree: true });
wireCalendarSection();
