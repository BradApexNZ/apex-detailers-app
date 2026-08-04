const PRIVACY_KEY = "apex.hq.privacyMode";
const DEFAULT_PRIVACY_ON = true;
const CLOUD_ENABLED = import.meta.env.VITE_APEX_CLOUD_ENABLED === "true";

function injectShowcaseStyles() {
  if (document.getElementById("apex-showcase-styles")) return;

  const style = document.createElement("style");
  style.id = "apex-showcase-styles";
  style.textContent = `
    .apexPrivacySetting {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
    }

    .apexPrivacySettingCopy {
      min-width: 0;
    }

    .apexPrivacySettingCopy h3 {
      margin-bottom: 6px !important;
    }

    .apexPrivacySettingCopy p {
      margin: 0 !important;
      color: #aaa69e !important;
      font-size: 12px !important;
      line-height: 1.5;
    }

    .apexPrivacySwitch {
      position: relative;
      flex: 0 0 auto;
      width: 58px !important;
      min-width: 58px !important;
      height: 32px !important;
      min-height: 32px !important;
      padding: 0 !important;
      border: 1px solid rgba(255,255,255,.15) !important;
      border-radius: 999px !important;
      background: #252a30 !important;
      box-shadow: none !important;
      transform: none !important;
      overflow: hidden !important;
    }

    .apexPrivacySwitch::after {
      content: "";
      position: absolute;
      top: 3px;
      left: 3px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #f4f3ee;
      box-shadow: 0 2px 8px rgba(0,0,0,.35);
      transition: transform .18s ease;
    }

    .apexPrivacySwitch[aria-checked="true"] {
      border-color: rgba(244,201,0,.5) !important;
      background: rgba(244,201,0,.24) !important;
    }

    .apexPrivacySwitch[aria-checked="true"]::after {
      transform: translateX(26px);
      background: #f4c900;
    }

    .apexPrivacyMode .customerGrid article h3,
    .apexPrivacyMode .customerGrid article header span,
    .apexPrivacyMode .customerGrid article p,
    .apexPrivacyMode .customerGrid article footer,
    .apexPrivacyMode .request h3,
    .apexPrivacyMode .request header span,
    .apexPrivacyMode .request p,
    .apexPrivacyMode .request blockquote,
    .apexPrivacyMode .agenda > div,
    .apexPrivacyMode .job > div,
    .apexPrivacyMode .job > strong,
    .apexPrivacyMode .command > article b,
    .apexPrivacyMode .command > article h3,
    .apexPrivacyMode .command > article p,
    .apexPrivacyMode .stats article:nth-child(3) b {
      filter: blur(7px);
      user-select: none;
      transition: filter .18s ease;
    }

    .apexPrivacyMode .customerGrid article:hover h3,
    .apexPrivacyMode .customerGrid article:hover header span,
    .apexPrivacyMode .customerGrid article:hover p,
    .apexPrivacyMode .customerGrid article:hover footer,
    .apexPrivacyMode .request:hover h3,
    .apexPrivacyMode .request:hover header span,
    .apexPrivacyMode .request:hover p,
    .apexPrivacyMode .request:hover blockquote,
    .apexPrivacyMode .agenda:hover > div,
    .apexPrivacyMode .job:hover > div,
    .apexPrivacyMode .job:hover > strong {
      filter: blur(7px);
    }

    .gate input[inputmode="numeric"],
    .settings input[inputmode="numeric"],
    .apexSecurityForm input[inputmode="numeric"] {
      -webkit-text-security: disc;
      text-security: disc;
      letter-spacing: .32em;
    }

    .apexCloudPaused {
      opacity: .58 !important;
      cursor: not-allowed !important;
      filter: grayscale(.2) !important;
    }

    .apexCloudNotice {
      margin: 12px 0 0 !important;
      padding: 10px 11px;
      border: 1px solid rgba(244,201,0,.2);
      border-radius: 10px;
      background: rgba(244,201,0,.055);
      color: #d8c76b !important;
      font-size: 10px !important;
      line-height: 1.45;
    }

    @media (max-width: 720px) {
      .apexPrivacySetting {
        align-items: center;
      }
    }
  `;
  document.head.appendChild(style);
}

function readPrivacyPreference() {
  const saved = localStorage.getItem(PRIVACY_KEY);
  if (saved === null) return DEFAULT_PRIVACY_ON;
  return saved === "true";
}

function updatePrivacyControl(control, enabled) {
  control.setAttribute("aria-checked", String(enabled));
  control.setAttribute("aria-label", enabled ? "Turn Privacy Mode off" : "Turn Privacy Mode on");
  control.title = enabled
    ? "Privacy Mode is on. Customer details are blurred."
    : "Privacy Mode is off. Customer details are visible.";
}

function applyPrivacyMode(enabled) {
  document.body.classList.toggle("apexPrivacyMode", enabled);
  localStorage.setItem(PRIVACY_KEY, String(enabled));

  document.querySelectorAll("[data-apex-privacy-setting]").forEach(control => {
    updatePrivacyControl(control, enabled);
  });
}

function ensurePrivacySetting() {
  document.querySelectorAll("[data-apex-privacy], .apexPrivacyToggle").forEach(button => button.remove());

  const settings = document.querySelector(".settings");
  if (!settings) return;

  let section = settings.querySelector("[data-apex-privacy-section]");
  if (!section) {
    section = document.createElement("section");
    section.dataset.apexPrivacySection = "true";
    section.className = "apexPrivacySetting";
    section.innerHTML = `
      <div class="apexPrivacySettingCopy">
        <h3>Privacy Mode</h3>
        <p>Blur customer, vehicle, job and revenue details when recording or showing the app to someone.</p>
      </div>
      <button type="button" class="apexPrivacySwitch" role="switch" data-apex-privacy-setting="true"></button>
    `;

    const control = section.querySelector("[data-apex-privacy-setting]");
    control.addEventListener("click", () => {
      applyPrivacyMode(!document.body.classList.contains("apexPrivacyMode"));
    });

    settings.prepend(section);
  }

  const control = section.querySelector("[data-apex-privacy-setting]");
  if (control) updatePrivacyControl(control, document.body.classList.contains("apexPrivacyMode"));
}

function maskPinInputs(root = document) {
  root.querySelectorAll(
    '.gate input[inputmode="numeric"], .settings input[inputmode="numeric"], .apexSecurityForm input[inputmode="numeric"]'
  ).forEach(input => {
    if (input.type !== "password") input.type = "password";
    const autocomplete = input.closest(".gate") ? "current-password" : "new-password";
    if (input.autocomplete !== autocomplete) input.autocomplete = autocomplete;
    if (!input.getAttribute("aria-label")) input.setAttribute("aria-label", "Apex HQ PIN");
  });
}

function pauseControl(button, label) {
  if (!button || button.dataset.apexCloudPaused) return;
  button.dataset.apexCloudPaused = "true";
  button.disabled = true;
  button.classList.add("apexCloudPaused");
  button.title = "Available after the future cloud upgrade";
  if (label) button.textContent = label;
}

function pauseCloudSections(root = document) {
  if (CLOUD_ENABLED) return;

  root.querySelectorAll("button").forEach(button => {
    if (button.dataset.apexPrivacySetting || button.dataset.apexInstall) return;
    const label = button.textContent.trim().toLowerCase();

    if (label.includes("booking")) {
      pauseControl(button, "Booking upgrade");
    } else if (label === "confirm" || label === "decline") {
      pauseControl(button);
    } else if (label === "sync" || label.includes("connect calendar") || label.includes("refresh status")) {
      pauseControl(button);
    }
  });

  root.querySelectorAll(".settings > section").forEach(section => {
    if (section.dataset.apexPrivacySection) return;
    const heading = section.querySelector("h3")?.textContent.trim().toLowerCase();
    if (heading !== "online booking" && heading !== "google calendar") return;

    section.querySelectorAll("input, select, button").forEach(control => {
      if (control.tagName === "BUTTON") pauseControl(control);
      else if (!control.disabled) {
        control.disabled = true;
        control.classList.add("apexCloudPaused");
      }
    });

    if (!section.querySelector("[data-apex-cloud-notice]")) {
      const note = document.createElement("p");
      note.className = "apexCloudNotice";
      note.dataset.apexCloudNotice = "true";
      note.textContent = "Planned cloud upgrade. No paid Calendar, email or Functions automation is active.";
      section.appendChild(note);
    }
  });
}

function refreshShowcaseLayer() {
  injectShowcaseStyles();
  maskPinInputs();
  ensurePrivacySetting();
  pauseCloudSections();
}

let showcaseFrame = 0;
let showcaseObserver = null;

function observeShowcaseChanges() {
  showcaseObserver?.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function scheduleShowcaseRefresh() {
  if (showcaseFrame) return;

  showcaseFrame = requestAnimationFrame(() => {
    showcaseFrame = 0;
    showcaseObserver?.disconnect();
    refreshShowcaseLayer();
    observeShowcaseChanges();
  });
}

injectShowcaseStyles();
applyPrivacyMode(readPrivacyPreference());
refreshShowcaseLayer();

showcaseObserver = new MutationObserver(scheduleShowcaseRefresh);
observeShowcaseChanges();
