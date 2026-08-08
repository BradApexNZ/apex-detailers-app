import { disconnectGoogleCalendar } from "./apex-api";

function addDisconnectControl() {
  const settings = document.querySelector(".calendarSettings");
  if (!settings || settings.querySelector("[data-apex-google-disconnect]")) return;

  const integration = settings.querySelector(".integration");
  if (!integration || !/connected|healthy/i.test(integration.textContent || "")) return;

  const actions = settings.querySelector(".detailActions");
  if (!actions) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary googleDisconnectButton";
  button.dataset.apexGoogleDisconnect = "true";
  button.textContent = "Disconnect Google";
  button.addEventListener("click", async () => {
    if (!window.confirm("Disconnect this Google account from Apex HQ? You can connect a different account straight afterwards.")) return;
    button.disabled = true;
    button.textContent = "Disconnecting…";
    try {
      await disconnectGoogleCalendar({});
      window.location.reload();
    } catch (error) {
      button.disabled = false;
      button.textContent = "Disconnect Google";
      window.alert(error?.message || "Google could not be disconnected. Please try again.");
    }
  });
  actions.appendChild(button);
}

const observer = new MutationObserver(addDisconnectControl);
observer.observe(document.documentElement, { childList: true, subtree: true });
addDisconnectControl();
