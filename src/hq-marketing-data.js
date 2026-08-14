// Entirely fabricated data for the public marketing/showcase build of HQ
// (see hq-marketing.jsx). No connection to real customers, jobs, bookings or
// Firestore - this file is the only data source that page ever reads from.

const iso = offsetDays => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
};

const seconds = offsetDays => Math.round(Date.now() / 1000) + offsetDays * 86400;

export const demoCustomers = [
  { id: "c1", firstName: "Liam", lastName: "Foster", businessName: "", phone: "021 334 8821", email: "liam.foster@example.co.nz", address: "14 Marine Parade", area: "Napier" },
  { id: "c2", firstName: "Amelia", lastName: "Ngata", businessName: "", phone: "027 552 0143", email: "amelia.ngata@example.co.nz", address: "8 Havelock Road", area: "Havelock North" },
  { id: "c3", firstName: "", lastName: "", businessName: "Ridgeline Builders", phone: "021 908 4471", email: "office@ridgelinebuilders.example.co.nz", address: "22 Omahu Road", area: "Hastings" },
  { id: "c4", firstName: "Sione", lastName: "Taufa", businessName: "", phone: "022 445 9910", email: "sione.taufa@example.co.nz", address: "3 Church Road", area: "Taradale" },
  { id: "c5", firstName: "Grace", lastName: "Mitchell", businessName: "", phone: "021 774 2298", email: "grace.mitchell@example.co.nz", address: "56 Ahuriri Esplanade", area: "Ahuriri" },
  { id: "c6", firstName: "", lastName: "", businessName: "Hawke's Bay Electrical", phone: "021 663 1187", email: "bookings@hbelectrical.example.co.nz", address: "11 Karamu Road", area: "Hastings" },
  { id: "c7", firstName: "Tom", lastName: "Reid", businessName: "", phone: "027 318 6602", email: "tom.reid@example.co.nz", address: "40 Kennedy Road", area: "Napier" },
  { id: "c8", firstName: "Chloe", lastName: "Bennett", businessName: "", phone: "021 590 3324", email: "chloe.bennett@example.co.nz", address: "5 Duke Street", area: "Poraiti" }
];

// bookingDate/bookingTime/status/total/paidAmount drive Dashboard, Calendar,
// Jobs, Customers exactly the way real jobs do - same field names, same
// status vocabulary, so the demo behaves identically to the live app.
export const demoJobs = [
  { id: "j1", customerId: "c1", customerName: "Liam Foster", vehicleYear: "2022", vehicleMake: "Ford", vehicleModel: "Ranger", rego: "MQP482", packageName: "Tradie Reset", packageId: "tradie", bookingDate: iso(0), bookingTime: "09:00", durationMinutes: 360, status: "In Progress", total: 254, paidAmount: 0, calendarSyncStatus: "synced", timerStartedAt: { seconds: seconds(0) - 5400 }, timerElapsedSeconds: 0, createdAt: { seconds: seconds(-2) } },
  { id: "j2", customerId: "c2", customerName: "Amelia Ngata", vehicleYear: "2023", vehicleMake: "Mazda", vehicleModel: "CX-5", rego: "KTA219", packageName: "Full Detail", packageId: "full", bookingDate: iso(1), bookingTime: "08:30", durationMinutes: 360, status: "Confirmed", total: 249, paidAmount: 0, calendarSyncStatus: "synced", createdAt: { seconds: seconds(-3) } },
  { id: "j3", customerId: "c3", customerName: "Ridgeline Builders", vehicleYear: "2021", vehicleMake: "Toyota", vehicleModel: "Hilux", rego: "RLB017", packageName: "Tradie Reset", packageId: "tradie", bookingDate: iso(2), bookingTime: "08:00", durationMinutes: 360, status: "Booked", total: 279, paidAmount: 0, calendarSyncStatus: "pending-hold-synced", createdAt: { seconds: seconds(-1) } },
  { id: "j4", customerId: "c4", customerName: "Sione Taufa", vehicleYear: "2020", vehicleMake: "Holden", vehicleModel: "Commodore", rego: "SGT553", packageName: "Deep Interior Detail", packageId: "deep", bookingDate: iso(4), bookingTime: "10:00", durationMinutes: 300, status: "Booked", total: 179, paidAmount: 0, calendarSyncStatus: "synced", createdAt: { seconds: seconds(-1) } },
  { id: "j5", customerId: "c5", customerName: "Grace Mitchell", vehicleYear: "2023", vehicleMake: "VW", vehicleModel: "Golf", rego: "GMC201", packageName: "Full Detail", packageId: "full", bookingDate: iso(-2), bookingTime: "09:00", durationMinutes: 360, status: "Paid", total: 269, paidAmount: 269, calendarSyncStatus: "synced", createdAt: { seconds: seconds(-6) } },
  { id: "j6", customerId: "c6", customerName: "Hawke's Bay Electrical", vehicleYear: "2022", vehicleMake: "Isuzu", vehicleModel: "D-Max", rego: "HBE092", packageName: "Tradie Reset", packageId: "tradie", bookingDate: iso(-5), bookingTime: "08:00", durationMinutes: 360, status: "Paid", total: 254, paidAmount: 254, calendarSyncStatus: "synced", createdAt: { seconds: seconds(-9) } },
  { id: "j7", customerId: "c7", customerName: "Tom Reid", vehicleYear: "2021", vehicleMake: "Nissan", vehicleModel: "Navara", rego: "TRD448", packageName: "Full Detail", packageId: "full", bookingDate: iso(-8), bookingTime: "08:30", durationMinutes: 360, status: "Paid", total: 249, paidAmount: 249, calendarSyncStatus: "synced", createdAt: { seconds: seconds(-12) } },
  { id: "j8", customerId: "c8", customerName: "Chloe Bennett", vehicleYear: "2024", vehicleMake: "Hyundai", vehicleModel: "Tucson", rego: "CBT775", packageName: "Deep Interior Detail", packageId: "deep", bookingDate: iso(-11), bookingTime: "09:30", durationMinutes: 300, status: "Paid", total: 199, paidAmount: 199, calendarSyncStatus: "synced", createdAt: { seconds: seconds(-15) } },
  { id: "j9", customerId: "c1", customerName: "Liam Foster", vehicleYear: "2019", vehicleMake: "Toyota", vehicleModel: "Corolla", rego: "LFR630", packageName: "Deep Interior Detail", packageId: "deep", bookingDate: iso(-15), bookingTime: "08:00", durationMinutes: 300, status: "Paid", total: 179, paidAmount: 179, calendarSyncStatus: "synced", createdAt: { seconds: seconds(-19) } },
  { id: "j10", customerId: "c2", customerName: "Amelia Ngata", vehicleYear: "2020", vehicleMake: "Jeep", vehicleModel: "Wrangler", rego: "AMN904", packageName: "Full Detail", packageId: "full", bookingDate: iso(-20), bookingTime: "08:30", durationMinutes: 360, status: "Completed", total: 249, paidAmount: 0, calendarSyncStatus: "synced", createdAt: { seconds: seconds(-24) } },
  { id: "j11", customerId: "c5", customerName: "Grace Mitchell", vehicleYear: "", vehicleMake: "", vehicleModel: "", rego: "", packageName: "Full Detail", packageId: "full", status: "Quote Sent", total: 269, paidAmount: 0, createdAt: { seconds: seconds(-1) } },
  { id: "j12", customerId: "c4", customerName: "Sione Taufa", vehicleYear: "2022", vehicleMake: "Mitsubishi", vehicleModel: "Triton", rego: "", packageName: "Tradie Reset", packageId: "tradie", status: "Lead", total: 254, paidAmount: 0, createdAt: { seconds: seconds(0) } }
];

export const demoRequests = [
  { id: "r1", customerName: "Chloe Bennett", email: "chloe.bennett@example.co.nz", phone: "021 590 3324", vehicleMake: "Hyundai", vehicleModel: "Tucson", address: "5 Duke Street", area: "Poraiti", serviceName: "Deep Interior Detail", bookingDate: iso(6), bookingTime: "09:00", notes: "Bit of dog hair through the back seats.", status: "pending", createdAt: { seconds: seconds(0) - 3600 } }
];

export const demoInquiries = [
  { id: "i1", name: "Marcus Webb", email: "marcus.webb@example.co.nz", phone: "027 210 4456", message: "Hi, do you do boats as well as cars? Got a trailer boat that could use a clean before summer.", status: "new", createdAt: { seconds: seconds(0) - 7200 } }
];
