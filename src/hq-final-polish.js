const TEXT_REPLACEMENTS = new Map([
  ["Booking upgrade", "New Booking"],
  ["Privacy off", "Privacy mode off"],
  ["Privacy on", "Privacy mode on"],
  ["Command", "Overview"],
  ["Enable Face ID?", "Set up Face ID unlock"],
  ["Use PIN only", "Not now — use PIN"],
]);

function replaceTextNodes(root = document) {
  const walker = document.createTreeWalker(root.body || root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const original = node.textContent;
    const trimmed = original.trim();
    if (!trimmed) continue;

    let next = original;
    for (const [from, to] of TEXT_REPLACEMENTS) {
      if (trimmed === from) next = original.replace(from, to);
    }

    if (next !== original) node.textContent = next;
  }
}

function classifyActions(root = document) {
  root.querySelectorAll("button, a").forEach(control => {
    const label = control.textContent.trim().toLowerCase();
    control.classList.toggle("apexNewBooking", label === "new booking" || label.includes("add confirmed booking"));
    control.classList.toggle("apexPrivacyControl", label.includes("privacy mode"));
  });
}

function refineFaceIdCopy(root = document) {
  root.querySelectorAll(".apexSecurityCard").forEach(card => {
    const heading = card.querySelector("h2");
    const paragraph = card.querySelector("p");
    if (!heading || !paragraph || !/face id/i.test(card.textContent)) return;

    if (/enable face id|set up face id/i.test(heading.textContent)) {
      heading.textContent = "Set up Face ID unlock";
      paragraph.textContent = "Face ID will unlock Apex HQ on this iPhone after your secure sign-in. Apple verifies you on the device; Apex never receives or stores your face data. Your 4-digit PIN remains the backup.";
    }
  });

  root.querySelectorAll(".gate button").forEach(button => {
    if (/unlock with face id/i.test(button.textContent)) button.textContent = "Unlock Apex HQ with Face ID";
  });
}

function addDashboardSemantics(root = document) {
  root.querySelectorAll(".command > div").forEach(card => card.setAttribute("aria-label", "Today overview"));
  root.querySelectorAll(".stats > article").forEach(card => card.classList.add("apexMetricCard"));
}

function polish(root = document) {
  replaceTextNodes(root);
  classifyActions(root);
  refineFaceIdCopy(root);
  addDashboardSemantics(root);
}

let scheduled = false;
function schedulePolish() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    polish();
  });
}

polish();
new MutationObserver(schedulePolish).observe(document.body, { childList: true, subtree: true });
