const SAFARI_SAFE_LOGO = "/assets/apex-logo-safari.svg";

function applyApexLogo() {
  document.querySelectorAll('.hqBrand img').forEach((image) => {
    if (image.getAttribute('src') !== SAFARI_SAFE_LOGO) {
      image.setAttribute('src', SAFARI_SAFE_LOGO);
    }
  });
}

applyApexLogo();
new MutationObserver(applyApexLogo).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
