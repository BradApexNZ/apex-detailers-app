// Banking-style PIN lock for Apex Admin. The Google sign-in keeps the account
// signed in on this phone; the 4-digit PIN guards opening the app. The PIN never
// leaves the device: only a salted SHA-256 hash is kept, tied to the signed-in
// account. Five wrong PINs sign the account out completely.
const PIN_KEY = "apex-admin-pin";
const FAILURES_KEY = "apex-admin-pin-failures";
export const MAX_PIN_FAILURES = 5;
// Leaving the app for longer than this locks it again.
export const RELOCK_AFTER_MS = 60 * 1000;

const toBase64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));

async function digest(value) {
  return toBase64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function read() {
  try {
    return JSON.parse(localStorage.getItem(PIN_KEY) || "null");
  } catch {
    return null;
  }
}

export function hasPin(uid) {
  const stored = read();
  return Boolean(stored && stored.uid === uid && stored.hash);
}

export async function savePin(uid, pin) {
  if (!/^\d{4}$/.test(pin)) throw new Error("Use 4 digits.");
  const salt = toBase64(crypto.getRandomValues(new Uint8Array(18)));
  localStorage.setItem(PIN_KEY, JSON.stringify({ uid, salt, hash: await digest(`${uid}:${salt}:${pin}`) }));
  localStorage.removeItem(FAILURES_KEY);
}

// Returns { ok } or { ok: false, remaining } — remaining 0 means sign out now.
export async function checkPin(uid, pin) {
  const stored = read();
  if (!stored || stored.uid !== uid) return { ok: false, remaining: 0 };
  if ((await digest(`${uid}:${stored.salt}:${pin}`)) === stored.hash) {
    localStorage.removeItem(FAILURES_KEY);
    return { ok: true };
  }
  const failures = Number(localStorage.getItem(FAILURES_KEY) || 0) + 1;
  localStorage.setItem(FAILURES_KEY, String(failures));
  return { ok: false, remaining: Math.max(0, MAX_PIN_FAILURES - failures) };
}

export function clearPin() {
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(FAILURES_KEY);
}
