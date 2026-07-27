function patchSecurityUi(root = document) {
  root.querySelectorAll('input[placeholder="4–6 digits"]').forEach(input => {
    input.placeholder = "6 digits";
    input.minLength = 6;
    input.maxLength = 6;
    if (input.dataset.apexPinPatched) return;
    input.dataset.apexPinPatched = "true";
    const syncButton = () => {
      window.setTimeout(() => {
        const button = input.parentElement?.querySelector("button");
        if (button) button.disabled = input.value.length !== 6;
      }, 0);
    };
    input.addEventListener("input", syncButton);
    syncButton();
  });

  root.querySelectorAll(".gateCard .textButton").forEach(button => {
    button.textContent = "Forgot PIN? Sign out";
  });
}

patchSecurityUi();
new MutationObserver(() => patchSecurityUi()).observe(document.body, {
  childList: true,
  subtree: true
});
