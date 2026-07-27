export const APEX_OWNER_UID = "fnc4G85CtmQVy0OooOzfOoSC9u22";

export const servicePackages = [
  {
    id: "maintenance",
    name: "Maintenance Clean",
    price: 150,
    duration: 180,
    description: "For returning clients whose vehicle has already had a deep detail."
  },
  {
    id: "deep",
    name: "Deep Interior Detail",
    price: 179,
    duration: 300,
    description: "Thorough interior reset with steam cleaning and extraction where required."
  },
  {
    id: "full",
    name: "Full Detail",
    price: 249,
    duration: 360,
    description: "Deep interior detail plus a careful exterior wash, wheels, tyres and glass."
  },
  {
    id: "tradie",
    name: "Tradie Reset",
    price: 229,
    duration: 360,
    description: "Heavy-duty interior and exterior reset for work utes and vans."
  },
  {
    id: "seats",
    name: "Seats Out Reset",
    price: 399,
    duration: 480,
    description: "Maximum-access interior reset. Final suitability is confirmed before booking."
  }
];

export const vehicleTypes = [
  ["small", "Sedan / hatch"],
  ["suv", "SUV / wagon"],
  ["singlecab", "Single-cab ute"],
  ["doublecab", "Double-cab ute"],
  ["large", "7-seater / large SUV"],
  ["van", "Van / oversized vehicle"]
];

export const conditionLevels = [
  ["light", "Light — maintained and tidy"],
  ["average", "Average — normal daily use"],
  ["heavy", "Heavy — stains, pet hair, sand or work grime"],
  ["extreme", "Extreme — inspection required"]
];

export const defaultBookingSettings = {
  enabled: true,
  businessName: "Apex Detailers",
  headline: "Book your vehicle detail.",
  intro: "Choose a preferred appointment below. Your booking is held as pending until Apex confirms it.",
  serviceArea: "Napier, Hastings, Havelock North and surrounding Hawke's Bay areas",
  minimumNoticeHours: 24,
  maxAdvanceDays: 60,
  slotDurationMinutes: 360,
  weeklySchedule: {
    0: [],
    1: ["08:30"],
    2: ["08:30"],
    3: ["08:30"],
    4: ["08:30"],
    5: ["08:30"],
    6: ["09:00"]
  },
  closedDates: [],
  contactEmail: "bookings@apexdetailers.co.nz",
  contactPhone: "",
  bookingMode: "request"
};

export function money(value) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function slotKey(date, time) {
  return `${date}_${String(time).replace(":", "-")}`;
}

export function formatDate(date, options = {}) {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...options
  });
}

export function formatLongDate(date) {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

export function getAvailableDates(settings, bookedSlotKeys, now = new Date()) {
  const rows = [];
  const minimum = new Date(now.getTime() + Number(settings.minimumNoticeHours || 24) * 60 * 60 * 1000);
  const maxDays = Number(settings.maxAdvanceDays || 60);
  const closed = new Set(settings.closedDates || []);

  for (let offset = 0; offset <= maxDays; offset += 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + offset);
    const key = dateKey(day);
    if (closed.has(key)) continue;

    const schedule = settings.weeklySchedule?.[day.getDay()] || [];
    const times = schedule.filter(time => {
      const [hours, minutes] = time.split(":").map(Number);
      const appointment = new Date(day);
      appointment.setHours(hours, minutes, 0, 0);
      return appointment >= minimum && !bookedSlotKeys.has(slotKey(key, time));
    });

    if (times.length) rows.push({ date: key, times });
  }

  return rows;
}

export function packageById(id) {
  return servicePackages.find(item => item.id === id) || servicePackages[0];
}
