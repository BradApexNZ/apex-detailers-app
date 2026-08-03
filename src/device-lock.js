const BIOMETRIC_KEY = "apex-hq-biometric-credential";
const PIN_KEY = "apex-hq-pin";
const LOCK_ENABLED_KEY = "apex-hq-device-lock-enabled";
const SESSION_UNLOCK_KEY = "apex-hq-session-unlocked";
const LAST_ACTIVITY_KEY = "apex-hq-last-activity";
const FAILED_ATTEMPTS_KEY = "apex-hq-pin-failures";
const LOCK_UNTIL_KEY = "apex-hq-pin-lock-until";

const PIN_LENGTH = 4;
const LEGACY_PIN_LENGTH = 6;
const INACTIVITY_LIMIT_MS = 5 * 60 * 1000;
const PIN_LOCKOUT_MS = 60 * 1000;
const MAX_PIN_FAILURES = 5;

function toBase64(bytes) {
  let binary = "";
  new Uint8Array(bytes).forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function randomBytes(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  return toBase64(await crypto.subtle.digest("SHA-256", bytes));
}

function readStoredPin() {
  try {
    return JSON.parse(localStorage.getItem(PIN_KEY) || "null");
  } catch {
    return null;
  }
}

function resetPinFailures() {
  localStorage.removeItem(FAILED_ATTEMPTS_KEY);
  localStorage.removeItem(LOCK_UNTIL_KEY);
}

function recordActivity() {
  if (isDeviceLockEnabled() && isSessionUnlocked()) {
    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  }
}

export function supportsBiometrics() {
  return Boolean(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
}

export function hasBiometricLock() {
  return Boolean(localStorage.getItem(BIOMETRIC_KEY));
}

export function hasPinLock() {
  return Boolean(readStoredPin());
}

export function getPinLength() {
  const stored = readStoredPin();
  if (!stored) return PIN_LENGTH;
  return stored.digits === PIN_LENGTH ? PIN_LENGTH : LEGACY_PIN_LENGTH;
}

export function hasLegacyPinLock() {
  return hasPinLock() && getPinLength() !== PIN_LENGTH;
}

export function isDeviceLockEnabled() {
  return localStorage.getItem(LOCK_ENABLED_KEY) === "true" && (hasPinLock() || hasBiometricLock());
}

export function isSessionUnlocked() {
  if (sessionStorage.getItem(SESSION_UNLOCK_KEY) !== "true") return false;
  const lastActivity = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY) || 0);
  if (lastActivity && Date.now() - lastActivity >= INACTIVITY_LIMIT_MS) {
    lockSession();
    return false;
  }
  return true;
}

export function markSessionUnlocked() {
  sessionStorage.setItem(SESSION_UNLOCK_KEY, "true");
  sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

export function lockSession() {
  sessionStorage.removeItem(SESSION_UNLOCK_KEY);
  sessionStorage.removeItem(LAST_ACTIVITY_KEY);
}

export function disableDeviceLock() {
  localStorage.removeItem(BIOMETRIC_KEY);
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(LOCK_ENABLED_KEY);
  resetPinFailures();
  markSessionUnlocked();
}

export async function setPin(pin) {
  if (!/^\d{4}$/.test(pin)) throw new Error("Use a 4-digit PIN.");
  const salt = toBase64(randomBytes(18));
  const hash = await digest(`${salt}:${pin}`);
  localStorage.setItem(PIN_KEY, JSON.stringify({ salt, hash, digits: PIN_LENGTH, version: 2 }));
  localStorage.setItem(LOCK_ENABLED_KEY, "true");
  resetPinFailures();
  markSessionUnlocked();
}

export async function verifyPin(pin) {
  const lockUntil = Number(localStorage.getItem(LOCK_UNTIL_KEY) || 0);
  if (lockUntil > Date.now()) return false;
  if (lockUntil) resetPinFailures();

  const stored = readStoredPin();
  const digits = getPinLength();
  if (!stored || !(new RegExp(`^\\d{${digits}}$`)).test(pin)) return false;

  const hash = await digest(`${stored.salt}:${pin}`);
  const valid = hash === stored.hash;
  if (valid) {
    resetPinFailures();
    markSessionUnlocked();
    return true;
  }

  const failures = Number(localStorage.getItem(FAILED_ATTEMPTS_KEY) || 0) + 1;
  if (failures >= MAX_PIN_FAILURES) {
    localStorage.setItem(LOCK_UNTIL_KEY, String(Date.now() + PIN_LOCKOUT_MS));
    localStorage.setItem(FAILED_ATTEMPTS_KEY, "0");
  } else {
    localStorage.setItem(FAILED_ATTEMPTS_KEY, String(failures));
  }
  return false;
}

export async function registerBiometricLock(user) {
  if (!supportsBiometrics()) throw new Error("Biometric unlock is not supported in this browser.");
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(),
      rp: { name: "Apex HQ" },
      user: {
        id: new TextEncoder().encode(user.uid),
        name: user.email || "Apex HQ owner",
        displayName: "Brad - Apex Detailers"
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 }
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required"
      },
      timeout: 60000,
      attestation: "none"
    }
  });

  if (!credential) throw new Error("Biometric setup was cancelled.");
  localStorage.setItem(BIOMETRIC_KEY, toBase64(credential.rawId));
  localStorage.setItem(LOCK_ENABLED_KEY, "true");
  resetPinFailures();
  markSessionUnlocked();
}

export async function verifyBiometricLock() {
  const credentialId = localStorage.getItem(BIOMETRIC_KEY);
  if (!credentialId) return false;
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(),
      allowCredentials: [{ type: "public-key", id: fromBase64(credentialId) }],
      userVerification: "required",
      timeout: 60000
    }
  });
  const valid = Boolean(assertion);
  if (valid) {
    resetPinFailures();
    markSessionUnlocked();
  }
  return valid;
}

if (typeof window !== "undefined") {
  let lastWrite = 0;
  const activity = () => {
    const now = Date.now();
    if (now - lastWrite < 5000) return;
    lastWrite = now;
    recordActivity();
  };
  ["pointerdown", "keydown", "touchstart", "scroll"].forEach(eventName => {
    window.addEventListener(eventName, activity, { passive: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      if (!isSessionUnlocked() && isDeviceLockEnabled()) window.location.reload();
      else activity();
    }
  });
  window.setInterval(() => {
    if (isDeviceLockEnabled() && sessionStorage.getItem(SESSION_UNLOCK_KEY) === "true" && !isSessionUnlocked()) {
      window.location.reload();
    }
  }, 15000);
}
