import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import {
  getPinLength,
  hasBiometricLock,
  hasPinLock,
  isDeviceLockEnabled,
  isSessionUnlocked,
  markSessionUnlocked,
  setPin,
  verifyBiometricLock,
  verifyPin
} from "./device-lock";

const GUARD_ID = "apex-launch-auth-guard";

function removeGuard() {
  document.getElementById(GUARD_ID)?.remove();
  document.documentElement.classList.remove("apex-auth-guarded");
}

function pinInputs(mode) {
  const count = mode === "unlock" ? getPinLength() : 4;
  return Array.from(
    { length: count },
    (_, index) =>
      `<input inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="one-time-code" aria-label="PIN digit ${index + 1}">`
  ).join("");
}

function createGuard(user, mode) {
  removeGuard();
  document.documentElement.classList.add("apex-auth-guarded");

  const guard = document.createElement("div");
  guard.id = GUARD_ID;
  guard.className = "apexLaunchAuthGuard";
  guard.innerHTML = `
    <main class="apexLaunchAuthCard" role="dialog" aria-modal="true" aria-label="Apex HQ secure access">
      <div class="apexLaunchAuthBrand">
        <img src="/apex-logo-official.svg" alt="Apex Detailers">
        <div><strong>APEX DETAILERS</strong><span>PRIVATE HQ</span></div>
      </div>
      <span class="apexLaunchAuthEyebrow">${mode === "setup" ? "SECURE THIS DEVICE" : "WELCOME BACK"}</span>
      <h1>${mode === "setup" ? "Create your Apex PIN." : "Unlock Apex HQ."}</h1>
      <p>${mode === "setup" ? "Set a 4-digit PIN for fast daily access on this phone. Your Firebase sign-in remains underneath it." : `Enter your ${getPinLength()}-digit Apex PIN to continue.`}</p>
      <div class="apexLaunchPinInputs" data-pin-inputs>${pinInputs(mode)}</div>
      <div class="apexLaunchAuthError" data-auth-error></div>
      <button type="button" class="apexLaunchPrimary" data-auth-submit>${mode === "setup" ? "Save PIN & enter HQ" : "Unlock HQ"}</button>
      ${mode === "unlock" && hasBiometricLock() ? `<button type="button" class="apexLaunchSecondary" data-auth-biometric>Use phone biometric</button>` : ""}
      <button type="button" class="apexLaunchText" data-auth-signout>Sign out of ${user.email || "Apex HQ"}</button>
    </main>`;
  document.body.appendChild(guard);

  const inputs = [...guard.querySelectorAll("[data-pin-inputs] input")];
  const submit = guard.querySelector("[data-auth-submit]");
  const error = guard.querySelector("[data-auth-error]");

  const readPin = () => inputs.map(input => input.value).join("");
  const focusFirstEmpty = () => (inputs.find(input => !input.value) || inputs[inputs.length - 1])?.focus();

  inputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(-1);
      error.textContent = "";
      if (input.value && index < inputs.length - 1) inputs[index + 1].focus();
      if (readPin().length === inputs.length) submit.focus();
    });
    input.addEventListener("keydown", event => {
      if (event.key === "Backspace" && !input.value && index > 0) inputs[index - 1].focus();
      if (event.key === "Enter") submit.click();
    });
  });

  submit.addEventListener("click", async () => {
    const pin = readPin();
    if (!new RegExp(`^\\d{${inputs.length}}$`).test(pin)) {
      error.textContent = `Enter all ${inputs.length} digits.`;
      focusFirstEmpty();
      return;
    }
    submit.disabled = true;
    try {
      if (mode === "setup") await setPin(pin);
      else if (!(await verifyPin(pin))) throw new Error("That PIN is not correct.");
      markSessionUnlocked();
      removeGuard();
    } catch (cause) {
      error.textContent = cause?.message || "Apex HQ could not be unlocked.";
      inputs.forEach(input => {
        input.value = "";
      });
      inputs[0]?.focus();
      submit.disabled = false;
    }
  });

  guard.querySelector("[data-auth-biometric]")?.addEventListener("click", async event => {
    event.currentTarget.disabled = true;
    try {
      if (!(await verifyBiometricLock())) throw new Error("Biometric unlock was not completed.");
      markSessionUnlocked();
      removeGuard();
    } catch (cause) {
      error.textContent = cause?.message || "Biometric unlock was cancelled.";
      event.currentTarget.disabled = false;
    }
  });

  guard.querySelector("[data-auth-signout]").addEventListener("click", async () => {
    await signOut(auth);
    removeGuard();
  });

  setTimeout(() => inputs[0]?.focus(), 50);
}

onAuthStateChanged(auth, user => {
  if (!user) {
    removeGuard();
    return;
  }
  if (!hasPinLock()) {
    createGuard(user, "setup");
    return;
  }
  if (isDeviceLockEnabled() && !isSessionUnlocked()) {
    createGuard(user, "unlock");
    return;
  }
  removeGuard();
});
