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
      .replaceAll("TODAY'S COMMAND DECK", "TODAY");

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

function polishApexHq(root = document) {
  document.title = "Apex HQ";
  cleanVisibleText(root);

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
}

async function removeLegacyPwaState() {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(registrations.map(registration => registration.unregister().catch(() => false)));
  }

  if ("caches" in window) {
    const keys = await caches.keys().catch(() => []);
    await Promise.all(
      keys
        .filter(key => key.toLowerCase().includes("apex-hq"))
        .map(key => caches.delete(key).catch(() => false))
    );
  }
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

polishApexHq();
removeLegacyPwaState();

new MutationObserver(schedulePolish).observe(document.body, {
  childList: true,
  subtree: true
});
