const vehiclePricing = {
  small: { adjustment: 0, label: "Sedan / hatch pricing applied" },
  suv: { adjustment: 15, label: "SUV / wagon pricing applied" },
  singlecab: { adjustment: 0, label: "Single-cab ute pricing applied" },
  doublecab: { adjustment: 25, label: "Double-cab ute pricing applied" },
  large: { adjustment: 40, label: "7-seater / large SUV pricing applied" },
  van: { adjustment: 60, label: "Van / oversized vehicle pricing applied" }
};

const money = value => `$${Number(value || 0).toFixed(0)}`;

function getVehicleSelect() {
  return [...document.querySelectorAll("select")].find(select => select.closest("label")?.textContent?.includes("Vehicle type"));
}

function rememberBasePrice(priceElement) {
  if (priceElement.dataset.apexBasePrice) return Number(priceElement.dataset.apexBasePrice);
  const match = priceElement.textContent.match(/\$([\d,]+)/);
  if (!match) return null;
  const price = Number(match[1].replace(/,/g, ""));
  priceElement.dataset.apexBasePrice = String(price);
  return price;
}

function animatePrice(element, nextText) {
  if (element.textContent === nextText) return;
  element.classList.remove("apexPriceChanged");
  void element.offsetWidth;
  element.textContent = nextText;
  element.classList.add("apexPriceChanged");
}

function ensurePricingNote(select, pricing) {
  const label = select.closest("label");
  if (!label) return;

  let note = label.parentElement?.querySelector(":scope > .apexVehiclePricingNote");
  if (!note) {
    note = document.createElement("div");
    note.className = "apexVehiclePricingNote";
    note.innerHTML = "<strong></strong><span>Final price may vary depending on vehicle condition and the work required.</span>";
    label.insertAdjacentElement("afterend", note);
  }

  note.querySelector("strong").textContent = pricing.label;
}

function updateServicePrices() {
  const select = getVehicleSelect();
  const vehicleType = select?.value || sessionStorage.getItem("apexVehicleType") || "small";
  const pricing = vehiclePricing[vehicleType] || vehiclePricing.small;

  if (select) {
    sessionStorage.setItem("apexVehicleType", vehicleType);
    ensurePricingNote(select, pricing);
  }

  document.querySelectorAll(".services button > b").forEach(element => {
    const basePrice = rememberBasePrice(element);
    if (basePrice == null) return;
    animatePrice(element, `from ${money(basePrice + pricing.adjustment)}`);
  });

  document.querySelectorAll(".summary b").forEach(element => {
    const basePrice = rememberBasePrice(element);
    if (basePrice == null) return;
    animatePrice(element, `from ${money(basePrice + pricing.adjustment)}`);
  });
}

function wirePricing() {
  const select = getVehicleSelect();
  if (select && select.dataset.apexPricingWired !== "true") {
    select.dataset.apexPricingWired = "true";
    const saved = sessionStorage.getItem("apexVehicleType");
    if (saved && vehiclePricing[saved]) {
      select.value = saved;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    select.addEventListener("change", updateServicePrices);
  }
  updateServicePrices();
}

const observer = new MutationObserver(wirePricing);
observer.observe(document.documentElement, { childList: true, subtree: true });
wirePricing();
