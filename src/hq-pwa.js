import { waitForPendingWrites } from "firebase/firestore";
import { db, offlinePersistenceEnabled } from "./firebase";

let deferredInstallPrompt = null;
let statusTimer = null;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

function isIos() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function injectStyles() {
  if (document.getElementById("apex-pwa-styles")) return;

  const style = document.createElement("style");
  style.id = "apex-pwa-styles";
  style.textContent = `
    .apexConnectionStatus{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:0 11px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:#151a1f;color:#aeb4ba;font-size:10px;font-weight:800;letter-spacing:.05em;white-space:nowrap}
    .apexConnectionStatus::before{content:"";width:7px;height:7px;border-radius:50%;background:#62c985;box-shadow:0 0 0 3px rgba(98,201,133,.1)}
    .apexConnectionStatus[data-state="offline"]{color:#f2d985;border-color:rgba(244,201,0,.24);background:rgba(244,201,0,.07)}
    .apexConnectionStatus[data-state="offline"]::before{background:#f4c900;box-shadow:0 0 0 3px rgba(244,201,0,.1)}
    .apexConnectionStatus[data-state="syncing"]::before{background:#70a7ff;box-shadow:0 0 0 3px rgba(112,167,255,.1)}
    .apexInstallButton{min-height:36px!important;padding:0 12px!important;font-size:10px!important}
    @media(max-width:720px){.apexConnectionStatus{position:fixed;z-index:45;top:calc(8px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);min-height:30px;background:rgba(15,18,21,.94);backdrop-filter:blur(14px)}.apexInstallButton{display:none!important}}
  `;
  document.head.appendChild(style);
}

function showMessage(message) {
  document.querySelector("[data-apex-pwa-toast]")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.apexPwaToast = "true";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 6500);
}

function setConnectionStatus(state, text) {
  const status = document.querySelector("[data-apex-connection]");
  if (!status) return;
  status.dataset.state = state;
  status.textContent = text;
}

async function refreshConnectionStatus() {
  window.clearTimeout(statusTimer);

  if (!navigator.onLine) {
    setConnectionStatus("offline", "Offline - changes queued");
    return;
  }

  setConnectionStatus("syncing", "Syncing");
  try {
    await Promise.race([
      waitForPendingWrites(db),
      new Promise(resolve => window.setTimeout(resolve, 6000))
    ]);
    setConnectionStatus("online", offlinePersistenceEnabled ? "Synced" : "Online");
  } catch {
    setConnectionStatus("online", "Online");
  }

  statusTimer = window.setTimeout(() => {
    if (navigator.onLine) setConnectionStatus("online", "Online");
  }, 3000);
}

async function installApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => undefined);
    deferredInstallPrompt = null;
    ensureControls();
    return;
  }

  if (isIos()) {
    showMessage("On iPhone: tap Share in Safari, then Add to Home Screen.");
    return;
  }

  showMessage("Use your browser menu and choose Install Apex HQ or Add to Home Screen.");
}

function ensureControls() {
  injectStyles();

  const actions = document.querySelector(".top > div:last-child");
  if (!actions) return;

  let status = document.querySelector("[data-apex-connection]");
  if (!status) {
    status = document.createElement("span");
    status.className = "apexConnectionStatus";
    status.dataset.apexConnection = "true";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    actions.prepend(status);
    refreshConnectionStatus();
  }

  const shouldOfferInstall = !isStandalone() && (Boolean(deferredInstallPrompt) || isIos());
  let install = document.querySelector("[data-apex-install]");

  if (shouldOfferInstall && !install) {
    install = document.createElement("button");
    install.type = "button";
    install.className = "secondaryTop apexInstallButton";
    install.dataset.apexInstall = "true";
    install.textContent = isIos() ? "Add to phone" : "Install app";
    install.addEventListener("click", installApp);
    actions.prepend(install);
  } else if (!shouldOfferInstall && install) {
    install.remove();
  }
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  ensureControls();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  document.querySelector("[data-apex-install]")?.remove();
  showMessage("Apex HQ installed.");
});

window.addEventListener("online", refreshConnectionStatus);
window.addEventListener("offline", refreshConnectionStatus);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshConnectionStatus();
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/apex-hq-sw.js", { scope: "/hq" })
      .then(registration => registration.update())
      .catch(error => console.warn("Apex HQ offline shell could not start.", error));
  });
}

injectStyles();
ensureControls();
new MutationObserver(ensureControls).observe(document.body, {
  childList: true,
  subtree: true
});
