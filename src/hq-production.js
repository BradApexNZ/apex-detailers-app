const BRAND_LOGO = "/assets/apex-logo-official.svg";

const textReplacements = new Map([
  ["HQ / V5", "Operations Centre"],
  ["TODAY'S COMMAND DECK", "TODAY"],
  ["âŒ¾ Lock HQ", "Lock HQ"],
  ["â†’ Sign out", "Sign out"],
  ["ï¼‹ Booking", "+ Booking"],
  ["ï¼‹ Add booking", "+ Add booking"],
  ["ï¼‹ Add customer", "+ Add customer"],
  ["Loadingâ€¦", "Loading…"]
]);

function cleanText(value) {
  let output = value;

  for (const [broken, fixed] of textReplacements) {
    output = output.replaceAll(broken, fixed);
  }

  return output
    .replaceAll("Â·", "·")
    .replaceAll("ï¼‹", "+")
    .replaceAll("â—†", "◆")
    .replaceAll("â†’", "→")
    .replaceAll("â€¦", "…");
}

function replaceButtonLabel(button, from, to) {
  for (const node of button.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.includes(from)) {
      node.textContent = node.textContent.replace(from, to);
    }
  }
}

function polishApexHq(root = document) {
  document.title = "Apex HQ";

  root.querySelectorAll(".hqBrand img").forEach(image => {
    if (image.dataset.apexLogoReady) return;

    image.dataset.apexLogoReady = "true";
    image.alt = "Apex Detailers";
    image.src = BRAND_LOGO;
    image.addEventListener("error", () => {
      image.classList.add("logoUnavailable");
    }, { once: true });
  });

  root.querySelectorAll(".hqBrand span").forEach(label => {
    label.textContent = "Operations Centre";
  });

  root.querySelectorAll("aside nav button, .mobile button").forEach(button => {
    replaceButtonLabel(button, "Command", "Overview");
  });

  root.querySelectorAll(".top h1").forEach(title => {
    if (title.textContent.trim() === "Command") title.textContent = "Overview";
  });

  const walker = document.createTreeWalker(root.body || root, NodeFilter.SHOW_TEXT);
  const nodes = [];

  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const cleaned = cleanText(node.textContent);
    if (cleaned !== node.textContent) node.textContent = cleaned;
  }
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

polishApexHq();
removeLegacyPwaState();

new MutationObserver(() => polishApexHq()).observe(document.body, {
  childList: true,
  subtree: true
});
