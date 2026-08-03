const root = document.documentElement;

function syncWorkspaceMode() {
  const desktop = window.matchMedia("(min-width: 1000px)").matches;
  root.dataset.workspace = desktop ? "desktop-admin" : "mobile-owner";
}

syncWorkspaceMode();
window.addEventListener("resize", syncWorkspaceMode, { passive: true });

let deferredInstallPrompt = null;

function ensureInstallButton() {
  if (!deferredInstallPrompt || document.querySelector("[data-apex-install]")) return;
  const headerActions = document.querySelector(".top > div:last-child, .appHeader > div:last-child");
  if (!headerActions) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondaryTop apexInstallButton";
  button.dataset.apexInstall = "true";
  button.textContent = "Install Apex HQ";
  button.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => undefined);
    deferredInstallPrompt = null;
    button.remove();
  });
  headerActions.prepend(button);
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  ensureInstallButton();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  document.querySelector("[data-apex-install]")?.remove();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/apex-hq-sw.js", { scope: "/" }).catch(error => {
      console.warn("Apex HQ service worker registration failed", error);
    });
  });
}

new MutationObserver(() => ensureInstallButton()).observe(document.body, {
  childList: true,
  subtree: true
});
