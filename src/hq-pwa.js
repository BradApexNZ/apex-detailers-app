import { waitForPendingWrites } from "firebase/firestore";
import { db } from "./firebase";

let deferredInstallPrompt = null;
let reloadingForWorker = false;

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
    .apexInstallButton{min-height:36px!important;padding:0 12px!important;font-size:10px!important}
    @media(max-width:720px){
      .apexInstallButton{display:none!important}
      .apexNotifyBell{top:calc(8px + env(safe-area-inset-top))!important;right:14px!important}
    }
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
  window.setTimeout(() => toast.remove(), 4500);
}

async function checkConnection() {
  if (!navigator.onLine) {
    showMessage("You're offline. Apex HQ will sync when your connection returns.");
    return;
  }
  try {
    await Promise.race([
      waitForPendingWrites(db),
      new Promise(resolve => window.setTimeout(resolve, 4000))
    ]);
  } catch {
    // Firestore exposes operation errors where they matter. Healthy connectivity stays invisible.
  }
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

function removeLegacyConnectionUi() {
  document.querySelectorAll("[data-apex-connection], .apexConnectionStatus").forEach(node => node.remove());
  document.querySelectorAll("button,div,span,p").forEach(node => {
    if (node.children.length === 0 && /^Apex HQ Online$/i.test((node.textContent || "").trim())) {
      const removable = node.closest("[data-apex-connection],.apexConnectionStatus,button,div");
      removable?.remove();
    }
  });
}

function ensureControls() {
  injectStyles();
  removeLegacyConnectionUi();

  const actions = document.querySelector(".top > div:last-child");
  if (!actions) return;

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

window.addEventListener("online", () => {
  showMessage("Back online. Apex HQ is syncing.");
  checkConnection();
});
window.addEventListener("offline", checkConnection);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkConnection();
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForWorker) return;
    reloadingForWorker = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/apex-hq-sw.js?v=4", {
      scope: "/hq",
      updateViaCache: "none"
    })
      .then(async registration => {
        await registration.update();
        if (registration.waiting) registration.waiting.postMessage?.({ type: "SKIP_WAITING" });
      })
      .catch(error => console.warn("Apex HQ offline support could not start.", error));
  });
}

injectStyles();
ensureControls();
new MutationObserver(ensureControls).observe(document.body, {
  childList: true,
  subtree: true
});
