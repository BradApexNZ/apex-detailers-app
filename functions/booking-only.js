import { initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { DateTime } from "luxon";

initializeApp();
const db = getFirestore();
const REGION = "australia-southeast1";
const ZONE = "Pacific/Auckland";
const OWNER_UIDS = ["FqDrn1aPFHXUB5ogb2rN9D7mRG42"];

const services = [
  { id: "maintenance", name: "Maintenance Clean", price: 150, durationMinutes: 180, description: "For existing regular clients whose vehicle has already had a deep detail.", publicBookable: false },
  { id: "deep", name: "Deep Interior Detail", price: 179, durationMinutes: 300, description: "A thorough interior reset with steam cleaning and extraction where required." },
  { id: "full", name: "Full Detail", price: 249, durationMinutes: 360, description: "Deep interior detail plus exterior wash, wheels, tyres and glass." },
  { id: "tradie", name: "Tradie Reset", price: 229, durationMinutes: 360, description: "Heavy-duty reset for work utes and vans." },
  { id: "seats", name: "Seats Out Reset", price: 399, durationMinutes: 480, description: "Maximum-access interior reset, subject to suitability confirmation." }
];

const defaults = {
  enabled: true,
  minimumNoticeHours: 24,
  bookingWindowDays: 60,
  slotIntervalMinutes: 30,
  openingTime: "08:00",
  closingTime: "18:00",
  workDays: [1, 2, 3, 4, 5, 6],
  serviceAreas: ["Napier", "Hastings", "Havelock North", "Taradale", "Ahuriri", "Poraiti"],
  note: "Your selected time is held as a request until Apex confirms the vehicle details and final price."
};

const text = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const cleanEmail = value => text(value, 180).toLowerCase();
const cleanPhone = value => text(value, 40).replace(/[^0-9+ ()-]/g, "");
const serviceById = id => services.find(item => item.id === id) || services[1];

function requireOwner(request) {
  if (!request.auth || !OWNER_UIDS.includes(request.auth.uid)) {
    throw new HttpsError("permission-denied", "Apex owner access is required.");
  }
}

async function settings() {
  const snap = await db.doc("settings/booking").get();
  return { ...defaults, ...(snap.exists ? snap.data() : {}) };
}

function local(date, time) {
  const value = DateTime.fromISO(`${date}T${time}`, { zone: ZONE });
  if (!value.isValid) throw new HttpsError("invalid-argument", "Choose a valid date and time.");
  return value;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

async function availableSlots(date, serviceId) {
  const config = await settings();
  const service = serviceById(serviceId);
  const day = DateTime.fromISO(date, { zone: ZONE }).startOf("day");
  const now = DateTime.now().setZone(ZONE);
  if (!config.enabled || !day.isValid) return [];
  if (day < now.startOf("day") || day > now.plus({ days: Number(config.bookingWindowDays || 60) }).endOf("day")) return [];
  const weekday = day.weekday === 7 ? 0 : day.weekday;
  if (!(config.workDays || []).includes(weekday)) return [];

  const open = local(date, config.openingTime || "08:00");
  const close = local(date, config.closingTime || "18:00");
  const minimum = now.plus({ hours: Number(config.minimumNoticeHours || 24) });
  const [locks, jobs] = await Promise.all([
    db.collection("bookingLocks").where("date", "==", date).get(),
    db.collection("jobs").where("bookingDate", "==", date).get()
  ]);

  const blocked = [];
  locks.forEach(document => {
    const row = document.data();
    if (row.status === "released") return;
    blocked.push({ start: local(date, row.startTime), end: local(date, row.endTime) });
  });
  jobs.forEach(document => {
    const row = document.data();
    if (!row.bookingTime || ["Archived", "Cancelled"].includes(row.status)) return;
    const start = local(date, row.bookingTime);
    const duration = Number(row.durationMinutes || serviceById(row.packageId || row.serviceId).durationMinutes);
    blocked.push({ start, end: row.bookingEndTime ? local(date, row.bookingEndTime) : start.plus({ minutes: duration }) });
  });

  const rows = [];
  const interval = Number(config.slotIntervalMinutes || 30);
  for (let start = open; start.plus({ minutes: service.durationMinutes }) <= close; start = start.plus({ minutes: interval })) {
    const end = start.plus({ minutes: service.durationMinutes });
    if (start < minimum) continue;
    if (!blocked.some(block => overlaps(start, end, block.start, block.end))) {
      rows.push({ start: start.toFormat("HH:mm"), end: end.toFormat("HH:mm") });
    }
  }
  return rows;
}

export const getPublicBookingConfig = onCall({ region: REGION, enforceAppCheck: false }, async () => {
  const config = await settings();
  return {
    enabled: config.enabled,
    minimumNoticeHours: config.minimumNoticeHours,
    bookingWindowDays: config.bookingWindowDays,
    serviceAreas: config.serviceAreas,
    note: config.note,
    services
  };
});

export const listBookingAvailability = onCall({ region: REGION, enforceAppCheck: false }, async request => {
  const date = text(request.data?.date, 10);
  const serviceId = text(request.data?.serviceId, 30);
  return { date, slots: await availableSlots(date, serviceId) };
});

export const submitBookingRequest = onCall({ region: REGION, enforceAppCheck: false }, async request => {
  const input = request.data || {};
  if (input.website) throw new HttpsError("invalid-argument", "Unable to submit.");
  const service = serviceById(text(input.serviceId, 30));
  const data = {
    serviceId: service.id,
    serviceName: service.name,
    durationMinutes: service.durationMinutes,
    estimatedPrice: service.price,
    vehicleType: text(input.vehicleType, 30),
    bookingDate: text(input.bookingDate, 10),
    bookingTime: text(input.bookingTime, 5),
    bookingEndTime: text(input.bookingEndTime, 5),
    customerName: text(input.customerName, 120),
    phone: cleanPhone(input.phone),
    email: cleanEmail(input.email),
    address: text(input.address, 240),
    area: text(input.area, 80),
    vehicleYear: text(input.vehicleYear, 8),
    vehicleMake: text(input.vehicleMake, 80),
    vehicleModel: text(input.vehicleModel, 80),
    rego: text(input.rego, 20).toUpperCase(),
    condition: text(input.condition, 30),
    petHair: Boolean(input.petHair),
    heavyStains: Boolean(input.heavyStains),
    notes: text(input.notes, 1200),
    acceptedTerms: Boolean(input.acceptedTerms)
  };
  if (!data.customerName || !data.phone || !data.email || !data.address || !data.bookingDate || !data.bookingTime || !data.acceptedTerms) {
    throw new HttpsError("invalid-argument", "Complete all required booking details.");
  }
  const options = await availableSlots(data.bookingDate, data.serviceId);
  if (!options.some(slot => slot.start === data.bookingTime)) {
    throw new HttpsError("already-exists", "That appointment is no longer available.");
  }
  const requestRef = db.collection("bookingRequests").doc();
  const lockId = `${data.bookingDate}_${data.bookingTime.replace(":", "-")}`;
  const lockRef = db.doc(`bookingLocks/${lockId}`);
  await db.runTransaction(async transaction => {
    if ((await transaction.get(lockRef)).exists) throw new HttpsError("already-exists", "That appointment was just taken.");
    transaction.create(lockRef, {
      date: data.bookingDate,
      startTime: data.bookingTime,
      endTime: data.bookingEndTime || local(data.bookingDate, data.bookingTime).plus({ minutes: service.durationMinutes }).toFormat("HH:mm"),
      status: "pending",
      requestId: requestRef.id,
      createdAt: FieldValue.serverTimestamp()
    });
    transaction.create(requestRef, {
      ...data,
      lockId,
      status: "pending",
      reference: `APX-${requestRef.id.slice(0, 6).toUpperCase()}`,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  });
  return {
    reference: `APX-${requestRef.id.slice(0, 6).toUpperCase()}`,
    serviceName: service.name,
    bookingDate: data.bookingDate,
    bookingTime: data.bookingTime,
    emailSent: false
  };
});

export const approveBookingRequest = onCall({ region: REGION, enforceAppCheck: false }, async request => {
  requireOwner(request);
  const requestId = text(request.data?.requestId, 120);
  const reference = db.doc(`bookingRequests/${requestId}`);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Booking request not found.");
  const item = snapshot.data();
  if (item.status !== "pending") throw new HttpsError("failed-precondition", "This request has already been reviewed.");

  const customerRef = db.collection("customers").doc();
  const jobRef = db.collection("jobs").doc();
  const names = item.customerName.split(/\s+/).filter(Boolean);
  const vehicle = [item.vehicleYear, item.vehicleMake, item.vehicleModel].filter(Boolean).join(" ");
  const batch = db.batch();
  batch.set(customerRef, {
    firstName: names.shift() || item.customerName,
    lastName: names.join(" "), phone: item.phone, email: item.email,
    address: item.address, area: item.area, customerType: "standard",
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
  });
  batch.set(jobRef, {
    customerId: customerRef.id, customerName: item.customerName,
    phone: item.phone, email: item.email, address: item.address, area: item.area,
    vehicle, vehicleYear: item.vehicleYear, vehicleMake: item.vehicleMake,
    vehicleModel: item.vehicleModel, rego: item.rego, vehicleType: item.vehicleType,
    packageId: item.serviceId, packageName: item.serviceName,
    durationMinutes: item.durationMinutes, total: item.estimatedPrice,
    bookingDate: item.bookingDate, bookingTime: item.bookingTime,
    bookingEndTime: item.bookingEndTime, status: "Confirmed", notes: item.notes,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
  });
  batch.set(reference, { status: "accepted", jobId: jobRef.id, customerId: customerRef.id, reviewedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (item.lockId) batch.set(db.doc(`bookingLocks/${item.lockId}`), { status: "confirmed", jobId: jobRef.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  return { success: true, jobId: jobRef.id };
});

export const declineBookingRequest = onCall({ region: REGION, enforceAppCheck: false }, async request => {
  requireOwner(request);
  const requestId = text(request.data?.requestId, 120);
  const reference = db.doc(`bookingRequests/${requestId}`);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Booking request not found.");
  const item = snapshot.data();
  const batch = db.batch();
  batch.set(reference, { status: "declined", reviewedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (item.lockId) batch.delete(db.doc(`bookingLocks/${item.lockId}`));
  await batch.commit();
  return { success: true };
});

export const createManualBooking = onCall({ region: REGION, enforceAppCheck: false }, async request => {
  requireOwner(request);
  const input = request.data || {};
  const service = serviceById(text(input.serviceId, 30));
  const customerRef = db.collection("customers").doc();
  const jobRef = db.collection("jobs").doc();
  const names = text(input.customerName, 120).split(/\s+/).filter(Boolean);
  const vehicle = [text(input.vehicleYear, 8), text(input.vehicleMake, 80), text(input.vehicleModel, 80)].filter(Boolean).join(" ");
  const batch = db.batch();
  batch.set(customerRef, {
    firstName: names.shift() || text(input.customerName, 120), lastName: names.join(" "),
    phone: cleanPhone(input.phone), email: cleanEmail(input.email), address: text(input.address, 240), area: text(input.area, 80),
    customerType: "standard", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
  });
  batch.set(jobRef, {
    customerId: customerRef.id, customerName: text(input.customerName, 120), phone: cleanPhone(input.phone), email: cleanEmail(input.email),
    address: text(input.address, 240), area: text(input.area, 80), vehicle,
    vehicleYear: text(input.vehicleYear, 8), vehicleMake: text(input.vehicleMake, 80), vehicleModel: text(input.vehicleModel, 80),
    rego: text(input.rego, 20).toUpperCase(), vehicleType: text(input.vehicleType, 30),
    packageId: service.id, packageName: service.name, durationMinutes: service.durationMinutes, total: service.price,
    bookingDate: text(input.bookingDate, 10), bookingTime: text(input.bookingTime, 5), status: "Confirmed", notes: text(input.notes, 1200),
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
  });
  await batch.commit();
  return { success: true, jobId: jobRef.id };
});

export const getGoogleCalendarStatus = onCall({ region: REGION, enforceAppCheck: false }, async request => {
  requireOwner(request);
  return { connected: false, disabled: true, email: "Apex HQ standalone booking" };
});
export const startGoogleCalendarConnect = onCall({ region: REGION, enforceAppCheck: false }, async request => {
  requireOwner(request);
  throw new HttpsError("failed-precondition", "Google Calendar integration is paused.");
});
export const syncJobToCalendar = onCall({ region: REGION, enforceAppCheck: false }, async request => {
  requireOwner(request);
  throw new HttpsError("failed-precondition", "Google Calendar integration is paused.");
});
export const submitInquiry = onCall({ region: REGION, enforceAppCheck: false }, async request => {
  const input = request.data || {};
  const ref = await db.collection("inquiries").add({
    name: text(input.name, 120), email: cleanEmail(input.email), phone: cleanPhone(input.phone),
    message: text(input.message, 1500), status: "new", createdAt: Timestamp.now()
  });
  return { success: true, reference: ref.id };
});
