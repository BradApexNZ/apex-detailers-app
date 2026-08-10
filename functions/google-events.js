import crypto from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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

async function connectedClient() {
  const snapshot = await db.doc("integrations/google").get();
  if (!snapshot.exists || !snapshot.data().refreshToken) return null;
  const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID.value(), GOOGLE_CLIENT_SECRET.value(), GOOGLE_CALLBACK_URL.value());
  client.setCredentials({ refresh_token: decrypt(snapshot.data().refreshToken) });
  return client;
}

async function selectedCalendars(client) {
  const api = google.calendar({ version: "v3", auth: client });
  const rows = [];
  let pageToken;
  do {
    const response = await api.calendarList.list({ pageToken, maxResults: 250, showHidden: false });
    rows.push(...(response.data.items || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  const available = rows.filter(row => row.id && ["owner", "writer", "reader"].includes(row.accessRole));
  const allowed = new Set(available.map(row => row.id));
  const preferences = await db.doc("settings/googleCalendar").get();
  const configured = preferences.exists && Array.isArray(preferences.data().selectedCalendarIds)
    ? preferences.data().selectedCalendarIds.filter(id => allowed.has(id))
    : [];
  const fallback = available.filter(row => row.primary).map(row => row.id);
  return { api, rows: available, ids: configured.length ? configured : fallback };
}

function localPart(value, fallbackTime) {
  if (!value) return null;
  const parsed = DateTime.fromISO(value, { zone: ZONE.value() });
  if (!parsed.isValid) return null;
  const local = parsed.setZone(ZONE.value());
  return {
    date: local.toISODate(),
    time: value.length === 10 ? fallbackTime : local.toFormat("HH:mm")
  };
}

export const getGoogleCalendarEvents = onCall({ region: REGION, secrets: GOOGLE_SECRETS, timeoutSeconds: 60 }, async request => {
  requireOwner(request);
  const client = await connectedClient();
  if (!client) throw new HttpsError("failed-precondition", "Reconnect Google Calendar first.");
  const { api, rows, ids } = await selectedCalendars(client);
  if (!ids.length) throw new HttpsError("failed-precondition", "Select at least one Google Calendar first.");

  const requestedStart = text(request.data?.startDate, 10);
  const requestedEnd = text(request.data?.endDate, 10);
  const fallbackStart = DateTime.now().setZone(ZONE.value()).startOf("month");
  const start = DateTime.fromISO(requestedStart, { zone: ZONE.value() }).isValid ? DateTime.fromISO(requestedStart, { zone: ZONE.value() }).startOf("day") : fallbackStart;
  const end = DateTime.fromISO(requestedEnd, { zone: ZONE.value() }).isValid ? DateTime.fromISO(requestedEnd, { zone: ZONE.value() }).endOf("day") : start.plus({ months: 1 }).endOf("month");
  const events = [];

  for (const calendarId of ids) {
    let pageToken;
    do {
      const response = await api.events.list({
        calendarId,
        timeMin: start.toUTC().toISO(),
        timeMax: end.toUTC().toISO(),
        singleEvents: true,
        orderBy: "startTime",
        showDeleted: false,
        maxResults: 2500,
        pageToken
      });
      for (const event of response.data.items || []) {
        if (!event.id || event.status === "cancelled") continue;
        const startPart = localPart(event.start?.dateTime || event.start?.date, "00:00");
        const endPart = localPart(event.end?.dateTime || event.end?.date, "23:59");
        if (!startPart) continue;
        events.push({
          id: `${calendarId}:${event.id}`,
          source: "google-calendar-live",
          bookingDate: startPart.date,
          bookingTime: startPart.time,
          bookingEndTime: endPart?.time || "",
          title: text(event.summary || "Google Calendar event", 200),
          customerName: text(event.summary || "Google Calendar event", 200),
          packageName: text(rows.find(row => row.id === calendarId)?.summaryOverride || rows.find(row => row.id === calendarId)?.summary || "Google Calendar", 120),
          address: text(event.location || "", 300),
          notes: text(event.description || "", 1500),
          allDay: !event.start?.dateTime,
          calendarId,
          calendarEventId: event.id,
          calendarUrl: text(event.htmlLink || "", 500),
          status: "Confirmed"
        });
      }
      pageToken = response.data.nextPageToken;
    } while (pageToken);
  }

  events.sort((a, b) => `${a.bookingDate} ${a.bookingTime}`.localeCompare(`${b.bookingDate} ${b.bookingTime}`));
  return { events, calendars: ids.length, startDate: start.toISODate(), endDate: end.toISODate() };
});
