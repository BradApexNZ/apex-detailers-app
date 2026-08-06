import crypto from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { google } from "googleapis";
import { DateTime } from "luxon";

initializeApp();
const db = getFirestore();
const REGION = "australia-southeast1";
const ZONE = defineString("APEX_TIME_ZONE", { default: "Pacific/Auckland" });
const OWNER_UIDS = defineString("APEX_OWNER_UIDS", { default: "fnc4G85CtmQVy0OooOzfOoSC9u22,FqDrn1aPFHXUB5ogb2rN9D7mRG42,maefd5cQ9qcIKSeU4b3yZKUL8UW2" });
const OWNER_EMAIL = defineString("APEX_OWNER_EMAIL", { default: "bookings@apexdetailers.co.nz" });
const APP_BASE_URL = defineString("APP_BASE_URL", { default: "https://apex-detailers.web.app" });
const GOOGLE_CALLBACK_URL = defineString("GOOGLE_CALLBACK_URL", { default: "https://australia-southeast1-apex-detailers.cloudfunctions.net/googleCalendarCallback" });
const CALENDAR_ID = defineString("GOOGLE_CALENDAR_ID", { default: "primary" });
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
const cleanEmail = value => text(value, 180).toLowerCase();
const cleanPhone = value => text(value, 40).replace(/[^0-9+ ]/g, "");
const serviceById = id => services.find(item => item.id === id) || services[1];
const owners = () => OWNER_UIDS.value().split(",").map(value => value.trim()).filter(Boolean);

function requireOwner(request) {
  if (!request.auth || !owners().includes(request.auth.uid)) {
    throw new HttpsError("permission-denied", "Apex owner access is required.");
  }
}

async function getSettings() {
  const snapshot = await db.doc("settings/booking").get();
  return { ...defaults, ...(snapshot.exists ? snapshot.data() : {}) };
}

function parseLocal(date, time) {
  const value = DateTime.fromISO(`${date}T${time}`, { zone: ZONE.value() });
  if (!value.isValid) throw new HttpsError("invalid-argument", "Choose a valid date and time.");
  return value;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function bookingLockId(date, time) {
  return `${date}_${time.replace(":", "-")}`;
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
    transaction.set(reference, {
      count: count + 1,
      windowStart: count ? data.windowStart : Timestamp.now(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

function keyMaterial() {
  return crypto.createHash("sha256").update(TOKEN_KEY.value()).digest();
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") };
}

function decrypt(payload) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload.data, "base64")), decipher.final()]).toString("utf8");
}

function oauthClient() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID.value(), GOOGLE_CLIENT_SECRET.value(), GOOGLE_CALLBACK_URL.value());
}

async function connectedGoogle() {
  const snapshot = await db.doc("integrations/google").get();
  if (!snapshot.exists || !snapshot.data().refreshToken) return null;
  const client = oauthClient();
  client.setCredentials({ refresh_token: decrypt(snapshot.data().refreshToken) });
  return { client, email: snapshot.data().email || OWNER_EMAIL.value() };
}

async function calendarBusy(start, end) {
  try {
    const connected = await connectedGoogle();
    if (!connected) return [];
    const calendar = google.calendar({ version: "v3", auth: connected.client });
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: start.toUTC().toISO(),
        timeMax: end.toUTC().toISO(),
        timeZone: ZONE.value(),
        items: [{ id: CALENDAR_ID.value() }]
      }
    });
    return (response.data.calendars?.[CALENDAR_ID.value()]?.busy || []).map(row => ({
      start: DateTime.fromISO(row.start),
      end: DateTime.fromISO(row.end)
    }));
  } catch (error) {
    console.error("Calendar freebusy failed", error);
    return [];
  }
}

async function availableSlots(date, serviceId) {
  const config = await getSettings();
  const service = serviceById(serviceId);
  const day = DateTime.fromISO(date, { zone: ZONE.value() }).startOf("day");
  const now = DateTime.now().setZone(ZONE.value());
  if (!config.enabled) return [];
  if (!day.isValid || day < now.startOf("day") || day > now.plus({ days: Number(config.bookingWindowDays || 60) }).endOf("day")) return [];
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
    blocked.push({ start: parseLocal(date, data.startTime), end: parseLocal(date, data.endTime) });
  });
  jobSnapshot.forEach(document => {
    const data = document.data();
    if (!data.bookingTime || ["Archived", "Cancelled"].includes(data.status)) return;
    const start = parseLocal(date, data.bookingTime);
    blocked.push({ start, end: start.plus({ minutes: Number(data.durationMinutes || serviceById(data.packageId).durationMinutes) }) });
  });
  blocked.push(...googleBusy);

  const rows = [];
  for (let start = open; start.plus({ minutes: service.durationMinutes }) <= close; start = start.plus({ minutes: Number(config.slotIntervalMinutes || 30) })) {
    const end = start.plus({ minutes: service.durationMinutes });
    if (start < minimum) continue;
    if (!blocked.some(block => overlaps(start, end, block.start, block.end))) {
      rows.push({ start: start.toFormat("HH:mm"), end: end.toFormat("HH:mm") });
    }
  }
  return rows;
}

function rawEmail({ to, subject, html, from }) {
  const message = [
    `From: Apex Detailers <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    html
  ].join("\r\n");
  return Buffer.from(message).toString("base64url");
}

async function sendMail({ to, subject, html }) {
  if (!to) return false;
  try {
    const connected = await connectedGoogle();
    if (!connected) return false;
    const gmail = google.gmail({ version: "v1", auth: connected.client });
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: rawEmail({ to, subject, html, from: connected.email }) }
    });
    return true;
  } catch (error) {
    console.error("Email send failed", error);
    return false;
  }
}

const emailShell = (heading, body) => `<div style="background:#09090a;padding:28px;font-family:Arial,sans-serif;color:#f7f4ea"><div style="max-width:620px;margin:auto;background:#151518;border:1px solid #3a3a3f;border-radius:22px;padding:28px"><div style="color:#ffd21f;font-weight:900;letter-spacing:2px">APEX DETAILERS</div><h1 style="font-size:32px">${heading}</h1>${body}<p style="color:#99958d;margin-top:28px">Apex Detailers · Hawke's Bay</p></div></div>`;

async function notifyRequest(data, config) {
  const vehicle = [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" ");
  const details = `<p><b>${data.serviceName}</b><br>${data.bookingDate} at ${data.bookingTime}<br>${vehicle}<br>${data.address}, ${data.area}</p>`;
  const results = { customer: false, owner: false };
  if (config.customerEmails) {
    results.customer = await sendMail({
      to: data.email,
      subject: "Apex booking request received",
      html: emailShell("We’ve received your booking request.", `${details}<p>Your selected time is being held while Brad reviews the vehicle details and final price.</p>`)
    });
  }
  if (config.ownerEmails) {
    results.owner = await sendMail({
      to: OWNER_EMAIL.value(),
      subject: `New Apex booking request — ${data.customerName}`,
      html: emailShell("New booking request", `${details}<p><b>Customer:</b> ${data.customerName}<br><b>Phone:</b> ${data.phone}<br><b>Email:</b> ${data.email}</p><p>Open Apex HQ to confirm or decline it.</p>`)
    });
  }
  return results;
}

async function notifyConfirmed(data, config) {
  const vehicle = data.vehicle || [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" ");
  const details = `<p><b>${data.packageName || data.serviceName}</b><br>${data.bookingDate} at ${data.bookingTime}<br>${vehicle}<br>${data.address}, ${data.area}</p>`;
  const results = { customer: false, owner: false };
  if (config.customerEmails) {
    results.customer = await sendMail({
      to: data.email,
      subject: "Your Apex Detailers booking is confirmed",
      html: emailShell("Your booking is confirmed.", `${details}<p>Please make sure an outside tap is accessible and remove valuables from the vehicle before the appointment.</p>`)
    });
  }
  if (config.ownerEmails) {
    results.owner = await sendMail({
      to: OWNER_EMAIL.value(),
      subject: `Apex booking confirmed — ${data.customerName}`,
      html: emailShell("Booking confirmed and synced", `${details}<p>${data.customerName} · ${data.phone}</p>`)
    });
  }
  return results;
}

async function createCalendarEvent(data, eventId) {
  const connected = await connectedGoogle();
  if (!connected) return null;
  const calendar = google.calendar({ version: "v3", auth: connected.client });
  const start = parseLocal(data.bookingDate, data.bookingTime);
  const end = data.bookingEndTime
    ? parseLocal(data.bookingDate, data.bookingEndTime)
    : start.plus({ minutes: Number(data.durationMinutes || serviceById(data.packageId || data.serviceId).durationMinutes) });
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
    extendedProperties: { private: { apexJobId: data.jobId || "", apexRequestId: data.requestId || "" } }
  };
  const response = eventId
    ? await calendar.events.update({ calendarId: CALENDAR_ID.value(), eventId, requestBody, sendUpdates: "none" })
    : await calendar.events.insert({ calendarId: CALENDAR_ID.value(), requestBody, sendUpdates: "none" });
  return response.data.id;
}

async function deleteCalendarEvent(eventId) {
  if (!eventId) return;
  try {
    const connected = await connectedGoogle();
    if (!connected) return;
    await google.calendar({ version: "v3", auth: connected.client }).events.delete({
      calendarId: CALENDAR_ID.value(), eventId, sendUpdates: "none"
    });
  } catch (error) {
    console.error("Calendar delete failed", error);
  }
}

export const getPublicBookingConfig = onCall({ region: REGION, enforceAppCheck: false }, async () => {
  const config = await getSettings();
  return {
    enabled: config.enabled,
    minimumNoticeHours: config.minimumNoticeHours,
    bookingWindowDays: config.bookingWindowDays,
    serviceAreas: config.serviceAreas,
    note: config.note,
    services
  };
});

export const listBookingAvailability = onCall({ region: REGION, secrets: GOOGLE_SECRETS, enforceAppCheck: false }, async request => {
  await rateLimit(request, "availability", 30, 10);
  const date = text(request.data?.date, 10);
  const serviceId = text(request.data?.serviceId, 30);
  return { date, slots: await availableSlots(date, serviceId) };
});

export const submitBookingRequest = onCall({ region: REGION, secrets: GOOGLE_SECRETS, enforceAppCheck: false }, async request => {
  await rateLimit(request, "booking", 6, 30);
  const input = request.data || {};
  if (input.website) throw new HttpsError("invalid-argument", "Unable to submit.");
  const service = serviceById(text(input.serviceId, 30));
  const data = {
    customerName: text(input.customerName, 160),
    phone: cleanPhone(input.phone),
    email: cleanEmail(input.email),
    address: text(input.address, 220),
    area: text(input.area, 100),
    vehicleYear: text(input.vehicleYear, 12),
    vehicleMake: text(input.vehicleMake, 80),
    vehicleModel: text(input.vehicleModel, 100),
    rego: text(input.rego, 20).toUpperCase(),
    vehicleType: text(input.vehicleType, 30),
    condition: text(input.condition, 30),
    petHair: Boolean(input.petHair),
    heavyStains: Boolean(input.heavyStains),
    notes: text(input.notes, 1500),
    bookingDate: text(input.bookingDate, 10),
    bookingTime: text(input.bookingTime, 5),
    bookingEndTime: text(input.bookingEndTime, 5),
    serviceId: service.id,
    serviceName: service.name,
    estimatedFromPrice: service.price,
    durationMinutes: service.durationMinutes,
    status: "pending",
    source: "public"
  };
  if (!data.customerName || !data.phone || !data.email || !data.address || !data.vehicleMake || !data.vehicleModel || !data.bookingDate || !data.bookingTime) {
    throw new HttpsError("invalid-argument", "Complete the required booking details.");
  }

  const options = await availableSlots(data.bookingDate, data.serviceId);
  if (!options.some(slot => slot.start === data.bookingTime)) {
    throw new HttpsError("already-exists", "That appointment is no longer available.");
  }

  const requestReference = db.collection("bookingRequests").doc();
  const lockReference = db.doc(`bookingLocks/${bookingLockId(data.bookingDate, data.bookingTime)}`);
  await db.runTransaction(async transaction => {
    if ((await transaction.get(lockReference)).exists) throw new HttpsError("already-exists", "That appointment was just taken.");
    transaction.create(lockReference, {
      date: data.bookingDate,
      startTime: data.bookingTime,
      endTime: data.bookingEndTime,
      requestId: requestReference.id,
      status: "pending",
      createdAt: FieldValue.serverTimestamp()
    });
    transaction.create(requestReference, {
      ...data,
      lockId: lockReference.id,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  });

  let eventId = null;
  try {
    eventId = await createCalendarEvent({ ...data, requestId: requestReference.id, serviceName: `PENDING — ${service.name}` });
    if (eventId) await requestReference.set({ calendarEventId: eventId }, { merge: true });
  } catch (error) {
    console.error("Pending calendar hold failed", error);
  }
  const config = await getSettings();
  const emails = await notifyRequest(data, config);
  await requestReference.set({ emailStatus: emails }, { merge: true });
  return {
    reference: requestReference.id.slice(0, 8).toUpperCase(),
    serviceName: service.name,
    bookingDate: data.bookingDate,
    bookingTime: data.bookingTime,
    emailSent: emails.customer
  };
});

export const submitInquiry = onCall({ region: REGION, secrets: GOOGLE_SECRETS, enforceAppCheck: false }, async request => {
  await rateLimit(request, "inquiry", 6, 30);
  const input = request.data || {};
  if (input.website) throw new HttpsError("invalid-argument", "Unable to submit.");
  const data = {
    name: text(input.name, 160),
    email: cleanEmail(input.email),
    phone: cleanPhone(input.phone),
    subject: text(input.subject, 160),
    message: text(input.message, 2500),
    status: "new",
    source: text(input.source, 80) || "website"
  };
  if (!data.name || !data.email || !data.message) throw new HttpsError("invalid-argument", "Add your name, email and message.");
  const reference = await db.collection("inquiries").add({ ...data, createdAt: FieldValue.serverTimestamp() });
  const config = await getSettings();
  if (config.ownerEmails) {
    await sendMail({
      to: OWNER_EMAIL.value(),
      subject: `New Apex inquiry — ${data.name}`,
      html: emailShell("New customer inquiry", `<p><b>${data.subject || "Website inquiry"}</b></p><p>${data.message.replace(/\n/g, "<br>")}</p><p>${data.name} · ${data.phone} · ${data.email}</p>`)
    });
  }
  if (config.customerEmails) {
    await sendMail({
      to: data.email,
      subject: "Apex Detailers received your inquiry",
      html: emailShell("Thanks for getting in touch.", "<p>Brad has received your message and will respond as soon as possible.</p>")
    });
  }
  return { reference: reference.id.slice(0, 8).toUpperCase() };
});

export const approveBookingRequest = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const reference = db.doc(`bookingRequests/${text(request.data?.requestId, 80)}`);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Booking request not found.");
  const item = { id: snapshot.id, ...snapshot.data() };
  if (item.status !== "pending") throw new HttpsError("failed-precondition", "That request has already been reviewed.");

  const matches = await db.collection("customers").where("email", "==", item.email).limit(1).get();
  const customerReference = matches.empty ? db.collection("customers").doc() : matches.docs[0].ref;
  const jobReference = db.collection("jobs").doc();
  const vehicle = [item.vehicleYear, item.vehicleMake, item.vehicleModel].filter(Boolean).join(" ");
  const service = serviceById(item.serviceId);
  const batch = db.batch();

  if (matches.empty) {
    const parts = item.customerName.split(/\s+/);
    batch.set(customerReference, {
      firstName: parts.shift() || item.customerName,
      lastName: parts.join(" "),
      customerName: item.customerName,
      phone: item.phone,
      email: item.email,
      address: item.address,
      area: item.area,
      customerType: "standard",
      preferredContact: "email",
      lastVehicle: vehicle,
      lastJobStatus: "Booked",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  } else {
    batch.set(customerReference, {
      phone: item.phone,
      address: item.address,
      area: item.area,
      lastVehicle: vehicle,
      lastJobStatus: "Booked",
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  const job = {
    customerId: customerReference.id,
    customerName: item.customerName,
    phone: item.phone,
    email: item.email,
    address: item.address,
    area: item.area,
    vehicleYear: item.vehicleYear,
    vehicleMake: item.vehicleMake,
    vehicleModel: item.vehicleModel,
    vehicle,
    rego: item.rego,
    vehicleType: item.vehicleType,
    condition: item.condition,
    petHair: item.petHair,
    heavyStains: item.heavyStains,
    packageId: item.serviceId,
    packageName: item.serviceName,
    total: item.estimatedFromPrice,
    durationMinutes: service.durationMinutes,
    bookingDate: item.bookingDate,
    bookingTime: item.bookingTime,
    bookingEndTime: item.bookingEndTime,
    status: "Booked",
    mode: "booking",
    notes: item.notes,
    source: "online-booking",
    sourceBookingRequestId: item.id,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
  batch.set(jobReference, job);
  batch.set(reference, { status: "accepted", jobId: jobReference.id, customerId: customerReference.id, reviewedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.set(db.doc(`bookingLocks/${item.lockId}`), { status: "confirmed", jobId: jobReference.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();

  const eventId = await createCalendarEvent({ ...job, jobId: jobReference.id }, item.calendarEventId);
  if (eventId) await jobReference.set({ calendarEventId: eventId }, { merge: true });
  const config = await getSettings();
  const emails = await notifyConfirmed(job, config);
  await reference.set({ confirmationEmailStatus: emails }, { merge: true });
  return { jobId: jobReference.id, calendarEventId: eventId, emails };
});

export const declineBookingRequest = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const reference = db.doc(`bookingRequests/${text(request.data?.requestId, 80)}`);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Booking request not found.");
  const item = snapshot.data();
  await deleteCalendarEvent(item.calendarEventId);
  const batch = db.batch();
  batch.set(reference, { status: "declined", reviewedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (item.lockId) batch.delete(db.doc(`bookingLocks/${item.lockId}`));
  await batch.commit();
  const config = await getSettings();
  if (config.customerEmails) {
    await sendMail({
      to: item.email,
      subject: "Apex booking request update",
      html: emailShell("That appointment couldn’t be confirmed.", "<p>The requested time has been released. Please choose another time through the Apex booking page or contact Brad directly.</p>")
    });
  }
  return { ok: true };
});

export const createManualBooking = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const input = request.data || {};
  const service = serviceById(text(input.serviceId, 30));
  const data = {
    customerName: text(input.customerName, 160),
    phone: cleanPhone(input.phone),
    email: cleanEmail(input.email),
    address: text(input.address, 220),
    area: text(input.area, 100),
    vehicleYear: text(input.vehicleYear, 12),
    vehicleMake: text(input.vehicleMake, 80),
    vehicleModel: text(input.vehicleModel, 100),
    rego: text(input.rego, 20).toUpperCase(),
    vehicleType: text(input.vehicleType, 30),
    bookingDate: text(input.bookingDate, 10),
    bookingTime: text(input.bookingTime, 5),
    notes: text(input.notes, 1500),
    packageId: service.id,
    packageName: service.name,
    total: service.price,
    durationMinutes: service.durationMinutes,
    status: "Booked",
    mode: "booking",
    source: "hq-manual"
  };
  if (!data.customerName || !data.email || !data.phone || !data.bookingDate || !data.bookingTime) {
    throw new HttpsError("invalid-argument", "Complete the booking details.");
  }
  const start = parseLocal(data.bookingDate, data.bookingTime);
  data.bookingEndTime = start.plus({ minutes: service.durationMinutes }).toFormat("HH:mm");
  if (!input.overrideConflict) {
    const slots = await availableSlots(data.bookingDate, data.packageId);
    if (!slots.some(slot => slot.start === data.bookingTime)) {
      throw new HttpsError("already-exists", "That time conflicts with Apex HQ or Google Calendar.");
    }
  }

  const customerReference = db.collection("customers").doc();
  const jobReference = db.collection("jobs").doc();
  const vehicle = [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" ");
  const lockReference = db.doc(`bookingLocks/${bookingLockId(data.bookingDate, data.bookingTime)}`);
  const parts = data.customerName.split(/\s+/);
  const batch = db.batch();
  batch.set(customerReference, {
    firstName: parts.shift() || data.customerName,
    lastName: parts.join(" "),
    customerName: data.customerName,
    phone: data.phone,
    email: data.email,
    address: data.address,
    area: data.area,
    lastVehicle: vehicle,
    lastJobStatus: "Booked",
    customerType: "standard",
    preferredContact: "email",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  batch.set(jobReference, { ...data, customerId: customerReference.id, vehicle, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  batch.set(lockReference, {
    date: data.bookingDate,
    startTime: data.bookingTime,
    endTime: data.bookingEndTime,
    status: "confirmed",
    jobId: jobReference.id,
    source: "hq-manual",
    createdAt: FieldValue.serverTimestamp()
  });
  await batch.commit();

  const eventId = await createCalendarEvent({ ...data, vehicle, jobId: jobReference.id });
  if (eventId) await jobReference.set({ calendarEventId: eventId }, { merge: true });
  const emails = await notifyConfirmed({ ...data, vehicle }, await getSettings());
  return { jobId: jobReference.id, eventId, emails };
});

export const getGoogleCalendarStatus = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const snapshot = await db.doc("integrations/google").get();
  return {
    connected: snapshot.exists && Boolean(snapshot.data().refreshToken),
    email: snapshot.data()?.email || "",
    connectedAt: snapshot.data()?.connectedAt?.toDate?.()?.toISOString?.() || null
  };
});

export const startGoogleCalendarConnect = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const state = crypto.randomBytes(24).toString("hex");
  await db.doc(`oauthStates/${state}`).set({
    uid: request.auth.uid,
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60000),
    createdAt: FieldValue.serverTimestamp()
  });
  const url = oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/gmail.send", "openid", "email"],
    state
  });
  return { url };
});

export const googleCalendarCallback = onRequest({ region: REGION, secrets: GOOGLE_SECRETS }, async (request, response) => {
  try {
    const state = text(request.query.state, 100);
    const code = text(request.query.code, 500);
    const stateReference = db.doc(`oauthStates/${state}`);
    const stateSnapshot = await stateReference.get();
    if (!stateSnapshot.exists || stateSnapshot.data().expiresAt.toMillis() < Date.now()) throw new Error("Invalid or expired OAuth state.");
    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Reconnect and approve access.");
    client.setCredentials(tokens);
    const profile = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
    await db.doc("integrations/google").set({
      refreshToken: encrypt(tokens.refresh_token),
      email: profile.data.email || OWNER_EMAIL.value(),
      scopes: tokens.scope || "",
      connectedBy: stateSnapshot.data().uid,
      connectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await stateReference.delete();
    response.redirect(`${APP_BASE_URL.value()}/hq?google=connected`);
  } catch (error) {
    console.error(error);
    response.status(400).send("Google connection failed. Return to Apex HQ and try again.");
  }
});

export const syncJobToCalendar = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const reference = db.doc(`jobs/${text(request.data?.jobId, 80)}`);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Job not found.");
  const job = { jobId: snapshot.id, ...snapshot.data() };
  const eventId = await createCalendarEvent(job, job.calendarEventId);
  if (eventId) await reference.set({ calendarEventId: eventId, calendarSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { eventId };
});
