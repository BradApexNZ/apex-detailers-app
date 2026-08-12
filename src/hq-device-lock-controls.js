import { auth } from "./firebase";
import {
  disableDeviceLock,
  hasBiometricLock,
  hasPinLock,
  isDeviceLockEnabled,
  lockSession,
  markSessionUnlocked,
  registerBiometricLock,
  setPin,
  supportsBiometrics
} from "./device-lock";

function lockLabel() {
  if (!isDeviceLockEnabled()) return "Device lock off";
  const parts = [];
  if (hasPinLock()) parts.push("PIN");
  if (hasBiometricLock()) parts.push("biometric");
  return `${parts.join(" + ")} enabled`;
}

function closePinModal() {
  document.querySelector("[data-apex-pin-modal]")?.remove();
}

function openPinModal() {
  closePinModal();
  const back = document.createElement("div");
  back.className = "apexPinBackdrop";
  back.dataset.apexPinModal = "true";
  back.innerHTML = `
    <section class="apexPinModal" role="dialog" aria-modal="true" aria-label="Set Apex HQ PIN">
      <h3>Set your Apex PIN</h3>
      <p>Use a 4-digit PIN for quick daily access on this device. Your full Firebase sign-in remains the account security layer.</p>
      <div class="apexPinDots">
        <input inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="PIN digit 1">
        <input inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="PIN digit 2">
        <input inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="PIN digit 3">
        <input inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="PIN digit 4">
      </div>
      <div class="apexPinError" data-pin-error></div>
      <div class="apexPinModalActions">
        <button type="button" data-pin-cancel>Cancel</button>
        <button type="button" class="apexPinPrimary" data-pin-save>Save PIN</button>
      </div>
    </section>`;
  document.body.appendChild(back);
  const inputs = [...back.querySelectorAll(".apexPinDots input")];
  const error = back.querySelector("[data-pin-error]");
  const save = back.querySelector("[data-pin-save]");
  inputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(-1);
      if (input.value && index < inputs.length - 1) inputs[index + 1].focus();
    });
    input.addEventListener("keydown", event => {
      if (event.key === "Backspace" && !input.value && index > 0) inputs[index - 1].focus();
      if (event.key === "Enter") save.click();
    });
  });
  back.querySelector("[data-pin-cancel]").addEventListener("click", closePinModal);
  back.addEventListener("mousedown", event => {
    if (event.target === back) closePinModal();
  });
  save.addEventListener("click", async () => {
    const pin = inputs.map(input => input.value).join("");
    if (!/^\d{4}$/.test(pin)) {
      error.textContent = "Enter all four digits.";
      return;
    }
    save.disabled = true;
    try {
      await setPin(pin);
      markSessionUnlocked();
      closePinModal();
      ensureCard(true);
    } catch (cause) {
      error.textContent = cause?.message || "PIN could not be saved.";
      save.disabled = false;
    }
  });
  inputs[0]?.focus();
}

async function enableBiometric(button) {
  const user = auth.currentUser;
  if (!user) return;
  button.disabled = true;
  try {
    await registerBiometricLock(user);
    ensureCard(true);
  } catch (error) {
    window.alert(error?.message || "Biometric setup could not be completed.");
  } finally {
    button.disabled = false;
  }
}

function ensureCard(force = false) {
  const settings = document.querySelector(".settings") || document.querySelector("[data-section='settings']");
  if (!settings) return;
  let card = settings.querySelector("[data-apex-device-lock-card]");
  if (card && !force) return;
  card?.remove();
  card = document.createElement("section");
  card.className = "apexDeviceLockCard";
  card.dataset.apexDeviceLockCard = "true";
  card.innerHTML = `
    <h3>Quick device unlock</h3>
    <p>Keep your Firebase account signed in, then use a local PIN or your phone's biometric unlock for fast daily access. Apex HQ auto-locks after inactivity.</p>
    <span class="apexDeviceLockStatus">${lockLabel()}</span>
    <div class="apexDeviceLockActions">
      <button type="button" class="primary" data-device-pin>${hasPinLock() ? "Change 4-digit PIN" : "Set 4-digit PIN"}</button>
      ${supportsBiometrics() ? `<button type="button" data-device-bio>${hasBiometricLock() ? "Biometric enabled" : "Enable biometric"}</button>` : ""}
      <button type="button" data-device-lock-now>Lock now</button>
      ${isDeviceLockEnabled() ? `<button type="button" class="danger" data-device-disable>Disable quick unlock</button>` : ""}
    </div>`;
  settings.appendChild(card);
  card.querySelector("[data-device-pin]")?.addEventListener("click", openPinModal);
  card.querySelector("[data-device-bio]")?.addEventListener("click", event => enableBiometric(event.currentTarget));
  card.querySelector("[data-device-lock-now]")?.addEventListener("click", () => {
    if (!isDeviceLockEnabled()) {
      openPinModal();
      return;
    }
    lockSession();
    window.location.reload();
  });
  card.querySelector("[data-device-disable]")?.addEventListener("click", () => {
    if (!window.confirm("Disable PIN/biometric quick unlock on this device?")) return;
    disableDeviceLock();
    ensureCard(true);
  });
}

const observer = new MutationObserver(() => ensureCard());
observer.observe(document.documentElement, { childList: true, subtree: true });
ensureCard();
