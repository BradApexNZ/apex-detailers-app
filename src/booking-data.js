export const servicePackages = [
  { id: "maintenance", name: "Maintenance Clean", price: 150, durationMinutes: 180, publicBookable: false, description: "For existing regular clients whose vehicle has already had a deep detail." },
  { id: "deep", name: "Deep Interior Detail", price: 179, durationMinutes: 300, publicBookable: true, description: "A thorough interior reset with steam cleaning and extraction where required." },
  { id: "full", name: "Full Detail", price: 249, durationMinutes: 360, publicBookable: true, description: "Deep interior detail plus exterior wash, wheels, tyres and glass." },
  { id: "tradie", name: "Tradie Reset", price: 229, durationMinutes: 360, publicBookable: true, description: "Heavy-duty reset for work utes and vans." },
  { id: "seats", name: "Seats Out Reset", price: 399, durationMinutes: 480, publicBookable: true, description: "Maximum-access interior reset, subject to suitability confirmation." }
];

export const publicServicePackages = servicePackages.filter(item => item.publicBookable !== false);

export const vehicleTypes = [
  ["small", "Sedan / hatch"],
  ["suv", "SUV / wagon"],
  ["singlecab", "Single-cab ute"],
  ["doublecab", "Double-cab ute"],
  ["large", "7-seater / large SUV"],
  ["van", "Van / oversized vehicle"]
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
  note: "Your time is held as a request until Apex confirms the vehicle details and final price.",
  customerEmails: true,
  ownerEmails: true
};

export const money = value => new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
  maximumFractionDigits: 0
}).format(Number(value || 0));

export const serviceById = id => servicePackages.find(item => item.id === id) || servicePackages[1];

export const formatDate = date => date
  ? new Date(`${date}T00:00:00`).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })
  : "";
