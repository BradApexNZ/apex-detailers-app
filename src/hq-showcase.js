const PRIVACY_KEY = "apex.hq.privacyMode";
const DEFAULT_PRIVACY_ON = true;
const CLOUD_ENABLED = import.meta.env.VITE_APEX_CLOUD_ENABLED === "true";

function injectShowcaseStyles() {
  if (document.getElementById("apex-showcase-styles")) return;

  const style = document.createElement("style");
  style.id = "apex-showcase-styles";
  style.textContent = `
    .apexPrivacyToggle {
      min-height: 36px !important;
      padding: 0 12px !important;
      border-color: rgba(255,255,255,.12) !important;
      background: #181d22 !important;
      color: #f4f3ee !important;
      font-size: 10px !important;
      white-space: nowrap;
    }

    .apexPrivacyToggle[aria-pressed="true"] {
      border-color: rgba(244,201,0,.36) !important;
      background: rgba(244,201,0,.1) !important;
      color: #f5da53 !important;
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
      .apexPrivacyToggle {
        min-height: 34px !important;
        padding-inline: 10px !important;
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

function updatePrivacyButton(button, enabled) {
  const pressed = String(enabled);
  const text = enabled ? "Privacy on" : "Privacy off";
  const title = enabled
    ? "Customer details are blurred for recording"
    : "Customer details are visible";

  if (button.getAttribute("aria-pressed") !== pressed) {
    button.setAttribute("aria-pressed", pressed);
  }
  if (button.textContent !== text) button.textContent = text;
  if (button.title !== title) button.title = title;
}

function applyPrivacyMode(enabled) {
  document.body.classList.toggle("apexPrivacyMode", enabled);
  localStorage.setItem(PRIVACY_KEY, String(enabled));

  const button = document.querySelector("[data-apex-privacy]");
  if (button) updatePrivacyButton(button, enabled);
}

function ensurePrivacyToggle() {
  const actions = document.querySelector(".top > div:last-child");
  if (!actions) return;

  let button = actions.querySelector("[data-apex-privacy]");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "secondaryTop apexPrivacyToggle";
    button.dataset.apexPrivacy = "true";
    button.addEventListener("click", () => {
      applyPrivacyMode(!document.body.classList.contains("apexPrivacyMode"));
    });
    actions.prepend(button);
  }

  updatePrivacyButton(button, document.body.classList.contains("apexPrivacyMode"));
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
    if (button.dataset.apexPrivacy || button.dataset.apexInstall) return;
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
  ensurePrivacyToggle();
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
