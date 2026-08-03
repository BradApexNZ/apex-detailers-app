import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import {
  getPinLength,
  hasBiometricLock,
  hasLegacyPinLock,
  hasPinLock,
  lockSession,
  registerBiometricLock,
  setPin,
  supportsBiometrics
} from "./device-lock";

const BRAND_LOGO = new URL("../assets/apex-logo-official.svg", import.meta.url).href;

const CP1252_BYTES = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]
]);

const SVG_OPEN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

const NAV_ICONS = {
  overview: `${SVG_OPEN}<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>`,
  inbox: `${SVG_OPEN}<path d="M4 5h16v14H4z"/><path d="M4 13h4l2 3h4l2-3h4"/></svg>`,
  calendar: `${SVG_OPEN}<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/></svg>`,
  jobs: `${SVG_OPEN}<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18M10 12v2h4v-2"/></svg>`,
  customers: `${SVG_OPEN}<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a5 5 0 0 1 10 0v2M16 11a3 3 0 0 0 0-6M16 15a5 5 0 0 1 5 5"/></svg>`,
  settings: `${SVG_OPEN}<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>`
};

function byteForCharacter(character) {
  const code = character.codePointAt(0);
  if (code <= 0xff) return code;
  return CP1252_BYTES.get(code) ?? null;
}

function repairEncoding(value) {
  if (!/[\u00c2\u00c3\u00e2\u00ef]/.test(value)) return value;

  const bytes = [];
  for (const character of value) {
    const byte = byteForCharacter(character);
    if (byte === null) return value;
    bytes.push(byte);
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return value;
  }
}

function replaceButtonLabel(button, from, to) {
  for (const node of button.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.includes(from)) {
      node.textContent = node.textContent.replace(from, to);
    }
  }
}

function navigationKey(button) {
  const label = (button.querySelector("small")?.textContent || button.textContent).toLowerCase();
  if (label.includes("overview") || label.includes("command")) return "overview";
  if (label.includes("inbox")) return "inbox";
  if (label.includes("calendar")) return "calendar";
  if (label.includes("jobs")) return "jobs";
  if (label.includes("customers")) return "customers";
  if (label.includes("settings")) return "settings";
  return null;
}

function cleanVisibleText(root) {
  const walker = document.createTreeWalker(root.body || root, NodeFilter.SHOW_TEXT);
  const nodes = [];

  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const repaired = repairEncoding(node.textContent)
      .replaceAll("HQ / V5", "Operations Centre")
      .replaceAll("TODAY'S COMMAND DECK", "TODAY")
      .replaceAll("6-digit PIN", "4-digit PIN")
      .replaceAll("6 digits", "4 digits")
      .replaceAll("on this iPhone", "on a supported phone");

    if (repaired !== node.textContent) node.textContent = repaired;
  }
}

function applyNavigationIcons(root) {
  root.querySelectorAll("aside nav button, .mobile button").forEach(button => {
    replaceButtonLabel(button, "Command", "Overview");

    const key = navigationKey(button);
    const icon = button.querySelector("i");
    if (!key || !icon || icon.dataset.apexIcon === key) return;

    icon.dataset.apexIcon = key;
    icon.innerHTML = NAV_ICONS[key];
  });
}

function applyLogoPresentation(image) {
  image.style.width = "52px";
  image.style.height = "52px";
  image.style.objectFit = "cover";
  image.style.objectPosition = "center";
  image.style.borderRadius = "50%";
  image.style.clipPath = "circle(48% at 50% 50%)";
  image.style.background = "transparent";
  image.style.boxShadow = "none";
  image.style.border = "0";
}

function isMobileDevice() {
  return window.matchMedia("(max-width: 960px)").matches || navigator.maxTouchPoints > 1;
}

function biometricName() {
  const platform = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(platform)) return "Face ID";
  return "device biometrics";
}

function injectSecurityStyles() {
  if (document.getElementById("apex-security-styles")) return;
  const style = document.createElement("style");
  style.id = "apex-security-styles";
  style.textContent = `
    .apexSecurityLayer{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:rgba(5,7,9,.88);backdrop-filter:blur(18px)}
    .apexSecurityCard{width:min(430px,100%);padding:28px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:#14181c;box-shadow:0 28px 90px rgba(0,0,0,.55)}
    .apexSecurityMark{display:flex;align-items:center;gap:12px;margin-bottom:24px}.apexSecurityMark img{width:48px;height:48px;object-fit:cover;border-radius:50%;clip-path:circle(48% at 50% 50%)}
    .apexSecurityMark strong,.apexSecurityMark span{display:block}.apexSecurityMark strong{font-size:12px;letter-spacing:.14em}.apexSecurityMark span{margin-top:4px;color:#9da3aa;font-size:9px;letter-spacing:.13em;text-transform:uppercase}
    .apexSecurityKicker{display:block;margin-bottom:10px;color:#d7bc38;font-size:9px;font-weight:800;letter-spacing:.16em}.apexSecurityCard h2{margin:0 0 10px;font-size:30px;letter-spacing:-.04em}.apexSecurityCard p{margin:0 0 20px;color:#aab0b6;line-height:1.55}
    .apexSecurityForm{display:grid;gap:12px}.apexSecurityForm label{display:grid;gap:7px;color:#dfe2e5;font-size:11px;font-weight:750}.apexSecurityForm input{width:100%;min-height:52px;padding:12px 14px;border:1px solid #343b42;border-radius:11px;background:#0d1013;color:#fff;font-size:20px;letter-spacing:.32em;text-align:center}
    .apexSecurityPrimary,.apexSecuritySecondary,.apexSecurityText{width:100%;min-height:48px;border-radius:10px;font-weight:800}.apexSecurityPrimary{border:1px solid transparent;background:#f4c900;color:#11140f}.apexSecuritySecondary{border:1px solid #343b42;background:#1a1f24;color:#f4f3ee}.apexSecurityText{border:0;background:transparent;color:#9da3aa}
    .apexSecurityError{display:none;padding:11px 12px;border:1px solid rgba(215,101,109,.4);border-radius:10px;background:rgba(215,101,109,.12);color:#ffd9dc;font-size:12px}.apexSecurityError.show{display:block}
    .apexSecurityActions{display:grid;gap:9px;margin-top:14px}.apexSecurityNote{margin-top:16px!important;font-size:11px!important}
    @media(max-width:560px){.apexSecurityLayer{padding:12px}.apexSecurityCard{padding:22px;border-radius:16px}.apexSecurityCard h2{font-size:27px}}
  `;
  document.head.appendChild(style);
}

function removeSecurityLayer() {
  document.getElementById("apex-security-layer")?.remove();
}

function setSecurityError(layer, message) {
  const error = layer.querySelector(".apexSecurityError");
  if (!error) return;
  error.textContent = message;
  error.classList.toggle("show", Boolean(message));
}

async function signOutFromSetup() {
  lockSession();
  await signOut(auth).catch(() => undefined);
  window.location.reload();
}

function showBiometricOffer() {
  injectSecurityStyles();
  removeSecurityLayer();

  const label = biometricName();
  const layer = document.createElement("div");
  layer.id = "apex-security-layer";
  layer.className = "apexSecurityLayer";
  layer.innerHTML = `
    <section class="apexSecurityCard" role="dialog" aria-modal="true" aria-labelledby="apex-security-title">
      <div class="apexSecurityMark"><img src="${BRAND_LOGO}" alt="Apex Detailers"><div><strong>APEX DETAILERS</strong><span>Operations Centre</span></div></div>
      <span class="apexSecurityKicker">MOBILE SECURITY</span>
      <h2 id="apex-security-title">Enable ${label}?</h2>
      <p>Your 4-digit PIN is ready. ${label} gives you a quicker secure unlock on this phone.</p>
      <div class="apexSecurityError" role="alert"></div>
      <div class="apexSecurityActions">
        <button type="button" class="apexSecurityPrimary" data-enable-biometric>Enable ${label}</button>
        <button type="button" class="apexSecuritySecondary" data-skip-biometric>Use PIN only</button>
      </div>
    </section>`;
  document.body.appendChild(layer);

  layer.querySelector("[data-enable-biometric]").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = `Setting up ${label}...`;
    setSecurityError(layer, "");
    try {
      if (!auth.currentUser) throw new Error("Your secure login session is unavailable. Please sign in again.");
      await registerBiometricLock(auth.currentUser);
      removeSecurityLayer();
    } catch (error) {
      setSecurityError(layer, error.message || `${label} setup was cancelled.`);
      button.disabled = false;
      button.textContent = `Enable ${label}`;
    }
  });

  layer.querySelector("[data-skip-biometric]").addEventListener("click", removeSecurityLayer);
}

function showPinSetup({ upgrade = false } = {}) {
  if (document.getElementById("apex-security-layer")) return;
  injectSecurityStyles();

  const layer = document.createElement("div");
  layer.id = "apex-security-layer";
  layer.className = "apexSecurityLayer";
  layer.innerHTML = `
    <section class="apexSecurityCard" role="dialog" aria-modal="true" aria-labelledby="apex-security-title">
      <div class="apexSecurityMark"><img src="${BRAND_LOGO}" alt="Apex Detailers"><div><strong>APEX DETAILERS</strong><span>Operations Centre</span></div></div>
      <span class="apexSecurityKicker">DEVICE SECURITY</span>
      <h2 id="apex-security-title">${upgrade ? "Update your HQ PIN" : "Secure this device"}</h2>
      <p>${upgrade ? "Replace the old 6-digit PIN with a simpler 4-digit Apex HQ PIN." : "Create a 4-digit PIN before using Apex HQ on this device. It will be your backup unlock method."}</p>
      <form class="apexSecurityForm">
        <label>New 4-digit PIN<input name="pin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4" pattern="[0-9]{4}" placeholder="••••" required></label>
        <label>Confirm PIN<input name="confirmPin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4" pattern="[0-9]{4}" placeholder="••••" required></label>
        <div class="apexSecurityError" role="alert"></div>
        <button type="submit" class="apexSecurityPrimary">Save 4-digit PIN</button>
      </form>
      <button type="button" class="apexSecurityText" data-security-signout>Sign out instead</button>
      <p class="apexSecurityNote">The PIN is stored only on this device as a salted hash. Five failed attempts trigger a temporary lockout.</p>
    </section>`;
  document.body.appendChild(layer);

  layer.querySelectorAll('input[inputmode="numeric"]').forEach(input => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 4);
      setSecurityError(layer, "");
    });
  });

  layer.querySelector("form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pin = String(form.get("pin") || "");
    const confirmation = String(form.get("confirmPin") || "");
    const submit = event.currentTarget.querySelector('button[type="submit"]');

    if (!/^\d{4}$/.test(pin)) return setSecurityError(layer, "Enter exactly four numbers.");
    if (pin !== confirmation) return setSecurityError(layer, "The two PINs do not match.");

    submit.disabled = true;
    submit.textContent = "Saving PIN...";
    try {
      await setPin(pin);
      removeSecurityLayer();
      if (isMobileDevice() && supportsBiometrics() && !hasBiometricLock()) showBiometricOffer();
    } catch (error) {
      setSecurityError(layer, error.message || "The PIN could not be saved.");
      submit.disabled = false;
      submit.textContent = "Save 4-digit PIN";
    }
  });

  layer.querySelector("[data-security-signout]").addEventListener("click", signOutFromSetup);
  layer.querySelector('input[name="pin"]').focus();
}

function patchPinInputs(root) {
  root.querySelectorAll('.gate input[inputmode="numeric"]').forEach(input => {
    const digits = getPinLength();
    input.maxLength = digits;
    input.placeholder = `${digits}-digit PIN`;
    input.setAttribute("pattern", `[0-9]{${digits}}`);
  });

  root.querySelectorAll('.settings input[inputmode="numeric"]').forEach(input => {
    input.maxLength = 4;
    input.placeholder = "4-digit PIN";
    input.setAttribute("pattern", "[0-9]{4}");
  });

  root.querySelectorAll(".gate button").forEach(button => {
    if (button.textContent.includes("Face ID") && !/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      button.textContent = "Unlock with device biometrics";
    }
  });
}

function ensureSecuritySetup() {
  if (!auth.currentUser || !document.querySelector(".shell")) return;
  if (!hasPinLock()) showPinSetup();
  else if (hasLegacyPinLock()) showPinSetup({ upgrade: true });
}

function installSecurityActions() {
  if (document.documentElement.dataset.apexSecurityActions === "ready") return;
  document.documentElement.dataset.apexSecurityActions = "ready";

  document.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    const label = button.textContent.trim();

    if (button.closest("aside footer") && label.includes("Lock HQ")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!hasPinLock()) {
        showPinSetup();
        return;
      }
      lockSession();
      window.location.reload();
      return;
    }

    if (label.includes("Remove device lock")) {
      window.setTimeout(ensureSecuritySetup, 50);
    }
  }, true);
}

function polishApexHq(root = document) {
  document.title = "Apex HQ";
  cleanVisibleText(root);
  patchPinInputs(root);

  root.querySelectorAll(".hqBrand img").forEach(image => {
    applyLogoPresentation(image);
    if (image.dataset.apexLogoReady) return;

    image.dataset.apexLogoReady = "true";
    image.alt = "Apex Detailers";
    image.src = BRAND_LOGO;
    image.addEventListener("load", () => applyLogoPresentation(image));
    image.addEventListener("error", () => image.classList.add("logoUnavailable"), { once: true });
  });

  root.querySelectorAll(".hqBrand span").forEach(label => {
    label.textContent = "Operations Centre";
  });

  applyNavigationIcons(root);

  root.querySelectorAll(".top h1").forEach(title => {
    if (title.textContent.trim() === "Command") title.textContent = "Overview";
  });

  root.querySelectorAll(".command h2").forEach(title => {
    if (title.textContent.trim() === "The day is clear. Let's fill it properly.") {
      title.textContent = "No jobs scheduled today.";
    }
  });

  ensureSecuritySetup();
}

let polishScheduled = false;

function schedulePolish() {
  if (polishScheduled) return;
  polishScheduled = true;

  requestAnimationFrame(() => {
    polishScheduled = false;
    polishApexHq();
  });
}

injectSecurityStyles();
installSecurityActions();
polishApexHq();

new MutationObserver(schedulePolish).observe(document.body, {
  childList: true,
  subtree: true
});
