export const servicePackages = [
  {
    id: "maintenance",
    name: "Maintenance Clean",
    price: 179,
    durationMinutes: 180,
    publicBookable: false,
    description: "Monthly maintenance visit for existing regular clients whose vehicle has already had a deep detail."
  },
  {
    id: "maintenance2",
    name: "Maintenance Clean (bimonthly)",
    price: 199,
    durationMinutes: 210,
    publicBookable: false,
    description: "Bimonthly maintenance visit (interior + exterior) for existing regular clients."
  },
  {
    id: "kickoff",
    name: "Kickoff Detail",
    price: 279,
    durationMinutes: 360,
    publicBookable: false,
    description: "Plan-only starting detail for Maintenance Clean clients, includes iron decontamination."
  },
  {
    id: "deep",
    name: "Interior Revive",
    price: 159,
    durationMinutes: 300,
    publicBookable: true,
    description: "A thorough interior reset with steam cleaning and extraction where required."
  },
  {
    id: "full",
    name: "Full Detail",
    price: 229,
    durationMinutes: 360,
    publicBookable: true,
    description: "Deep interior detail plus exterior wash, wheels, tyres and glass. Excludes tar removal and paint decontamination."
  },
  {
    id: "deluxe",
    name: "Deluxe Full Detail",
    price: 349,
    durationMinutes: 420,
    publicBookable: true,
    description: "Full Detail plus tar removal, iron decontamination and paint correction."
  },
  {
    id: "tradie",
    name: "Tradie Reset",
    price: 199,
    durationMinutes: 360,
    publicBookable: true,
    description: "Heavy-duty reset for work utes and vans. Priced by vehicle size."
  },
  {
    id: "seats",
    name: "Seats Out Reset",
    price: 399,
    durationMinutes: 480,
    publicBookable: true,
    description: "Maximum-access interior reset, subject to suitability confirmation."
  }
];

export const bookingAddons = [
  { id: "petHair", name: "Pet hair removal", price: 50 },
  { id: "odour", name: "Odour / ozone treatment", price: 35 },
  { id: "headlight", name: "Headlight restoration", price: 79 },
  { id: "engine", name: "Engine bay clean", price: 50 }
];

export const publicServicePackages = servicePackages.filter(item => item.publicBookable !== false);

// Kept as [id, label] tuples for HQ's own job-editing dropdowns (Brad sets
// price by hand there). The public booking page pulls the authoritative,
// pricing-aware version of this list (with each vehicle's $ adjustment) live
// from getPublicBookingConfig instead of from here, so the "from $X" the
// customer sees can never drift from what the server actually charges.
export const vehicleTypes = [
  ["small", "Sedan / hatch"],
  ["suv", "SUV / wagon"],
  ["singlecab", "Single-cab ute"],
  ["extracab", "Extra-cab ute"],
  ["doublecab", "Double-cab ute"],
  ["cargovan", "Cargo van (no rear seats)"],
  ["passengervan", "Passenger van (with seats)"],
  ["large", "7-seater / large SUV (Land Cruiser, Prado, Everest, Patrol)"],
  ["americantruck", "American-size truck (Ram, F-150, Silverado)"],
  ["other", "Other (truck, boat, digger, tractor, caravan)"]
];

export const defaultBookingSettings = {
  enabled: true,
  minimumNoticeHours: 24,
  bookingWindowDays: 60,
  slotIntervalMinutes: 30,
  openingTime: "08:00",
  closingTime: "18:00",
  workDays: [1, 2, 3, 4, 5, 6],
  serviceAreas: ["Napier", "Hastings", "Havelock North", "Taradale", "Ahuriri", "Poraiti"],
  note: "Your selected time is submitted as a booking request until Apex confirms the vehicle details and final price.",
  customerEmails: true,
  ownerEmails: true
};

export const money = value =>
  new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));

export const serviceById = id => servicePackages.find(item => item.id === id) || servicePackages[1];

export const formatDate = date =>
  date ? new Date(`${date}T00:00:00`).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" }) : "";
