const OLD_QUOTE_FOOTER = "This includes Apex launch pricing. Access to an outside tap is required.";
const SAFE_QUOTE_FOOTER = "Final pricing may vary if the vehicle is heavily soiled or larger than expected. Access to an outside tap is required.";
const HEADLIGHT_LABEL = "Headlight Restoration";
const HEADLIGHT_PAUSED_LABEL = "Headlight Restoration paused";

function replaceLaunchPricingText(root = document.body) {
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodesToPatch = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeValue && node.nodeValue.includes(OLD_QUOTE_FOOTER)) {
      nodesToPatch.push(node);
    }
  }

  nodesToPatch.forEach(node => {
    node.nodeValue = node.nodeValue.replaceAll(OLD_QUOTE_FOOTER, SAFE_QUOTE_FOOTER);
  });
}

function pauseHeadlightButtons(root = document) {
  root.querySelectorAll("button").forEach(button => {
    const label = button.textContent || "";
    if (!label.includes(HEADLIGHT_LABEL) || button.dataset.apexHeadlightPaused === "true") return;

    button.dataset.apexHeadlightPaused = "true";
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    button.setAttribute("title", "Paused until the headlight restoration gear and process are ready.");
    button.textContent = HEADLIGHT_PAUSED_LABEL;
    button.style.opacity = "0.58";
    button.style.cursor = "not-allowed";
  });
}

function applyApexSafetyFixes() {
  replaceLaunchPricingText();
  pauseHeadlightButtons();
}

let scheduled = false;
function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    applyApexSafetyFixes();
  });
}

document.addEventListener(
  "click",
  event => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (!button) return;

    const label = button.textContent || "";
    if (label.includes(HEADLIGHT_LABEL) || label.includes(HEADLIGHT_PAUSED_LABEL)) {
      event.preventDefault();
      event.stopPropagation();
      window.alert("Headlight restoration is paused in Apex HQ until the gear and process are ready.");
    }
  },
  true
);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applyApexSafetyFixes, { once: true });
} else {
  applyApexSafetyFixes();
}

const observer = new MutationObserver(scheduleApply);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
