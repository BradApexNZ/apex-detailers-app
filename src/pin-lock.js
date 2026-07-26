import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "firebase/auth";
import { auth } from "./firebase";
import "./pin-lock.css";

const PIN_KEY = "apex_hq_pin_v1";
const ATTEMPT_KEY = "apex_hq_pin_attempts_v1";
const LOCK_UNTIL_KEY = "apex_hq_pin_lock_until_v1";
const PIN_LENGTH = 6;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 60_000;
const IDLE_MS = 5 * 60_000;
const AUTHORISED_EMAIL = "brad@apexdetailers.co.nz";

let currentUser = null;
let unlocked = false;
let idleTimer = null;
let hiddenAt = 0;
let overlay = null;

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

function getPinRecord() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PIN_KEY) || "null");
    return parsed?.salt && parsed?.hash ? parsed : null;
  } catch {
    return null;
  }
}

function clearLocalPin() {
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(ATTEMPT_KEY);
  localStorage.removeItem(LOCK_UNTIL_KEY);
  unlocked = false;
}

function resetIdleTimer() {
  if (!unlocked || !currentUser) return;
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    unlocked = false;
    showPinFlow("unlock");
  }, IDLE_MS);
}

function removeOverlay() {
  overlay?.remove();
  overlay = null;
  document.body.classList.remove("apex-pin-locked");
}

function setStatus(element, message, tone = "") {
  element.textContent = message;
  element.dataset.tone = tone;
}

function googleButtonMarkup() {
  return `
    <button type="button" class="apex-google-login" data-apex-google-login>
      <span class="apex-google-icon" aria-hidden="true">G</span>
      <span>Continue with Google</span>
    </button>
    <div class="apex-login-divider"><span>or use email and password</span></div>
    <p class="apex-google-status" data-apex-google-status aria-live="polite"></p>`;
}

function installGoogleLoginButton() {
  if (currentUser || document.querySelector("[data-apex-google-login]")) return;

  const loginCard = document.querySelector(".loginCard");
  if (!loginCard) return;

  loginCard.insertAdjacentHTML("afterbegin", googleButtonMarkup());
  const button = loginCard.querySelector("[data-apex-google-login]");
  const status = loginCard.querySelector("[data-apex-google-status]");

  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "Opening Google sign-in…";
    status.dataset.tone = "";

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: "select_account",
      login_hint: AUTHORISED_EMAIL
    });

    try {
      const result = await signInWithPopup(auth, provider);
      const email = String(result.user?.email || "").toLowerCase();

      if (email !== AUTHORISED_EMAIL) {
        await signOut(auth);
        throw new Error("Use the Brad@apexdetailers.co.nz Google account.");
      }

      status.textContent = "Google sign-in successful.";
    } catch (error) {
      console.error("Google sign-in failed", error);

      if (error?.code === "auth/popup-blocked") {
        status.textContent = "Popup blocked. Redirecting to Google…";
        await signInWithRedirect(auth, provider);
        return;
      }

      if (error?.code === "auth/account-exists-with-different-credential") {
        status.textContent = "This email already uses password login. Sign in once with the password, then Google can be linked safely.";
      } else if (error?.code === "auth/popup-closed-by-user") {
        status.textContent = "Google sign-in was cancelled.";
      } else {
        status.textContent = error?.message || "Google sign-in failed. Please try again.";
      }
      status.dataset.tone = "error";
      button.disabled = false;
    }
  });
}

const loginObserver = new MutationObserver(() => installGoogleLoginButton());
loginObserver.observe(document.documentElement, { childList: true, subtree: true });
window.setTimeout(installGoogleLoginButton, 0);

function showPinFlow(mode) {
  removeOverlay();
  document.body.classList.add("apex-pin-locked");

  let entry = "";
  let firstPin = "";
  let stage = mode === "setup" ? "create" : "unlock";

  overlay = document.createElement("div");
  overlay.className = "apex-pin-overlay";
  overlay.innerHTML = `
    <main class="apex-pin-panel" role="dialog" aria-modal="true" aria-labelledby="apex-pin-title">
      <div class="apex-pin-brand">
        <span class="apex-pin-mark">A</span>
        <div><strong>APEX HQ</strong><small>Secure access</small></div>
      </div>
      <div class="apex-pin-copy">
        <span class="apex-pin-eyebrow">PRIVATE BUSINESS APP</span>
        <h1 id="apex-pin-title"></h1>
        <p id="apex-pin-subtitle"></p>
      </div>
      <div class="apex-pin-dots" aria-label="PIN entry"></div>
      <p class="apex-pin-status" aria-live="polite"></p>
      <div class="apex-pin-keypad" aria-label="Number keypad">
        ${[1,2,3,4,5,6,7,8,9].map(number => `<button type="button" data-digit="${number}">${number}</button>`).join("")}
        <button type="button" class="apex-pin-secondary" data-action="clear">Clear</button>
        <button type="button" data-digit="0">0</button>
        <button type="button" class="apex-pin-secondary" data-action="backspace" aria-label="Delete last digit">⌫</button>
      </div>
      <button type="button" class="apex-pin-forgot" data-action="forgot">Forgot PIN? Sign in again</button>
    </main>`;

  document.body.appendChild(overlay);

  const title = overlay.querySelector("#apex-pin-title");
  const subtitle = overlay.querySelector("#apex-pin-subtitle");
  const dots = overlay.querySelector(".apex-pin-dots");
  const status = overlay.querySelector(".apex-pin-status");
  const forgot = overlay.querySelector('[data-action="forgot"]');

  function render() {
    if (stage === "create") {
      title.textContent = "Create your 6-digit PIN";
      subtitle.textContent = "You’ll use this PIN for quick access on this device.";
      forgot.hidden = true;
    } else if (stage === "confirm") {
      title.textContent = "Confirm your PIN";
      subtitle.textContent = "Enter the same six digits again.";
      forgot.hidden = true;
    } else {
      title.textContent = "Enter PIN";
      subtitle.textContent = "Unlock Apex HQ.";
      forgot.hidden = false;
    }

    dots.innerHTML = Array.from({ length: PIN_LENGTH }, (_, index) =>
      `<span class="${index < entry.length ? "filled" : ""}"></span>`
    ).join("");
  }

  async function completeEntry() {
    if (entry.length !== PIN_LENGTH) return;

    if (stage === "create") {
      firstPin = entry;
      entry = "";
      stage = "confirm";
      setStatus(status, "");
      render();
      return;
    }

    if (stage === "confirm") {
      if (entry !== firstPin) {
        entry = "";
        firstPin = "";
        stage = "create";
        setStatus(status, "PINs didn’t match. Start again.", "error");
        render();
        return;
      }

      const salt = randomSalt();
      const hash = await hashPin(entry, salt);
      localStorage.setItem(PIN_KEY, JSON.stringify({ salt, hash, createdAt: Date.now() }));
      localStorage.removeItem(ATTEMPT_KEY);
      localStorage.removeItem(LOCK_UNTIL_KEY);
      unlocked = true;
      removeOverlay();
      resetIdleTimer();
      return;
    }

    const lockUntil = Number(localStorage.getItem(LOCK_UNTIL_KEY) || 0);
    if (lockUntil > Date.now()) {
      entry = "";
      setStatus(status, `Too many tries. Wait ${Math.ceil((lockUntil - Date.now()) / 1000)} seconds.`, "error");
      render();
      return;
    }

    const record = getPinRecord();
    const candidate = record ? await hashPin(entry, record.salt) : "";
    if (record && candidate === record.hash) {
      localStorage.removeItem(ATTEMPT_KEY);
      localStorage.removeItem(LOCK_UNTIL_KEY);
      unlocked = true;
      removeOverlay();
      resetIdleTimer();
      return;
    }

    const attempts = Number(localStorage.getItem(ATTEMPT_KEY) || 0) + 1;
    localStorage.setItem(ATTEMPT_KEY, String(attempts));
    entry = "";

    if (attempts >= MAX_ATTEMPTS) {
      localStorage.setItem(LOCK_UNTIL_KEY, String(Date.now() + LOCK_MS));
      localStorage.setItem(ATTEMPT_KEY, "0");
      setStatus(status, "Too many incorrect attempts. Locked for 60 seconds.", "error");
    } else {
      setStatus(status, `Incorrect PIN. ${MAX_ATTEMPTS - attempts} tries remaining.`, "error");
    }
    render();
  }

  overlay.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (!button) return;

    const digit = button.dataset.digit;
    const action = button.dataset.action;

    if (digit !== undefined && entry.length < PIN_LENGTH) {
      entry += digit;
      setStatus(status, "");
      render();
      if (entry.length === PIN_LENGTH) await completeEntry();
      return;
    }

    if (action === "backspace") {
      entry = entry.slice(0, -1);
      setStatus(status, "");
      render();
    }

    if (action === "clear") {
      entry = "";
      setStatus(status, "");
      render();
    }

    if (action === "forgot") {
      clearLocalPin();
      removeOverlay();
      await signOut(auth);
    }
  });

  render();
}

onAuthStateChanged(auth, async user => {
  currentUser = user;
  window.clearTimeout(idleTimer);

  if (!user) {
    clearLocalPin();
    removeOverlay();
    window.setTimeout(installGoogleLoginButton, 0);
    return;
  }

  const email = String(user.email || "").toLowerCase();
  if (email !== AUTHORISED_EMAIL) {
    clearLocalPin();
    removeOverlay();
    await signOut(auth);
    return;
  }

  if (!getPinRecord()) {
    showPinFlow("setup");
    return;
  }

  if (!unlocked) showPinFlow("unlock");
});

["pointerdown", "keydown", "touchstart"].forEach(eventName => {
  window.addEventListener(eventName, resetIdleTimer, { passive: true });
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    return;
  }

  if (currentUser && unlocked && hiddenAt && Date.now() - hiddenAt >= IDLE_MS) {
    unlocked = false;
    showPinFlow("unlock");
  }
  hiddenAt = 0;
  resetIdleTimer();
});
