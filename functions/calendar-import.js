import crypto from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { google } from "googleapis";
import { DateTime } from "luxon";

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "australia-southeast1";
const ZONE = defineString("APEX_TIME_ZONE", { default: "Pacific/Auckland" });
const OWNER_UIDS = defineString("APEX_OWNER_UIDS", { default: "fnc4G85CtmQVy0OooOzfOoSC9u22,FqDrn1aPFHXUB5ogb2rN9D7mRG42,maefd5cQ9qcIKSeU4b3yZKUL8UW2" });
const GOOGLE_CALLBACK_URL = defineString("GOOGLE_CALLBACK_URL", { default: "https://australia-southeast1-apex-detailers.cloudfunctions.net/googleCalendarCallback" });
const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
const TOKEN_KEY = defineSecret("TOKEN_ENCRYPTION_KEY");
const GOOGLE_SECRETS = [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_KEY];

const text = (value, max = 1000) => String(value ?? "").trim().slice(0, max);
const normal = value => text(value).toLowerCase().replace(/\s+/g, " ");
const owners = () => OWNER_UIDS.value().split(",").map(value => value.trim()).filter(Boolean);

function requireOwner(request) {
  if (!request.auth || !owners().includes(request.auth.uid)) throw new HttpsError("permission-denied", "Apex owner access is required.");
}

function decrypt(payload) {
  const key = crypto.createHash("sha256").update(TOKEN_KEY.value()).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload.data, "base64")), decipher.final()]).toString("utf8");
}

async function connection() {
  const snapshot = await db.doc("integrations/google").get();
  if (!snapshot.exists || !snapshot.data().refreshToken) return null;
  const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID.value(), GOOGLE_CLIENT_SECRET.value(), GOOGLE_CALLBACK_URL.value());
  client.setCredentials({ refresh_token: decrypt(snapshot.data().refreshToken) });
  return { client, data: snapshot.data() };
}

function eventIdentity(calendarId, eventId) {
  return `gcal_${crypto.createHash("sha256").update(`${calendarId}:${eventId}`).digest("hex").slice(0, 32)}`;
}

function contact(event) {
  const body = `${event.summary || ""}\n${event.description || ""}\n${event.location || ""}`;
  const attendee = (event.attendees || []).find(row => !row.self && !row.resource);
  const email = normal(attendee?.email || body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "");
  const phone = text(body.match(/(?:\+?64|0)\s?(?:2\d|[3-9])(?:[\s-]?\d){6,9}/)?.[0] || "", 40);
  let name = text(attendee?.displayName || event.summary, 160)
    .replace(/^apex\s*[—–-]\s*/i, "")
    .replace(/\s*[—–-]\s*(full[- ]?day|full|deep|maintenance|tradie|seats out)?\s*(detail|clean|booking|appointment).*$/i, "")
    .trim();
  return { name: name || text(event.summary, 160), email, phone };
}

function localDateTime(value, allDayFallback = "09:00") {
  if (!value) return null;
  const parsed = DateTime.fromISO(value, { zone: ZONE.value() });
  if (!parsed.isValid) return null;
  const local = parsed.setZone(ZONE.value());
  return { date: local.toISODate(), time: value.length === 10 ? allDayFallback : local.toFormat("HH:mm") };
}

export const importGoogleCalendarEvents = onCall({ region: REGION, secrets: GOOGLE_SECRETS, timeoutSeconds: 120 }, async request => {
  requireOwner(request);
  const connected = await connection();
  if (!connected) throw new HttpsError("failed-precondition", "Connect Google Calendar in Settings first.");

  const calendar = google.calendar({ version: "v3", auth: connected.client });
  const list = await calendar.calendarList.list({ maxResults: 250, showHidden: false });
  const available = (list.data.items || []).filter(row => row.id && row.accessRole !== "freeBusyReader");
  const allowed = new Set(available.map(row => row.id));
  const configured = Array.isArray(connected.data.selectedCalendarIds) ? connected.data.selectedCalendarIds : [];
  const calendarIds = (configured.length ? configured : available.filter(row => row.primary).map(row => row.id)).filter(id => allowed.has(id));
  if (!calendarIds.length) throw new HttpsError("failed-precondition", "Select at least one calendar in Apex Settings.");

  const now = DateTime.now().setZone(ZONE.value());
  const daysBack = Math.min(Math.max(Number(request.data?.daysBack || 30), 0), 365);
  const daysForward = Math.min(Math.max(Number(request.data?.daysForward || 180), 7), 730);
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const calendarId of calendarIds) {
    let pageToken;
    do {
      const response = await calendar.events.list({
        calendarId,
        timeMin: now.minus({ days: daysBack }).toUTC().toISO(),
        timeMax: now.plus({ days: daysForward }).toUTC().toISO(),
        singleEvents: true,
        orderBy: "startTime",
        showDeleted: false,
        maxResults: 250,
        pageToken
      });
      for (const event of response.data.items || []) {
        if (!event.id || event.status === "cancelled") { skipped++; continue; }
        if (event.extendedProperties?.private?.apexJobId || event.extendedProperties?.private?.apexRequestId) { skipped++; continue; }
        if (/birthday|holiday|focus time|out of office/i.test(event.eventType || "") || /birthday/i.test(event.summary || "")) { skipped++; continue; }
        const start = localDateTime(event.start?.dateTime || event.start?.date);
        const end = localDateTime(event.end?.dateTime || event.end?.date, "17:00");
        if (!start) { skipped++; continue; }
        const details = contact(event);
        const ref = db.doc(`jobs/${eventIdentity(calendarId, event.id)}`);
        const before = await ref.get();
        const calendarName = available.find(row => row.id === calendarId)?.summaryOverride || available.find(row => row.id === calendarId)?.summary || calendarId;
        await ref.set({
          customerName: details.name,
          email: details.email,
          phone: details.phone,
          address: text(event.location, 300),
          area: "",
          vehicle: "",
          packageName: text(event.summary, 200) || "Google Calendar booking",
          bookingDate: start.date,
          bookingTime: start.time,
          bookingEndTime: end?.time || "",
          status: "Booked",
          mode: "calendar-import",
          source: "google-calendar",
          notes: text(event.description, 2000),
          calendarEventId: event.id,
          sourceCalendarEventId: event.id,
          sourceCalendarId: calendarId,
          sourceCalendarName: calendarName,
          calendarUrl: event.htmlLink || "",
          calendarImported: true,
          calendarSyncedAt: FieldValue.serverTimestamp(),
          ownerUid: request.auth.uid,
          updatedAt: FieldValue.serverTimestamp(),
          ...(before.exists ? {} : { createdAt: FieldValue.serverTimestamp() })
        }, { merge: true });
        if (before.exists) updated++; else imported++;
      }
      pageToken = response.data.nextPageToken;
    } while (pageToken);
  }

  await db.doc("integrations/google").set({ lastImportAt: FieldValue.serverTimestamp(), lastImportCount: imported + updated }, { merge: true });
  return { imported, updated, skipped, calendars: calendarIds.length };
});
