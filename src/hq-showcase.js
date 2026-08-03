const PRIVACY_KEY = "apex.hq.privacyMode";
const DEFAULT_PRIVACY_ON = true;

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
  button.setAttribute("aria-pressed", String(enabled));
  button.textContent = enabled ? "Privacy on" : "Privacy off";
  button.title = enabled
    ? "Customer details are blurred for recording"
    : "Customer details are visible";
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
    input.type = "password";
    input.autocomplete = "current-password";
    input.setAttribute("aria-label", input.getAttribute("aria-label") || "Apex HQ PIN");
  });
}

function refreshShowcaseLayer() {
  injectShowcaseStyles();
  maskPinInputs();
  ensurePrivacyToggle();
}

injectShowcaseStyles();
applyPrivacyMode(readPrivacyPreference());
refreshShowcaseLayer();

new MutationObserver(refreshShowcaseLayer).observe(document.body, {
  childList: true,
  subtree: true
});
