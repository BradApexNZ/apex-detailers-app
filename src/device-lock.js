const BIOMETRIC_KEY = "apex-hq-biometric-credential";
const PIN_KEY = "apex-hq-pin";
const LOCK_ENABLED_KEY = "apex-hq-device-lock-enabled";
const SESSION_UNLOCK_KEY = "apex-hq-session-unlocked";

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

export function supportsBiometrics() {
  return Boolean(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
}

export function hasBiometricLock() {
  return Boolean(localStorage.getItem(BIOMETRIC_KEY));
}

export function hasPinLock() {
  return Boolean(localStorage.getItem(PIN_KEY));
}

export function isDeviceLockEnabled() {
  return localStorage.getItem(LOCK_ENABLED_KEY) === "true" && (hasPinLock() || hasBiometricLock());
}

export function isSessionUnlocked() {
  return sessionStorage.getItem(SESSION_UNLOCK_KEY) === "true";
}

export function markSessionUnlocked() {
  sessionStorage.setItem(SESSION_UNLOCK_KEY, "true");
}

export function lockSession() {
  sessionStorage.removeItem(SESSION_UNLOCK_KEY);
}

export function disableDeviceLock() {
  localStorage.removeItem(BIOMETRIC_KEY);
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(LOCK_ENABLED_KEY);
  markSessionUnlocked();
}

export async function setPin(pin) {
  if (!/^\d{4,6}$/.test(pin)) throw new Error("Use a 4–6 digit PIN.");
  const salt = toBase64(randomBytes(18));
  const hash = await digest(`${salt}:${pin}`);
  localStorage.setItem(PIN_KEY, JSON.stringify({ salt, hash }));
  localStorage.setItem(LOCK_ENABLED_KEY, "true");
  markSessionUnlocked();
}

export async function verifyPin(pin) {
  const stored = JSON.parse(localStorage.getItem(PIN_KEY) || "null");
  if (!stored) return false;
  const hash = await digest(`${stored.salt}:${pin}`);
  const valid = hash === stored.hash;
  if (valid) markSessionUnlocked();
  return valid;
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
        displayName: "Brad — Apex Detailers"
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
  if (valid) markSessionUnlocked();
  return valid;
}
