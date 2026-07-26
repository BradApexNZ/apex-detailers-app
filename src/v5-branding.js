// Temporary compatibility layer while the Apex HQ interface is being rebuilt.
// Keeps all visible version labels aligned to the current V5 release.
function applyV5Branding(root = document.body) {
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach(node => {
    if (node.nodeValue && /Apex HQ V4|\bV4\b/.test(node.nodeValue)) {
      node.nodeValue = node.nodeValue
        .replaceAll("Apex HQ V4", "Apex HQ V5")
        .replace(/\bV4\b/g, "V5");
    }
  });
}

applyV5Branding();

const observer = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (/Apex HQ V4|\bV4\b/.test(node.nodeValue || "")) {
          node.nodeValue = (node.nodeValue || "")
            .replaceAll("Apex HQ V4", "Apex HQ V5")
            .replace(/\bV4\b/g, "V5");
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        applyV5Branding(node);
      }
    });
  }
});

observer.observe(document.body, { childList: true, subtree: true });
