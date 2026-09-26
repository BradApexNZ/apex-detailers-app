import { bookingAddons, publicServicePackages } from "./booking-data";

const serviceAreas = ["Napier", "Hastings", "Havelock North", "Taradale", "Ahuriri", "Poraiti"];

// Mirrors functions/index.js's vehicleTypes/priceFor exactly, for the rare
// case getPublicBookingConfig itself is unreachable. Keep these two in sync
// if the pricing rules ever change - this table only shows if the live call
// fails, submitting a real booking always goes through the server's own
// priceFor() regardless of what this displays.
const vehicleTypes = [
  { id: "small", label: "Sedan / hatch", adjustment: 0 },
  { id: "suv", label: "SUV / wagon", adjustment: 0 },
  { id: "singlecab", label: "Single-cab ute", adjustment: 0 },
  { id: "extracab", label: "Extra-cab ute", adjustment: 0 },
  { id: "doublecab", label: "Double-cab ute", adjustment: 0 },
  { id: "cargovan", label: "Cargo van (no rear seats)", adjustment: 0 },
  { id: "passengervan", label: "Passenger van (with seats)", adjustment: null },
  { id: "large", label: "7-seater / large SUV (Land Cruiser, Prado, Everest, Patrol)", adjustment: null },
  { id: "americantruck", label: "American-size truck (Ram, F-150, Silverado)", adjustment: null },
  { id: "other", label: "Other (truck, boat, digger, tractor, caravan)", adjustment: null }
];
const TRADIE_TIER_PRICE = { singlecab: 199, cargovan: 199, extracab: 219, doublecab: 269, large: 269, americantruck: 319 };

function priceFor(service, vehicle) {
  if (service.id === "tradie") return TRADIE_TIER_PRICE[vehicle.id] ?? (vehicle.adjustment == null ? null : service.price + vehicle.adjustment);
  if (vehicle.adjustment == null) return null;
  return service.price + vehicle.adjustment;
}

export async function fallbackConfig() {
  const pricing = {};
  for (const service of publicServicePackages) {
    pricing[service.id] = {};
    for (const vehicle of vehicleTypes) pricing[service.id][vehicle.id] = priceFor(service, vehicle);
  }
  return {
    enabled: true,
    minimumNoticeHours: 24,
    bookingWindowDays: 60,
    serviceAreas,
    note: "Your selected time is submitted as a booking request until Apex confirms the vehicle details and final price.",
    services: publicServicePackages,
    vehicleTypes,
    addons: bookingAddons,
    pricing
  };
}
