import crypto from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { google } from "googleapis";
import { DateTime } from "luxon";

// See functions/index.js for why this matters - an unbounded Google API call can
// hang a request forever with no error.
google.options({ timeout: 10000 });

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "australia-southeast1";
const ZONE = defineString("APEX_TIME_ZONE", { default: "Pacific/Auckland" });
const OWNER_UIDS = defineString("APEX_OWNER_UIDS", { default: "fnc4G85CtmQVy0OooOzfOoSC9u22,FqDrn1aPFHXUB5ogb2rN9D7mRG42" });
const GOOGLE_CALLBACK_URL = defineString("GOOGLE_CALLBACK_URL", {
  default: "https://australia-southeast1-apex-detailers.cloudfunctions.net/googleCalendarCallback"
});
const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
const TOKEN_KEY = defineSecret("TOKEN_ENCRYPTION_KEY");
const GOOGLE_SECRETS = [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_KEY];

const text = (value, max = 500) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const normal = value => text(value).toLowerCase().replace(/\s+/g, " ");
const digits = value => text(value).replace(/\D/g, "");

// A stable identity for "this person", not "this one calendar entry". A
// repeat customer gets a brand-new event.id every time they book again, so
// keying dismissal off event.id meant declining someone once only hid that
// single booking - the next one from the same person came back as a fresh
// suggestion. No date component here on purpose: unlike the within-scan
// seen-dedup below (which needs the date to avoid conflating two unrelated
// same-named people on the same day), a dismissal is meant to survive across
// however many future bookings this exact person makes.
const personKey = (emails, phones, name) => emails[0] || digits(phones[0] || "") || normal(name);
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

function keyMaterial() {
  return crypto.createHash("sha256").update(TOKEN_KEY.value()).digest();
}

function decrypt(payload) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload.data, "base64")), decipher.final()]).toString("utf8");
}

async function connectedGoogle() {
  const snapshot = await db.doc("integrations/google").get();
  if (!snapshot.exists || !snapshot.data().refreshToken) return null;
  const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID.value(), GOOGLE_CLIENT_SECRET.value(), GOOGLE_CALLBACK_URL.value());
  client.setCredentials({ refresh_token: decrypt(snapshot.data().refreshToken) });
  return { client, data: snapshot.data() };
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
  return rows
    .filter(row => row.id && row.accessRole !== "freeBusyReader")
    .map(row => ({
      id: row.id,
      name: row.summaryOverride || row.summary || row.id,
      primary: Boolean(row.primary),
      selected: Boolean(row.selected),
      accessRole: row.accessRole || "reader",
      backgroundColor: row.backgroundColor || ""
    }));
}

function emailsFromEvent(event) {
  const values = new Set();
  for (const attendee of event.attendees || []) {
    if (attendee.email && !attendee.self && !attendee.resource) values.add(normal(attendee.email));
  }
  const body = `${event.summary || ""}\n${event.description || ""}`;
  for (const match of body.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) values.add(normal(match[0]));
  return [...values];
}

function phonesFromEvent(event) {
  const body = `${event.summary || ""}\n${event.description || ""}\n${event.location || ""}`;
  const values = new Set();
  for (const match of body.matchAll(/(?:\+?64|0)\s?2\d(?:[\s-]?\d){6,8}/g)) values.add(text(match[0], 40));
  return [...values];
}

// NZ plates: 2-3 letters + 2-4 digits (ABC123, AB1234) or the reverse digit-first
// legacy format. Deliberately loose - a false positive just means the rego field
// shows something odd, a false negative just falls back to the keyword check below.
const REGO_PATTERN = /\b[A-Z]{2,3}[\s-]?\d{2,4}\b|\b\d{2,4}[\s-]?[A-Z]{2,3}\b/;
const VEHICLE_KEYWORDS =
  /\b(car|vehicle|ute|van|truck|suv|wagon|hatch|sedan|4wd|rego|registration|detail|detailing|wash|wax|ceramic|interior|exterior|valet|clean|tradie|maintenance|ford|toyota|holden|mazda|nissan|honda|hyundai|kia|mitsubishi|subaru|volkswagen|\bvw\b|bmw|mercedes|audi|jeep|isuzu|range\s*rover)\b/i;

function regoFromEvent(event) {
  const body = `${event.summary || ""}\n${event.description || ""}\n${event.location || ""}`;
  const match = body.match(REGO_PATTERN);
  return match ? text(match[0].toUpperCase().replace(/[\s-]/g, ""), 12) : "";
}

function looksLikeVehicleBooking(event, rego) {
  if (rego) return true;
  const body = `${event.summary || ""}\n${event.description || ""}`;
  return VEHICLE_KEYWORDS.test(body);
}

function likelyName(event) {
  const attendee = (event.attendees || []).find(row => !row.self && !row.resource && row.displayName);
  if (attendee?.displayName) return text(attendee.displayName, 120);
  let summary = text(event.summary, 160)
    .replace(/^apex\s*[—–-]\s*/i, "")
    .replace(/\b(detail|detailing|clean|booking|appointment|vehicle|car|interior|exterior|full|deep|maintenance|tradie|reset)\b/gi, " ")
    .replace(/[—–|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return summary || text(event.summary, 120);
}

function eventDate(event) {
  const value = event.start?.dateTime || event.start?.date || "";
  const parsed = DateTime.fromISO(value, { zone: ZONE.value() });
  return parsed.isValid ? parsed.toISO() : value;
}

export const scanGoogleCalendarProspects = onCall({ region: REGION, secrets: GOOGLE_SECRETS, timeoutSeconds: 60 }, async request => {
  requireOwner(request);
  const connected = await connectedGoogle();
  if (!connected) throw new HttpsError("failed-precondition", "Connect Google Calendar first.");
  const calendars = await calendarRows(connected.client);
  const availableIds = new Set(calendars.map(row => row.id));
  const configured = Array.isArray(connected.data.selectedCalendarIds) ? connected.data.selectedCalendarIds : [];
  const calendarIds = (configured.length ? configured : calendars.filter(row => row.primary).map(row => row.id)).filter(id =>
    availableIds.has(id)
  );
  const api = google.calendar({ version: "v3", auth: connected.client });
  const now = DateTime.now().setZone(ZONE.value());
  const days = Math.min(Math.max(Number(request.data?.days || 120), 7), 365);
  const [customerSnapshot, ignoredSnapshot] = await Promise.all([
    db.collection("customers").get(),
    db.collection("calendarProspectDismissals").get()
  ]);
  const customers = customerSnapshot.docs.map(document => ({ id: document.id, ...document.data() }));
  const ignored = new Set(ignoredSnapshot.docs.map(document => document.id));
  const suggestions = [];
  const seen = new Set();

  for (const calendarId of calendarIds) {
    let pageToken;
    do {
      const response = await api.events.list({
        calendarId,
        timeMin: now.minus({ days: 30 }).toUTC().toISO(),
        timeMax: now.plus({ days }).toUTC().toISO(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250,
        pageToken,
        showDeleted: false
      });
      for (const event of response.data.items || []) {
        if (!event.id || event.status === "cancelled") continue;
        if (event.extendedProperties?.private?.apexJobId || event.extendedProperties?.private?.apexRequestId) continue;
        const emails = emailsFromEvent(event);
        const phones = phonesFromEvent(event);
        const name = likelyName(event);
        const rego = regoFromEvent(event);
        if (!name || /holiday|birthday|reminder|focus time|out of office/i.test(event.summary || "")) continue;
        if (!looksLikeVehicleBooking(event, rego)) continue;
        const person = personKey(emails, phones, name);
        if (ignored.has(person)) continue;
        const key = emails[0] || digits(phones[0]) || `${normal(name)}|${eventDate(event).slice(0, 10)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const match = customers.find(customer => {
          const customerName = normal(customer.businessName || `${customer.firstName || ""} ${customer.lastName || ""}`);
          return Boolean(
            (emails[0] && normal(customer.email) === emails[0]) ||
            (phones[0] && digits(customer.phone) && digits(customer.phone) === digits(phones[0])) ||
            (name && customerName && customerName === normal(name))
          );
        });
        suggestions.push({
          eventId: event.id,
          personKey: person,
          calendarId,
          calendarName: calendars.find(row => row.id === calendarId)?.name || calendarId,
          name,
          rego,
          email: emails[0] || "",
          phone: phones[0] || "",
          address: text(event.location, 300),
          notes: text(event.description, 1000),
          eventTitle: text(event.summary, 200),
          eventStart: eventDate(event),
          htmlLink: event.htmlLink || "",
          // A confident match means this isn't a new customer - it's an existing one
          // with a booking that didn't come through the website (in-person, phone,
          // walk-in). The owner can still turn it into a tracked job, just not a
          // second customer record.
          existingCustomerId: match?.id || "",
          existingCustomerName: match ? match.businessName || `${match.firstName || ""} ${match.lastName || ""}`.trim() : "",
          missing: [!emails[0] ? "email" : "", !phones[0] ? "mobile" : ""].filter(Boolean)
        });
      }
      pageToken = response.data.nextPageToken;
    } while (pageToken);
  }
  return { scannedCalendars: calendarIds.length, suggestions: suggestions.slice(0, 100) };
});

export const saveGoogleCalendarProspect = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const data = request.data || {};
  const name = text(data.name, 160);
  const email = normal(data.email);
  const phone = text(data.phone, 40);
  if (!name) throw new HttpsError("invalid-argument", "Add the customer name.");
  if (!email && !phone) throw new HttpsError("invalid-argument", "Add an email address or mobile number.");
  const customerName = normal(name);
  const existingSnapshot = await db.collection("customers").get();
  const duplicate = existingSnapshot.docs.find(document => {
    const customer = document.data();
    const existingName = normal(customer.businessName || `${customer.firstName || ""} ${customer.lastName || ""}`);
    return Boolean(
      (email && normal(customer.email) === email) ||
      (phone && digits(customer.phone) && digits(customer.phone) === digits(phone)) ||
      (customerName && existingName && existingName === customerName)
    );
  });
  if (duplicate) throw new HttpsError("already-exists", "This looks like an existing customer already - check the Customers tab.");
  const parts = name.split(/\s+/).filter(Boolean);
  const reference = db.collection("customers").doc();
  await reference.set({
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
    businessName: text(data.businessName, 160),
    email,
    phone,
    address: text(data.address, 300),
    area: text(data.area, 100) || "Napier",
    preferredContact: email ? "email" : "text",
    customerType: "standard",
    notes: text(data.notes, 1500),
    calendarSource: { eventId: text(data.eventId, 300), calendarId: text(data.calendarId, 300), eventTitle: text(data.eventTitle, 300) },
    ownerUid: request.auth.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  return { customerId: reference.id };
});

export const dismissGoogleCalendarProspect = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  // Prefer the stable person key (survives across however many future
  // bookings this person makes, each with a new calendar event.id). Falls
  // back to eventId only for stray older clients that haven't picked up the
  // personKey field yet - that still dismisses today's suggestion, it just
  // won't stop this same person's *next* booking from resurfacing too.
  const dismissId = text(request.data?.personKey, 300) || text(request.data?.eventId, 300);
  if (!dismissId) throw new HttpsError("invalid-argument", "Calendar event is required.");
  await db.doc(`calendarProspectDismissals/${dismissId}`).set({ dismissedBy: request.auth.uid, dismissedAt: FieldValue.serverTimestamp() });
  return { dismissed: true };
});
