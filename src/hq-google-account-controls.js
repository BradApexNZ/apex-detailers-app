function polishGoogleAccountControls() {
  const settings = document.querySelector(".calendarSettings");
  if (!settings) return;

  const integration = settings.querySelector(".integration");
  const connected = Boolean(integration && /connected|healthy/i.test(integration.textContent || ""));
  const actions = settings.querySelector(".detailActions");
  if (!actions) return;

  const connectButton = actions.querySelector("button:first-child");
  if (connectButton && connected && !connectButton.dataset.apexSwitchLabel) {
    connectButton.textContent = "Switch Google account";
    connectButton.dataset.apexSwitchLabel = "true";
  }
}

const observer = new MutationObserver(polishGoogleAccountControls);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
polishGoogleAccountControls();
