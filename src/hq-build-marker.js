const PREVIEW = location.hostname.includes("--launch-pr-");

function tidyLegacyStatus() {
  document.querySelectorAll("body *").forEach(node => {
    if (node.children.length === 0 && node.textContent?.trim() === "Apex HQ Online") {
      const parent = node.closest("[data-apex-connection],.apexConnectionStatus,.status,.online") || node.parentElement;
      if (parent && !parent.closest(".apexLaunchAuthCard")) parent.remove();
    }
  });
}

function markPreview() {
  if (!PREVIEW || document.querySelector(".apexPreviewStamp")) return;
  const titleBlock = document.querySelector(".top>div:first-child");
  if (!titleBlock) return;
  const stamp = document.createElement("span");
  stamp.className = "apexPreviewStamp";
  stamp.textContent = "Launch preview";
  titleBlock.appendChild(stamp);
}

function refresh() {
  tidyLegacyStatus();
  markPreview();
}

new MutationObserver(refresh).observe(document.documentElement, { childList: true, subtree: true });
refresh();
