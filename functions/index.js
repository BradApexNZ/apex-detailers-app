import crypto from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { google } from "googleapis";
import { DateTime } from "luxon";

// The googleapis client has no default request timeout - a stalled connection to
// Google's servers (rare, but it happens) hangs the calling request forever with
// no error, which for the public booking functions means the customer's page is
// stuck on "loading" indefinitely. This bounds every Google API call made below.
google.options({ timeout: 10000 });

initializeApp();
const db = getFirestore();
const REGION = "australia-southeast1";
const ZONE = defineString("APEX_TIME_ZONE", { default: "Pacific/Auckland" });
const OWNER_UIDS = defineString("APEX_OWNER_UIDS", {
  default: "fnc4G85CtmQVy0OooOzfOoSC9u22,FqDrn1aPFHXUB5ogb2rN9D7mRG42,maefd5cQ9qcIKSeU4b3yZKUL8UW2"
});
const OWNER_EMAIL = defineString("APEX_OWNER_EMAIL", { default: "bookings@apexdetailers.co.nz" });
const APP_BASE_URL = defineString("APP_BASE_URL", { default: "https://apex-detailers.web.app" });
const GOOGLE_CALLBACK_URL = defineString("GOOGLE_CALLBACK_URL", {
  default: "https://australia-southeast1-apex-detailers.cloudfunctions.net/googleCalendarCallback"
});
const CALENDAR_ID = defineString("GOOGLE_CALENDAR_ID", { default: "primary" });
const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
const TOKEN_KEY = defineSecret("TOKEN_ENCRYPTION_KEY");
const GOOGLE_SECRETS = [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_KEY];

const services = [
  {
    id: "maintenance",
    name: "Maintenance Clean",
    price: 150,
    durationMinutes: 180,
    description: "For regular clients whose vehicle has already had a deep detail."
  },
  {
    id: "deep",
    name: "Deep Interior Detail",
    price: 179,
    durationMinutes: 300,
    description: "A thorough interior reset with steam cleaning and extraction where required."
  },
  {
    id: "full",
    name: "Full Detail",
    price: 249,
    durationMinutes: 360,
    description: "Deep interior detail plus exterior wash, wheels, tyres and glass."
  },
  { id: "tradie", name: "Tradie Reset", price: 229, durationMinutes: 360, description: "Heavy-duty reset for work utes and vans." },
  {
    id: "seats",
    name: "Seats Out Reset",
    price: 399,
    durationMinutes: 480,
    description: "Maximum-access interior reset, subject to suitability confirmation."
  }
];
const publicServiceIds = new Set(["deep", "full", "tradie", "seats"]);

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

const text = (value, max = 500) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const escapeHtml = value =>
  String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const cleanEmail = value => text(value, 180).toLowerCase();
const cleanPhone = value => text(value, 40).replace(/[^0-9+ ]/g, "");
const serviceById = id => services.find(item => item.id === id) || services[1];
const owners = () =>
  OWNER_UIDS.value()
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

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
    transaction.set(
      reference,
      {
        count: count + 1,
        windowStart: count ? data.windowStart : Timestamp.now(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
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
  const writableIds = new Set(rows.filter(row => ["owner", "writer"].includes(row.accessRole)).map(row => row.id));
  const preferenceSnapshot = await db.doc("settings/googleCalendar").get();
  const preferences = preferenceSnapshot.exists ? preferenceSnapshot.data() : {};
  const configured = Array.isArray(preferences.selectedCalendarIds) ? preferences.selectedCalendarIds.filter(id => allowed.has(id)) : [];
  const fallback = rows.filter(row => row.primary).map(row => row.id);
  const selectedCalendarIds = configured.length ? configured : fallback;
  const requestedPrimary = text(preferences.primaryCalendarId, 300);
  const primaryCalendarId =
    selectedCalendarIds.includes(requestedPrimary) && writableIds.has(requestedPrimary)
      ? requestedPrimary
      : selectedCalendarIds.find(id => writableIds.has(id)) || "";
  return { rows, selectedCalendarIds, primaryCalendarId };
}

async function calendarBusy(start, end) {
  const connected = await connectedGoogle();
  if (!connected) return [];
  try {
    const config = await calendarConfig(connected);
    if (!config.selectedCalendarIds.length) return [];
    const response = await google.calendar({ version: "v3", auth: connected.client }).freebusy.query({
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
    console.error("Calendar freebusy failed", error);
    throw new HttpsError("unavailable", "Google Calendar availability could not be verified. Please try again shortly.");
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
    if (data.serverVerified !== true) return;
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
  for (
    let start = open;
    start.plus({ minutes: service.durationMinutes }) <= close;
    start = start.plus({ minutes: Number(config.slotIntervalMinutes || 30) })
  ) {
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

const emailShell = (heading, body) =>
  `<div style="background:#09090a;padding:28px;font-family:Arial,sans-serif;color:#f7f4ea"><div style="max-width:620px;margin:auto;background:#151518;border:1px solid #3a3a3f;border-radius:22px;padding:28px"><div style="color:#ffd21f;font-weight:900;letter-spacing:2px">APEX DETAILERS</div><h1 style="font-size:32px">${heading}</h1>${body}<p style="color:#99958d;margin-top:28px">Apex Detailers · Hawke's Bay</p></div></div>`;

async function notifyRequest(data, config) {
  const vehicle = escapeHtml([data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" "));
  const details = `<p><b>${escapeHtml(data.serviceName)}</b><br>${escapeHtml(data.bookingDate)} at ${escapeHtml(data.bookingTime)}<br>${vehicle}<br>${escapeHtml(data.address)}, ${escapeHtml(data.area)}</p>`;
  const results = { customer: false, owner: false };
  if (config.customerEmails) {
    results.customer = await sendMail({
      to: data.email,
      subject: "Apex booking request received",
      html: emailShell(
        "We’ve received your booking request.",
        `${details}<p>Your selected time is being held while Brad reviews the vehicle details and final price.</p>`
      )
    });
  }
  if (config.ownerEmails) {
    results.owner = await sendMail({
      to: OWNER_EMAIL.value(),
      subject: `New Apex booking request — ${data.customerName}`,
      html: emailShell(
        "New booking request",
        `${details}<p><b>Customer:</b> ${escapeHtml(data.customerName)}<br><b>Phone:</b> ${escapeHtml(data.phone)}<br><b>Email:</b> ${escapeHtml(data.email)}</p><p>Open Apex HQ to confirm or decline it.</p>`
      )
    });
  }
  return results;
}

async function notifyConfirmed(data, config) {
  const vehicle = escapeHtml(data.vehicle || [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" "));
  const details = `<p><b>${escapeHtml(data.packageName || data.serviceName)}</b><br>${escapeHtml(data.bookingDate)} at ${escapeHtml(data.bookingTime)}<br>${vehicle}<br>${escapeHtml(data.address)}, ${escapeHtml(data.area)}</p>`;
  const results = { customer: false, owner: false };
  if (config.customerEmails) {
    results.customer = await sendMail({
      to: data.email,
      subject: "Your Apex Detailers booking is confirmed",
      html: emailShell(
        "Your booking is confirmed.",
        `${details}<p>Please make sure an outside tap is accessible and remove valuables from the vehicle before the appointment.</p>`
      )
    });
  }
  if (config.ownerEmails) {
    results.owner = await sendMail({
      to: OWNER_EMAIL.value(),
      subject: `Apex booking confirmed — ${data.customerName}`,
      html: emailShell("Booking confirmed and synced", `${details}<p>${escapeHtml(data.customerName)} · ${escapeHtml(data.phone)}</p>`)
    });
  }
  return results;
}

async function createCalendarEvent(data, eventId = "", existingCalendarId = "") {
  const connected = await connectedGoogle();
  if (!connected) return { eventId: "", calendarId: "" };
  const config = await calendarConfig(connected);
  const calendarId = existingCalendarId || data.calendarId || data.sourceCalendarId || config.primaryCalendarId;
  if (!calendarId) throw new HttpsError("failed-precondition", "No writable primary Google Calendar is selected for Apex.");
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
    extendedProperties: { private: { apexJobId: data.jobId || "", apexRequestId: data.requestId || "", apexLaunch: "true" } }
  };
  const response = eventId
    ? await calendar.events.update({ calendarId, eventId, requestBody, sendUpdates: "none" })
    : await calendar.events.insert({ calendarId, requestBody, sendUpdates: "none" });
  return { eventId: response.data.id || eventId, calendarId };
}

async function deleteCalendarEvent(eventId, calendarId = "") {
  if (!eventId) return;
  try {
    const connected = await connectedGoogle();
    if (!connected) return;
    const config = await calendarConfig(connected);
    const targetCalendar = calendarId || config.primaryCalendarId;
    if (!targetCalendar) return;
    await google
      .calendar({ version: "v3", auth: connected.client })
      .events.delete({ calendarId: targetCalendar, eventId, sendUpdates: "none" });
  } catch (error) {
    if (![404, 410].includes(error?.code)) console.error("Calendar delete failed", error);
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

export const getPublicBookingConfig = onCall({ region: REGION, enforceAppCheck: true }, async () => {
  const config = await getSettings();
  return {
    enabled: config.enabled,
    minimumNoticeHours: config.minimumNoticeHours,
    bookingWindowDays: config.bookingWindowDays,
    serviceAreas: config.serviceAreas,
    note: config.note,
    services: services.filter(service => publicServiceIds.has(service.id))
  };
});

export const listBookingAvailability = onCall({ region: REGION, secrets: GOOGLE_SECRETS, enforceAppCheck: true }, async request => {
  await rateLimit(request, "availability", 30, 10);
  const date = text(request.data?.date, 10);
  const serviceId = text(request.data?.serviceId, 30);
  if (!publicServiceIds.has(serviceId)) throw new HttpsError("invalid-argument", "Choose a publicly available Apex service.");
  return { date, slots: await availableSlots(date, serviceId) };
});

export const submitBookingRequest = onCall({ region: REGION, secrets: GOOGLE_SECRETS, enforceAppCheck: true }, async request => {
  await rateLimit(request, "booking", 6, 30);
  const input = request.data || {};
  if (input.website) throw new HttpsError("invalid-argument", "Unable to submit.");
  const requestedServiceId = text(input.serviceId, 30);
  if (!publicServiceIds.has(requestedServiceId)) throw new HttpsError("invalid-argument", "Choose a publicly available Apex service.");
  const service = serviceById(requestedServiceId);
  const bookingConfig = await getSettings();
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
    bookingEndTime: "",
    serviceId: service.id,
    serviceName: service.name,
    estimatedFromPrice: service.price,
    durationMinutes: service.durationMinutes,
    status: "pending",
    source: "public"
  };
  if (
    !data.customerName ||
    !data.phone ||
    !data.email ||
    !data.address ||
    !data.vehicleMake ||
    !data.vehicleModel ||
    !data.bookingDate ||
    !data.bookingTime
  ) {
    throw new HttpsError("invalid-argument", "Complete the required booking details.");
  }
  if (!Boolean(input.acceptedTerms))
    throw new HttpsError("invalid-argument", "Accept the booking and pricing conditions before submitting.");
  if (!/^\S+@\S+\.\S+$/.test(data.email)) throw new HttpsError("invalid-argument", "Enter a valid email address.");
  if (data.phone.replace(/\D/g, "").length < 7) throw new HttpsError("invalid-argument", "Enter a valid phone number.");
  if (!(bookingConfig.serviceAreas || []).map(value => String(value).toLowerCase()).includes(data.area.toLowerCase())) {
    throw new HttpsError("invalid-argument", "Choose an Apex service area from the booking form.");
  }
  const requestedStart = parseLocal(data.bookingDate, data.bookingTime);
  data.bookingEndTime = requestedStart.plus({ minutes: service.durationMinutes }).toFormat("HH:mm");

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
      serverVerified: true,
      createdAt: FieldValue.serverTimestamp()
    });
    transaction.create(requestReference, {
      ...data,
      lockId: lockReference.id,
      serverVerified: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  });

  let eventId = "";
  let calendarId = "";
  let calendarError = "";
  try {
    const calendarResult = await createCalendarEvent({ ...data, requestId: requestReference.id, serviceName: `PENDING — ${service.name}` });
    eventId = calendarResult.eventId;
    calendarId = calendarResult.calendarId;
    await requestReference.set(
      {
        calendarEventId: eventId,
        calendarId,
        calendarSyncStatus: eventId ? "pending-hold-synced" : "not-connected",
        calendarSyncedAt: eventId ? FieldValue.serverTimestamp() : null,
        calendarSyncError: FieldValue.delete()
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Pending calendar hold failed", error);
    calendarError = text(error?.message, 500) || "Calendar hold failed.";
    await requestReference.set(
      {
        calendarSyncStatus: "failed",
        calendarSyncError: calendarError,
        calendarSyncAttemptedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }
  const config = bookingConfig;
  const emails = await notifyRequest(data, config);
  await requestReference.set({ emailStatus: emails }, { merge: true });
  return {
    reference: requestReference.id.slice(0, 8).toUpperCase(),
    serviceName: service.name,
    bookingDate: data.bookingDate,
    bookingTime: data.bookingTime,
    emailSent: emails.customer,
    calendarStatus: calendarError ? "needs-retry" : eventId ? "held" : "not-connected"
  };
});

export const submitInquiry = onCall({ region: REGION, secrets: GOOGLE_SECRETS, enforceAppCheck: true }, async request => {
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
      html: emailShell(
        "New customer inquiry",
        `<p><b>${escapeHtml(data.subject) || "Website inquiry"}</b></p><p>${escapeHtml(data.message).replace(/\n/g, "<br>")}</p><p>${escapeHtml(data.name)} · ${escapeHtml(data.phone)} · ${escapeHtml(data.email)}</p>`
      )
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
    batch.set(
      customerReference,
      {
        phone: item.phone,
        address: item.address,
        area: item.area,
        lastVehicle: vehicle,
        lastJobStatus: "Booked",
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
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
  batch.set(
    reference,
    { status: "accepted", jobId: jobReference.id, customerId: customerReference.id, reviewedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  batch.set(
    db.doc(`bookingLocks/${item.lockId}`),
    { status: "confirmed", jobId: jobReference.id, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await batch.commit();

  let eventId = "";
  let calendarId = item.calendarId || "";
  let calendarError = "";
  try {
    const calendarResult = await createCalendarEvent({ ...job, jobId: jobReference.id }, item.calendarEventId || "", item.calendarId || "");
    eventId = calendarResult.eventId;
    calendarId = calendarResult.calendarId;
    await jobReference.set(
      {
        calendarEventId: eventId,
        calendarId,
        calendarSyncStatus: eventId ? "synced" : "not-connected",
        calendarSyncedAt: eventId ? FieldValue.serverTimestamp() : null,
        calendarSyncError: FieldValue.delete()
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Approved booking Calendar sync failed after commit", error);
    calendarError = text(error?.message, 500) || "Calendar sync failed.";
    await jobReference.set(
      {
        calendarSyncStatus: "failed",
        calendarSyncError: calendarError,
        calendarSyncAttemptedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }
  const config = await getSettings();
  const emails = await notifyConfirmed(job, config);
  await reference.set(
    {
      confirmationEmailStatus: emails,
      calendarSyncStatus: calendarError ? "failed" : eventId ? "synced" : "not-connected",
      calendarSyncError: calendarError || FieldValue.delete()
    },
    { merge: true }
  );
  return { jobId: jobReference.id, calendarEventId: eventId, calendarId, calendarError, emails };
});

export const declineBookingRequest = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const reference = db.doc(`bookingRequests/${text(request.data?.requestId, 80)}`);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Booking request not found.");
  const item = snapshot.data();
  await deleteCalendarEvent(item.calendarEventId, item.calendarId);
  const batch = db.batch();
  batch.set(reference, { status: "declined", reviewedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (item.lockId) batch.delete(db.doc(`bookingLocks/${item.lockId}`));
  await batch.commit();
  const config = await getSettings();
  if (config.customerEmails) {
    await sendMail({
      to: item.email,
      subject: "Apex booking request update",
      html: emailShell(
        "That appointment couldn’t be confirmed.",
        "<p>The requested time has been released. Please choose another time through the Apex booking page or contact Brad directly.</p>"
      )
    });
  }
  return { ok: true };
});

export const createManualBooking = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const input = request.data || {};
  const sourceQuoteId = text(input.sourceQuoteId, 80);
  let sourceQuote = null;
  let sourceQuoteReference = null;
  if (sourceQuoteId) {
    sourceQuoteReference = db.doc(`jobs/${sourceQuoteId}`);
    const quoteSnapshot = await sourceQuoteReference.get();
    if (!quoteSnapshot.exists) throw new HttpsError("not-found", "The source quote could not be found.");
    sourceQuote = quoteSnapshot.data();
    if (!["Lead", "Quote Requested", "Quote Sent", "Approved"].includes(sourceQuote.status)) {
      throw new HttpsError("failed-precondition", "That quote has already been converted or is no longer active.");
    }
  }

  const service = serviceById(text(sourceQuote?.packageId || input.serviceId, 30));
  const quotedTotal = sourceQuote ? Number(sourceQuote.total) : Number(service.price);
  if (!Number.isFinite(quotedTotal) || quotedTotal < 0) throw new HttpsError("failed-precondition", "The booking price is invalid.");

  const data = {
    customerName: text(input.customerName || sourceQuote?.customerName, 160),
    phone: cleanPhone(input.phone || sourceQuote?.phone),
    email: cleanEmail(input.email || sourceQuote?.email),
    address: text(input.address || sourceQuote?.address, 220),
    area: text(input.area || sourceQuote?.area, 100),
    vehicleYear: text(input.vehicleYear || sourceQuote?.vehicleYear, 12),
    vehicleMake: text(input.vehicleMake || sourceQuote?.vehicleMake, 80),
    vehicleModel: text(input.vehicleModel || sourceQuote?.vehicleModel, 100),
    rego: text(input.rego || sourceQuote?.rego, 20).toUpperCase(),
    vehicleType: text(input.vehicleType || sourceQuote?.vehicleType, 30),
    condition: text(sourceQuote?.condition || input.condition, 30),
    bookingDate: text(input.bookingDate, 10),
    bookingTime: text(input.bookingTime, 5),
    notes: text(input.notes || sourceQuote?.notes, 1500),
    packageId: service.id,
    packageName: text(sourceQuote?.packageName || service.name, 120),
    total: quotedTotal,
    durationMinutes: Number(sourceQuote?.durationMinutes || service.durationMinutes),
    selectedAddons: Array.isArray(sourceQuote?.selectedAddons) ? sourceQuote.selectedAddons.slice(0, 30).map(value => text(value, 80)) : [],
    addonNames: Array.isArray(sourceQuote?.addonNames) ? sourceQuote.addonNames.slice(0, 30).map(value => text(value, 120)) : [],
    manualAdjustment: Number(sourceQuote?.manualAdjustment || 0),
    travel: Number(sourceQuote?.travel || 0),
    manualTotal: sourceQuote?.manualTotal ?? "",
    status: "Booked",
    mode: "booking",
    source: sourceQuote ? "hq-quote-conversion" : "hq-manual",
    sourceQuoteId: sourceQuoteId || ""
  };

  if (
    !data.customerName ||
    !data.phone ||
    !data.address ||
    !data.vehicleMake ||
    !data.vehicleModel ||
    !data.bookingDate ||
    !data.bookingTime
  ) {
    throw new HttpsError("invalid-argument", "Complete the customer, address, vehicle, date and time before booking.");
  }

  const startTime = parseLocal(data.bookingDate, data.bookingTime);
  data.bookingEndTime = startTime.plus({ minutes: data.durationMinutes }).toFormat("HH:mm");
  if (!input.overrideConflict) {
    const slots = await availableSlots(data.bookingDate, data.packageId);
    if (!slots.some(slot => slot.start === data.bookingTime)) {
      throw new HttpsError("already-exists", "That time conflicts with Apex HQ or Google Calendar.");
    }
  }

  let customerReference;
  const linkedCustomerId = text(sourceQuote?.customerId || input.sourceCustomerId, 80);
  if (linkedCustomerId) {
    const linked = db.doc(`customers/${linkedCustomerId}`);
    customerReference = (await linked.get()).exists ? linked : await findCustomer(data);
  } else {
    customerReference = await findCustomer(data);
  }
  const existingCustomer = await customerReference.get();
  const jobReference = sourceQuoteReference || db.collection("jobs").doc();
  const vehicle = [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" ");
  const lockReference = db.doc(`bookingLocks/${bookingLockId(data.bookingDate, data.bookingTime)}`);
  const parts = data.customerName.split(/\s+/);
  const batch = db.batch();

  batch.set(
    customerReference,
    {
      ...(existingCustomer.exists
        ? {}
        : {
            firstName: parts.shift() || data.customerName,
            lastName: parts.join(" "),
            customerName: data.customerName,
            customerType: "standard",
            preferredContact: "email",
            createdAt: FieldValue.serverTimestamp()
          }),
      phone: data.phone,
      email: data.email,
      address: data.address,
      area: data.area,
      lastVehicle: vehicle,
      lastJobStatus: "Booked",
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  const jobPayload = {
    ...data,
    customerId: customerReference.id,
    vehicle,
    statusHistory: FieldValue.arrayUnion({ status: "Booked", at: new Date().toISOString() }),
    ...(sourceQuote ? { convertedFromQuoteAt: FieldValue.serverTimestamp() } : { createdAt: FieldValue.serverTimestamp() }),
    updatedAt: FieldValue.serverTimestamp()
  };
  batch.set(jobReference, jobPayload, { merge: true });
  batch.set(
    lockReference,
    {
      date: data.bookingDate,
      startTime: data.bookingTime,
      endTime: data.bookingEndTime,
      status: "confirmed",
      jobId: jobReference.id,
      source: data.source,
      serverVerified: true,
      createdAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  await batch.commit();

  let eventId = "";
  let calendarId = "";
  let calendarError = "";
  try {
    const calendarResult = await createCalendarEvent(
      { ...data, vehicle, jobId: jobReference.id },
      sourceQuote?.calendarEventId || "",
      sourceQuote?.calendarId || ""
    );
    eventId = calendarResult.eventId;
    calendarId = calendarResult.calendarId;
    await jobReference.set(
      {
        calendarEventId: eventId,
        calendarId,
        calendarSyncStatus: eventId ? "synced" : "not-connected",
        calendarSyncedAt: FieldValue.serverTimestamp(),
        calendarSyncError: FieldValue.delete()
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Manual booking Calendar sync failed after commit", error);
    calendarError = text(error?.message, 500) || "Calendar sync failed.";
    await jobReference.set(
      {
        calendarSyncStatus: "failed",
        calendarSyncError: calendarError,
        calendarSyncAttemptedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  const emails = await notifyConfirmed({ ...data, vehicle }, await getSettings());
  return { jobId: jobReference.id, eventId, calendarId, calendarError, emails, convertedQuote: Boolean(sourceQuote) };
});

export const getGoogleCalendarStatus = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const connected = await connectedGoogle();
  if (!connected) return { connected: false, email: "", calendars: [], selectedCalendarIds: [], primaryCalendarId: "", healthy: false };
  try {
    const config = await calendarConfig(connected);
    return {
      connected: true,
      email: connected.email,
      connectedAt: connected.data.connectedAt?.toDate?.()?.toISOString?.() || null,
      calendars: config.rows.map(row => ({
        id: row.id,
        name: row.summaryOverride || row.summary || row.id,
        primary: Boolean(row.primary),
        accessRole: row.accessRole || "reader",
        writable: ["owner", "writer"].includes(row.accessRole)
      })),
      selectedCalendarIds: config.selectedCalendarIds,
      primaryCalendarId: config.primaryCalendarId,
      healthy: Boolean(config.selectedCalendarIds.length && config.primaryCalendarId)
    };
  } catch (error) {
    return {
      connected: true,
      email: connected.email,
      calendars: [],
      selectedCalendarIds: [],
      primaryCalendarId: "",
      healthy: false,
      reason: "google-api-error",
      error: text(error?.message, 500)
    };
  }
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
    await db.doc("integrations/google").set(
      {
        refreshToken: encrypt(tokens.refresh_token),
        email: profile.data.email || OWNER_EMAIL.value(),
        scopes: tokens.scope || "",
        connectedBy: stateSnapshot.data().uid,
        connectedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    await stateReference.delete();
    response.redirect(`${APP_BASE_URL.value()}/hq?google=connected`);
  } catch (error) {
    console.error(error);
    response.status(400).send("Google connection failed. Return to Apex HQ and try again.");
  }
});

export const importGoogleCalendarEvents = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const connected = await connectedGoogle();
  if (!connected) throw new HttpsError("failed-precondition", "Connect Google Calendar before importing events.");
  const config = await calendarConfig(connected);
  if (!config.selectedCalendarIds.length) throw new HttpsError("failed-precondition", "Select at least one Google Calendar first.");

  const daysBack = Math.max(0, Math.min(365, Number(request.data?.daysBack ?? 30)));
  const daysForward = Math.max(1, Math.min(730, Number(request.data?.daysForward ?? 365)));
  const timeMin = DateTime.now().setZone(ZONE.value()).minus({ days: daysBack }).startOf("day");
  const timeMax = DateTime.now().setZone(ZONE.value()).plus({ days: daysForward }).endOf("day");
  const calendar = google.calendar({ version: "v3", auth: connected.client });
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const calendarId of config.selectedCalendarIds) {
    let pageToken;
    do {
      const response = await calendar.events.list({
        calendarId,
        timeMin: timeMin.toUTC().toISO(),
        timeMax: timeMax.toUTC().toISO(),
        singleEvents: true,
        orderBy: "startTime",
        showDeleted: false,
        maxResults: 2500,
        pageToken
      });
      for (const event of response.data.items || []) {
        if (!event.id || event.status === "cancelled") continue;
        if (event.extendedProperties?.private?.apexLaunch === "true" || event.extendedProperties?.private?.apexJobId) {
          skipped += 1;
          continue;
        }
        const rawStart = event.start?.dateTime || event.start?.date;
        const rawEnd = event.end?.dateTime || event.end?.date;
        if (!rawStart || !rawEnd) continue;
        const start = DateTime.fromISO(rawStart, { zone: ZONE.value() }).setZone(ZONE.value());
        const end = DateTime.fromISO(rawEnd, { zone: ZONE.value() }).setZone(ZONE.value());
        if (!start.isValid || !end.isValid) continue;
        const externalId = crypto
          .createHash("sha256")
          .update(calendarId + ":" + event.id)
          .digest("hex")
          .slice(0, 40);
        const reference = db.doc("jobs/google_" + externalId);
        const existing = await reference.get();
        const allDay = !event.start?.dateTime;
        const payload = {
          customerName: text(event.summary || "Google Calendar event", 160),
          vehicle: "External calendar event",
          packageName: "Google Calendar",
          bookingDate: start.toFormat("yyyy-MM-dd"),
          bookingTime: allDay ? "00:00" : start.toFormat("HH:mm"),
          bookingEndTime: allDay ? "23:59" : end.toFormat("HH:mm"),
          durationMinutes: Math.max(1, Math.round(end.diff(start, "minutes").minutes)),
          status: "Confirmed",
          mode: "calendar-block",
          source: "google-calendar",
          sourceCalendarId: calendarId,
          sourceCalendarEventId: event.id,
          calendarEventId: event.id,
          calendarId,
          calendarSyncStatus: "imported",
          notes: text(event.description || "", 1500),
          address: text(event.location || "", 220),
          googleHtmlLink: text(event.htmlLink || "", 500),
          updatedAt: FieldValue.serverTimestamp(),
          ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() })
        };
        await reference.set(payload, { merge: true });
        if (existing.exists) updated += 1;
        else imported += 1;
      }
      pageToken = response.data.nextPageToken;
    } while (pageToken);
  }

  return { imported, updated, skipped };
});

export const syncJobToCalendar = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const reference = db.doc(`jobs/${text(request.data?.jobId, 80)}`);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Job not found.");
  const job = { jobId: snapshot.id, ...snapshot.data() };
  if (["Cancelled", "Archived"].includes(job.status)) {
    await deleteCalendarEvent(job.calendarEventId, job.calendarId || job.sourceCalendarId || "");
    await reference.set({ calendarSyncStatus: "cancelled", calendarSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { eventId: "", calendarId: job.calendarId || job.sourceCalendarId || "", cancelled: true };
  }
  try {
    const calendarResult = await createCalendarEvent(job, job.calendarEventId || "", job.calendarId || job.sourceCalendarId || "");
    await reference.set(
      {
        calendarEventId: calendarResult.eventId,
        calendarId: calendarResult.calendarId,
        calendarSyncStatus: "synced",
        calendarSyncedAt: FieldValue.serverTimestamp(),
        calendarSyncError: FieldValue.delete()
      },
      { merge: true }
    );
    return calendarResult;
  } catch (error) {
    await reference.set(
      { calendarSyncStatus: "failed", calendarSyncError: text(error?.message, 500), calendarSyncAttemptedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    throw new HttpsError("internal", `Calendar sync failed: ${text(error?.message, 300)}`);
  }
});
