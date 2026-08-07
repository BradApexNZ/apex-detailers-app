import crypto from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { google } from "googleapis";
import { DateTime } from "luxon";

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "australia-southeast1";
const ZONE = defineString("APEX_TIME_ZONE", { default: "Pacific/Auckland" });
const OWNER_UIDS = defineString("APEX_OWNER_UIDS", { default: "fnc4G85CtmQVy0OooOzfOoSC9u22,FqDrn1aPFHXUB5ogb2rN9D7mRG42,maefd5cQ9qcIKSeU4b3yZKUL8UW2" });
const OWNER_EMAIL = defineString("APEX_OWNER_EMAIL", { default: "bookings@apexdetailers.co.nz" });
const GOOGLE_CALLBACK_URL = defineString("GOOGLE_CALLBACK_URL", { default: "https://australia-southeast1-apex-detailers.cloudfunctions.net/googleCalendarCallback" });
const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
const TOKEN_KEY = defineSecret("TOKEN_ENCRYPTION_KEY");
const GOOGLE_SECRETS = [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_KEY];

const services = [
  { id: "maintenance", name: "Maintenance Clean", price: 150, durationMinutes: 180, description: "For regular clients whose vehicle has already had a deep detail." },
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
  note: "Your time is held as a request until Apex confirms the vehicle details and final price.",
  customerEmails: true,
  ownerEmails: true
};

const text = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const email = value => text(value, 180).toLowerCase();
const phone = value => text(value, 40).replace(/[^0-9+ ]/g, "");
const owners = () => OWNER_UIDS.value().split(",").map(value => value.trim()).filter(Boolean);
const serviceById = id => services.find(row => row.id === id) || services[1];

function requireOwner(request) {
  if (!request.auth || !owners().includes(request.auth.uid)) throw new HttpsError("permission-denied", "Apex owner access is required.");
}

function parseLocal(date, time) {
  const value = DateTime.fromISO(`${date}T${time}`, { zone: ZONE.value() });
  if (!value.isValid) throw new HttpsError("invalid-argument", "Choose a valid date and time.");
  return value;
}

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;
const bookingLockId = (date, time) => `${date}_${time.replace(":", "-")}`;

async function bookingSettings() {
  const snapshot = await db.doc("settings/booking").get();
  return { ...defaults, ...(snapshot.exists ? snapshot.data() : {}) };
}

function keyMaterial() {
  return crypto.createHash("sha256").update(TOKEN_KEY.value()).digest();
}

function decrypt(payload) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload.data, "base64")), decipher.final()]).toString("utf8");
}

function oauthClient() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID.value(), GOOGLE_CLIENT_SECRET.value(), GOOGLE_CALLBACK_URL.value());
}

async function googleConnection() {
  const snapshot = await db.doc("integrations/google").get();
  if (!snapshot.exists || !snapshot.data().refreshToken) return null;
  const data = snapshot.data();
  const client = oauthClient();
  client.setCredentials({ refresh_token: decrypt(data.refreshToken) });
  return { client, data, email: data.email || OWNER_EMAIL.value() };
}

async function calendarRows(client) {
  const api = google.calendar({ version: "v3", auth: client });
  const rows = [];
  let pageToken;
  do {
    const response = await api.calendarList.list({ pageToken, maxResults: 250, showHidden: false });
    rows.push(...(response.data.items || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  return rows.filter(row => row.id && ["owner", "writer", "reader"].includes(row.accessRole));
}

async function calendarConfig(connected) {
  const rows = await calendarRows(connected.client);
  const allowed = new Set(rows.map(row => row.id));
  const configured = Array.isArray(connected.data.selectedCalendarIds) ? connected.data.selectedCalendarIds.filter(id => allowed.has(id)) : [];
  const fallback = rows.filter(row => row.primary).map(row => row.id);
  const selectedCalendarIds = configured.length ? configured : fallback;
  const requestedPrimary = text(connected.data.primaryCalendarId, 300);
  const primaryCalendarId = selectedCalendarIds.includes(requestedPrimary)
    ? requestedPrimary
    : selectedCalendarIds[0] || rows[0]?.id || "primary";
  return { rows, selectedCalendarIds, primaryCalendarId };
}

async function calendarBusy(start, end) {
  try {
    const connected = await googleConnection();
    if (!connected) return [];
    const config = await calendarConfig(connected);
    if (!config.selectedCalendarIds.length) return [];
    const api = google.calendar({ version: "v3", auth: connected.client });
    const response = await api.freebusy.query({
      requestBody: {
        timeMin: start.toUTC().toISO(),
        timeMax: end.toUTC().toISO(),
        timeZone: ZONE.value(),
        items: config.selectedCalendarIds.map(id => ({ id }))
      }
    });
    const blocked = [];
    for (const id of config.selectedCalendarIds) {
      for (const row of response.data.calendars?.[id]?.busy || []) {
        blocked.push({ start: DateTime.fromISO(row.start), end: DateTime.fromISO(row.end), calendarId: id });
      }
    }
    return blocked;
  } catch (error) {
    console.error("V6 Calendar freebusy failed", error);
    return [];
  }
}

async function availableSlots(date, serviceId) {
  const config = await bookingSettings();
  const service = serviceById(serviceId);
  const day = DateTime.fromISO(date, { zone: ZONE.value() }).startOf("day");
  const now = DateTime.now().setZone(ZONE.value());
  if (!config.enabled || !day.isValid) return [];
  if (day < now.startOf("day") || day > now.plus({ days: Number(config.bookingWindowDays || 60) }).endOf("day")) return [];
  const weekday = day.weekday === 7 ? 0 : day.weekday;
  if (!(config.workDays || []).includes(weekday)) return [];

  const open = parseLocal(date, config.openingTime);
  const close = parseLocal(date, config.closingTime);
  const minimum = now.plus({ hours: Number(config.minimumNoticeHours || 24) });
  const [lockSnapshot, jobSnapshot, googleBusy] = await Promise.all([
    db.collection("bookingLocks").where("date", "==", date).get(),
    db.collection("jobs").where("bookingDate", "==", date).get(),
    calendarBusy(open, close)
  ]);

  const blocked = [];
  lockSnapshot.forEach(document => {
    const data = document.data();
    if (!data.startTime || !data.endTime) return;
    blocked.push({ start: parseLocal(date, data.startTime), end: parseLocal(date, data.endTime) });
  });
  jobSnapshot.forEach(document => {
    const data = document.data();
    if (!data.bookingTime || ["Archived", "Cancelled"].includes(data.status)) return;
    const start = parseLocal(date, data.bookingTime);
    blocked.push({ start, end: data.bookingEndTime ? parseLocal(date, data.bookingEndTime) : start.plus({ minutes: Number(data.durationMinutes || serviceById(data.packageId).durationMinutes) }) });
  });
  blocked.push(...googleBusy);

  const rows = [];
  for (let start = open; start.plus({ minutes: service.durationMinutes }) <= close; start = start.plus({ minutes: Number(config.slotIntervalMinutes || 30) })) {
    const end = start.plus({ minutes: service.durationMinutes });
    if (start < minimum) continue;
    if (!blocked.some(block => overlaps(start, end, block.start, block.end))) rows.push({ start: start.toFormat("HH:mm"), end: end.toFormat("HH:mm") });
  }
  return rows;
}

function ipHash(request) {
  const raw = request.rawRequest?.headers?.["x-forwarded-for"] || request.rawRequest?.ip || "unknown";
  return crypto.createHash("sha256").update(String(raw).split(",")[0]).digest("hex").slice(0, 28);
}

async function rateLimit(request, bucket, limit = 8, minutes = 30) {
  const reference = db.doc(`rateLimits/${bucket}_${ipHash(request)}`);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const now = Date.now();
    const data = snapshot.data() || {};
    const startedAt = data.windowStart?.toMillis?.() || 0;
    const count = now - startedAt < minutes * 60000 ? Number(data.count || 0) : 0;
    if (count >= limit) throw new HttpsError("resource-exhausted", "Too many attempts. Please try again later.");
    transaction.set(reference, { count: count + 1, windowStart: count ? data.windowStart : Timestamp.now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

function rawEmail({ to, subject, html, from }) {
  const message = [`From: Apex Detailers <${from}>`, `To: ${to}`, `Subject: ${subject}`, "MIME-Version: 1.0", "Content-Type: text/html; charset=UTF-8", "", html].join("\r\n");
  return Buffer.from(message).toString("base64url");
}

async function sendMail({ to, subject, html }) {
  if (!to) return false;
  try {
    const connected = await googleConnection();
    if (!connected) return false;
    await google.gmail({ version: "v1", auth: connected.client }).users.messages.send({ userId: "me", requestBody: { raw: rawEmail({ to, subject, html, from: connected.email }) } });
    return true;
  } catch (error) {
    console.error("V6 Email send failed", error);
    return false;
  }
}

const emailShell = (heading, body) => `<div style="background:#09090a;padding:28px;font-family:Arial,sans-serif;color:#f7f4ea"><div style="max-width:620px;margin:auto;background:#151518;border:1px solid #3a3a3f;border-radius:22px;padding:28px"><div style="color:#ffd21f;font-weight:900;letter-spacing:2px">APEX DETAILERS</div><h1 style="font-size:32px">${heading}</h1>${body}<p style="color:#99958d;margin-top:28px">Apex Detailers · Hawke's Bay</p></div></div>`;

async function notifyRequest(data, config) {
  const vehicle = [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" ");
  const details = `<p><b>${data.serviceName}</b><br>${data.bookingDate} at ${data.bookingTime}<br>${vehicle}<br>${data.address}, ${data.area}</p>`;
  const result = { customer: false, owner: false };
  if (config.customerEmails) result.customer = await sendMail({ to: data.email, subject: "Apex booking request received", html: emailShell("We’ve received your booking request.", `${details}<p>Your selected time is being held while Brad reviews the vehicle details and final price.</p>`) });
  if (config.ownerEmails) result.owner = await sendMail({ to: OWNER_EMAIL.value(), subject: `New Apex booking request — ${data.customerName}`, html: emailShell("New booking request", `${details}<p><b>Customer:</b> ${data.customerName}<br><b>Phone:</b> ${data.phone}<br><b>Email:</b> ${data.email}</p><p>Open Apex HQ to confirm or decline it.</p>`) });
  return result;
}

async function notifyConfirmed(data, config) {
  const vehicle = data.vehicle || [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" ");
  const details = `<p><b>${data.packageName || data.serviceName}</b><br>${data.bookingDate} at ${data.bookingTime}<br>${vehicle}<br>${data.address}, ${data.area}</p>`;
  const result = { customer: false, owner: false };
  if (config.customerEmails) result.customer = await sendMail({ to: data.email, subject: "Your Apex Detailers booking is confirmed", html: emailShell("Your booking is confirmed.", `${details}<p>Please make sure an outside tap is accessible and remove valuables from the vehicle before the appointment.</p>`) });
  if (config.ownerEmails) result.owner = await sendMail({ to: OWNER_EMAIL.value(), subject: `Apex booking confirmed — ${data.customerName}`, html: emailShell("Booking confirmed and synced", `${details}<p>${data.customerName} · ${data.phone}</p>`) });
  return result;
}

async function upsertCalendarEvent(data, existingEventId = "", existingCalendarId = "") {
  const connected = await googleConnection();
  if (!connected) return { eventId: "", calendarId: "" };
  const config = await calendarConfig(connected);
  const calendarId = existingCalendarId || config.primaryCalendarId;
  const api = google.calendar({ version: "v3", auth: connected.client });
  const start = parseLocal(data.bookingDate, data.bookingTime);
  const end = data.bookingEndTime ? parseLocal(data.bookingDate, data.bookingEndTime) : start.plus({ minutes: Number(data.durationMinutes || serviceById(data.packageId || data.serviceId).durationMinutes) });
  const requestBody = {
    summary: `Apex — ${data.customerName} — ${data.packageName || data.serviceName}`,
    location: [data.address, data.area].filter(Boolean).join(", "),
    description: [
      `Vehicle: ${data.vehicle || [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" ")}`,
      `Rego: ${data.rego || ""}`,
      `Phone: ${data.phone || ""}`,
      `Email: ${data.email || ""}`,
      `Notes: ${data.notes || ""}`
    ].join("\n"),
    start: { dateTime: start.toISO(), timeZone: ZONE.value() },
    end: { dateTime: end.toISO(), timeZone: ZONE.value() },
    extendedProperties: { private: { apexJobId: data.jobId || "", apexRequestId: data.requestId || "", apexV6: "true" } }
  };
  const response = existingEventId
    ? await api.events.update({ calendarId, eventId: existingEventId, requestBody, sendUpdates: "none" })
    : await api.events.insert({ calendarId, requestBody, sendUpdates: "none" });
  return { eventId: response.data.id || existingEventId, calendarId };
}

async function removeCalendarEvent(eventId, calendarId = "") {
  if (!eventId) return;
  try {
    const connected = await googleConnection();
    if (!connected) return;
    const config = await calendarConfig(connected);
    await google.calendar({ version: "v3", auth: connected.client }).events.delete({ calendarId: calendarId || config.primaryCalendarId, eventId, sendUpdates: "none" });
  } catch (error) {
    if (![404, 410].includes(error?.code)) console.error("V6 Calendar delete failed", error);
  }
}

async function findCustomer(data) {
  if (data.email) {
    const match = await db.collection("customers").where("email", "==", data.email).limit(1).get();
    if (!match.empty) return match.docs[0].ref;
  }
  if (data.phone) {
    const match = await db.collection("customers").where("phone", "==", data.phone).limit(1).get();
    if (!match.empty) return match.docs[0].ref;
  }
  return db.collection("customers").doc();
}

export const getPublicBookingConfigV6 = onCall({ region: REGION }, async () => {
  const config = await bookingSettings();
  return { enabled: config.enabled, minimumNoticeHours: config.minimumNoticeHours, bookingWindowDays: config.bookingWindowDays, serviceAreas: config.serviceAreas, note: config.note, services };
});

export const listBookingAvailabilityV6 = onCall({ region: REGION, secrets: GOOGLE_SECRETS, enforceAppCheck: false }, async request => {
  await rateLimit(request, "availability-v6", 30, 10);
  const date = text(request.data?.date, 10);
  const serviceId = text(request.data?.serviceId, 30);
  return { date, slots: await availableSlots(date, serviceId) };
});

export const submitBookingRequestV6 = onCall({ region: REGION, secrets: GOOGLE_SECRETS, enforceAppCheck: false }, async request => {
  await rateLimit(request, "booking-v6", 6, 30);
  const input = request.data || {};
  if (input.website) throw new HttpsError("invalid-argument", "Unable to submit.");
  const service = serviceById(text(input.serviceId, 30));
  const data = {
    customerName: text(input.customerName, 160), phone: phone(input.phone), email: email(input.email), address: text(input.address, 220), area: text(input.area, 100),
    vehicleYear: text(input.vehicleYear, 12), vehicleMake: text(input.vehicleMake, 80), vehicleModel: text(input.vehicleModel, 100), rego: text(input.rego, 20).toUpperCase(),
    vehicleType: text(input.vehicleType, 30), condition: text(input.condition, 30), petHair: Boolean(input.petHair), heavyStains: Boolean(input.heavyStains), notes: text(input.notes, 1500),
    bookingDate: text(input.bookingDate, 10), bookingTime: text(input.bookingTime, 5), serviceId: service.id, serviceName: service.name, estimatedFromPrice: service.price,
    durationMinutes: service.durationMinutes, status: "pending", source: "public-v6", backendVersion: 6
  };
  if (!data.customerName || !data.phone || !data.email || !data.address || !data.vehicleMake || !data.vehicleModel || !data.bookingDate || !data.bookingTime) throw new HttpsError("invalid-argument", "Complete the required booking details.");
  const start = parseLocal(data.bookingDate, data.bookingTime);
  data.bookingEndTime = start.plus({ minutes: service.durationMinutes }).toFormat("HH:mm");
  const options = await availableSlots(data.bookingDate, data.serviceId);
  if (!options.some(slot => slot.start === data.bookingTime)) throw new HttpsError("already-exists", "That appointment is no longer available.");

  const requestReference = db.collection("bookingRequests").doc();
  const lockReference = db.doc(`bookingLocks/${bookingLockId(data.bookingDate, data.bookingTime)}`);
  await db.runTransaction(async transaction => {
    if ((await transaction.get(lockReference)).exists) throw new HttpsError("already-exists", "That appointment was just taken.");
    transaction.create(lockReference, { date: data.bookingDate, startTime: data.bookingTime, endTime: data.bookingEndTime, requestId: requestReference.id, status: "pending", createdAt: FieldValue.serverTimestamp() });
    transaction.create(requestReference, { ...data, lockId: lockReference.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });

  try {
    const calendar = await upsertCalendarEvent({ ...data, requestId: requestReference.id, serviceName: `PENDING — ${service.name}` });
    if (calendar.eventId) await requestReference.set({ calendarEventId: calendar.eventId, calendarId: calendar.calendarId, calendarSyncStatus: "pending-hold-synced", calendarSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error("V6 pending calendar hold failed", error);
    await requestReference.set({ calendarSyncStatus: "failed", calendarSyncError: text(error?.message, 500) }, { merge: true });
  }
  const emails = await notifyRequest(data, await bookingSettings());
  await requestReference.set({ emailStatus: emails }, { merge: true });
  return { reference: requestReference.id.slice(0, 8).toUpperCase(), serviceName: service.name, bookingDate: data.bookingDate, bookingTime: data.bookingTime, emailSent: emails.customer };
});

export const approveBookingRequestV6 = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const reference = db.doc(`bookingRequests/${text(request.data?.requestId, 80)}`);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Booking request not found.");
  const item = { id: snapshot.id, ...snapshot.data() };
  if (item.status !== "pending") throw new HttpsError("failed-precondition", "That request has already been reviewed.");

  const customerReference = await findCustomer(item);
  const existingCustomer = await customerReference.get();
  const jobReference = db.collection("jobs").doc();
  const vehicle = [item.vehicleYear, item.vehicleMake, item.vehicleModel].filter(Boolean).join(" ");
  const service = serviceById(item.serviceId);
  const parts = item.customerName.split(/\s+/);
  const batch = db.batch();
  batch.set(customerReference, {
    ...(existingCustomer.exists ? {} : { firstName: parts.shift() || item.customerName, lastName: parts.join(" "), customerName: item.customerName, customerType: "standard", preferredContact: "email", createdAt: FieldValue.serverTimestamp() }),
    phone: item.phone, email: item.email, address: item.address, area: item.area, lastVehicle: vehicle, lastJobStatus: "Booked", updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  const job = {
    customerId: customerReference.id, customerName: item.customerName, phone: item.phone, email: item.email, address: item.address, area: item.area,
    vehicleYear: item.vehicleYear, vehicleMake: item.vehicleMake, vehicleModel: item.vehicleModel, vehicle, rego: item.rego, vehicleType: item.vehicleType,
    condition: item.condition, petHair: item.petHair, heavyStains: item.heavyStains, packageId: item.serviceId, packageName: item.serviceName,
    total: item.estimatedFromPrice, durationMinutes: service.durationMinutes, bookingDate: item.bookingDate, bookingTime: item.bookingTime, bookingEndTime: item.bookingEndTime,
    status: "Booked", mode: "booking", notes: item.notes, source: "online-booking-v6", sourceBookingRequestId: item.id, backendVersion: 6,
    calendarEventId: item.calendarEventId || "", calendarId: item.calendarId || "", calendarSyncStatus: item.calendarEventId ? "pending-hold-synced" : "not-synced",
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
  };
  batch.set(jobReference, job);
  batch.set(reference, { status: "accepted", jobId: jobReference.id, customerId: customerReference.id, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (item.lockId) batch.set(db.doc(`bookingLocks/${item.lockId}`), { status: "confirmed", jobId: jobReference.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();

  try {
    const calendar = await upsertCalendarEvent({ ...job, jobId: jobReference.id }, item.calendarEventId || "", item.calendarId || "");
    await jobReference.set({ calendarEventId: calendar.eventId, calendarId: calendar.calendarId, calendarSyncStatus: "synced", calendarSyncedAt: FieldValue.serverTimestamp(), calendarSyncError: FieldValue.delete() }, { merge: true });
  } catch (error) {
    await jobReference.set({ calendarSyncStatus: "failed", calendarSyncError: text(error?.message, 500) }, { merge: true });
  }
  const emails = await notifyConfirmed(job, await bookingSettings());
  await reference.set({ confirmationEmailStatus: emails }, { merge: true });
  return { jobId: jobReference.id, emails };
});

export const declineBookingRequestV6 = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const reference = db.doc(`bookingRequests/${text(request.data?.requestId, 80)}`);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Booking request not found.");
  const item = snapshot.data();
  await removeCalendarEvent(item.calendarEventId, item.calendarId);
  const batch = db.batch();
  batch.set(reference, { status: "declined", reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (item.lockId) batch.delete(db.doc(`bookingLocks/${item.lockId}`));
  await batch.commit();
  const config = await bookingSettings();
  if (config.customerEmails) await sendMail({ to: item.email, subject: "Apex booking request update", html: emailShell("That appointment couldn’t be confirmed.", "<p>The requested time has been released. Please choose another time through the Apex booking page or contact Brad directly.</p>") });
  return { ok: true };
});

export const createManualBookingV6 = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const input = request.data || {};
  const service = serviceById(text(input.serviceId, 30));
  const data = {
    customerName: text(input.customerName, 160), phone: phone(input.phone), email: email(input.email), address: text(input.address, 220), area: text(input.area, 100),
    vehicleYear: text(input.vehicleYear, 12), vehicleMake: text(input.vehicleMake, 80), vehicleModel: text(input.vehicleModel, 100), rego: text(input.rego, 20).toUpperCase(), vehicleType: text(input.vehicleType, 30),
    bookingDate: text(input.bookingDate, 10), bookingTime: text(input.bookingTime, 5), notes: text(input.notes, 1500), packageId: service.id, packageName: service.name,
    total: Number(input.total || service.price), durationMinutes: service.durationMinutes, status: "Booked", mode: "booking", source: "hq-manual-v6", backendVersion: 6
  };
  if (!data.customerName || !data.phone || !data.bookingDate || !data.bookingTime) throw new HttpsError("invalid-argument", "Complete the booking details.");
  const start = parseLocal(data.bookingDate, data.bookingTime);
  data.bookingEndTime = start.plus({ minutes: service.durationMinutes }).toFormat("HH:mm");
  if (!input.overrideConflict) {
    const slots = await availableSlots(data.bookingDate, data.packageId);
    if (!slots.some(slot => slot.start === data.bookingTime)) throw new HttpsError("already-exists", "That time conflicts with Apex HQ or a selected Google Calendar.");
  }

  const customerReference = await findCustomer(data);
  const existingCustomer = await customerReference.get();
  const jobReference = db.collection("jobs").doc();
  const lockReference = db.doc(`bookingLocks/${bookingLockId(data.bookingDate, data.bookingTime)}`);
  const vehicle = [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" ");
  const parts = data.customerName.split(/\s+/);
  const batch = db.batch();
  batch.set(customerReference, {
    ...(existingCustomer.exists ? {} : { firstName: parts.shift() || data.customerName, lastName: parts.join(" "), customerName: data.customerName, customerType: "standard", preferredContact: "email", createdAt: FieldValue.serverTimestamp() }),
    phone: data.phone, email: data.email, address: data.address, area: data.area, lastVehicle: vehicle, lastJobStatus: "Booked", updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  batch.set(jobReference, { ...data, customerId: customerReference.id, vehicle, calendarSyncStatus: "not-synced", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  batch.set(lockReference, { date: data.bookingDate, startTime: data.bookingTime, endTime: data.bookingEndTime, status: "confirmed", jobId: jobReference.id, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();

  try {
    const calendar = await upsertCalendarEvent({ ...data, vehicle, jobId: jobReference.id });
    await jobReference.set({ calendarEventId: calendar.eventId, calendarId: calendar.calendarId, calendarSyncStatus: "synced", calendarSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (error) {
    await jobReference.set({ calendarSyncStatus: "failed", calendarSyncError: text(error?.message, 500) }, { merge: true });
  }
  const emails = data.email ? await notifyConfirmed({ ...data, vehicle }, await bookingSettings()) : { customer: false, owner: false };
  return { jobId: jobReference.id, emails };
});

export const syncJobToCalendarV6 = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const reference = db.doc(`jobs/${text(request.data?.jobId, 80)}`);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Job not found.");
  const job = { jobId: snapshot.id, ...snapshot.data() };
  if (["Cancelled", "Archived"].includes(job.status)) {
    await removeCalendarEvent(job.calendarEventId, job.calendarId || job.sourceCalendarId);
    await reference.set({ calendarSyncStatus: "cancelled", calendarSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { eventId: "", calendarId: job.calendarId || job.sourceCalendarId || "", cancelled: true };
  }
  try {
    const calendar = await upsertCalendarEvent(job, job.calendarEventId || "", job.calendarId || job.sourceCalendarId || "");
    await reference.set({ calendarEventId: calendar.eventId, calendarId: calendar.calendarId, calendarSyncStatus: "synced", calendarSyncedAt: FieldValue.serverTimestamp(), calendarSyncError: FieldValue.delete() }, { merge: true });
    return calendar;
  } catch (error) {
    await reference.set({ calendarSyncStatus: "failed", calendarSyncError: text(error?.message, 500), calendarSyncAttemptedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw new HttpsError("internal", `Calendar sync failed: ${text(error?.message, 300)}`);
  }
});

export const getCalendarHealthV6 = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const connected = await googleConnection();
  if (!connected) return { connected: false, selectedCalendarIds: [], primaryCalendarId: "", calendars: [], healthy: false, reason: "not-connected" };
  try {
    const config = await calendarConfig(connected);
    await google.calendar({ version: "v3", auth: connected.client }).calendarList.get({ calendarId: config.primaryCalendarId });
    return {
      connected: true,
      email: connected.email,
      healthy: Boolean(config.primaryCalendarId && config.selectedCalendarIds.length),
      selectedCalendarIds: config.selectedCalendarIds,
      primaryCalendarId: config.primaryCalendarId,
      calendars: config.rows.map(row => ({ id: row.id, name: row.summaryOverride || row.summary || row.id, primary: Boolean(row.primary), accessRole: row.accessRole || "reader" }))
    };
  } catch (error) {
    return { connected: true, email: connected.email, healthy: false, reason: "google-api-error", error: text(error?.message, 500), selectedCalendarIds: [], primaryCalendarId: "", calendars: [] };
  }
});
