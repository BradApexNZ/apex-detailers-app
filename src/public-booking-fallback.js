import { publicServicePackages } from "./booking-data";

const serviceAreas = ["Napier", "Hastings", "Havelock North", "Taradale", "Ahuriri", "Poraiti"];

// Mirrors functions/index.js's vehicleTypes/priceFor exactly, for the rare
// case getPublicBookingConfig itself is unreachable. Keep these two in sync
// if the pricing rules ever change - this table only shows if the live call
// fails, submitting a real booking always goes through the server's own
// priceFor() regardless of what this displays.
const vehicleTypes = [
  { id: "small", label: "Sedan / hatch", adjustment: 0 },
  { id: "suv", label: "SUV / wagon", adjustment: 15 },
  { id: "singlecab", label: "Single-cab ute", adjustment: 0 },
  { id: "doublecab", label: "Double-cab ute", adjustment: 25 },
  { id: "cargovan", label: "Cargo van (no rear seats)", adjustment: 0 },
  { id: "passengervan", label: "Passenger van (with seats)", adjustment: 60 },
  { id: "large", label: "7-seater / large SUV", adjustment: 40 },
  { id: "americantruck", label: "American-size truck", adjustment: 40 },
  { id: "other", label: "Other (truck, boat, digger, tractor, caravan)", adjustment: null }
];
const TRADIE_CAB_ONLY_PRICE = 199;
const TRADIE_CAB_ONLY_TYPES = new Set(["singlecab", "cargovan"]);

function priceFor(service, vehicle) {
  if (vehicle.adjustment == null) return null;
  if (service.id === "tradie" && TRADIE_CAB_ONLY_TYPES.has(vehicle.id)) return TRADIE_CAB_ONLY_PRICE;
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
    pricing
  };
}
