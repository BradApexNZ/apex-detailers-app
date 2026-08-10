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
const text = (value, max = 500) => String(value ?? "").trim().slice(0, max);
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

async function calendars(client) {
  const api = google.calendar({ version: "v3", auth: client });
  const rows = [];
  let pageToken;
  do {
    const response = await api.calendarList.list({ pageToken, maxResults: 250, showHidden: false });
    rows.push(...(response.data.items || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  return rows.filter(row => row.id && row.accessRole !== "freeBusyReader").map(row => ({
    id: row.id,
    name: row.summaryOverride || row.summary || row.id,
    primary: Boolean(row.primary),
    accessRole: row.accessRole || "reader",
    writable: ["owner", "writer"].includes(row.accessRole)
  }));
}

async function selectionPreferences(connectionData = {}) {
  const snapshot = await db.doc("settings/googleCalendar").get();
  return { ...connectionData, ...(snapshot.exists ? snapshot.data() : {}) };
}

function resolvedSelection(rows, data = {}) {
  const allowed = new Set(rows.map(row => row.id));
  const writableRows = rows.filter(row => row.writable);
  const writableIds = new Set(writableRows.map(row => row.id));
  const configured = Array.isArray(data.selectedCalendarIds)
    ? [...new Set(data.selectedCalendarIds.map(value => text(value, 300)).filter(id => allowed.has(id)))]
    : [];

  let selectedCalendarIds = configured.length ? configured : rows.filter(row => row.primary).map(row => row.id);
  const requestedPrimary = text(data.primaryCalendarId, 300);
  let primaryCalendarId = selectedCalendarIds.includes(requestedPrimary) && writableIds.has(requestedPrimary)
    ? requestedPrimary
    : selectedCalendarIds.find(id => writableIds.has(id)) || "";

  // Account switches can leave a shared/read-only calendar selected. Always make
  // the current Google account's writable primary calendar part of Apex setup.
  if (!primaryCalendarId) {
    const preferredWritable = writableRows.find(row => row.primary) || writableRows[0];
    if (preferredWritable) {
      primaryCalendarId = preferredWritable.id;
      if (!selectedCalendarIds.includes(primaryCalendarId)) selectedCalendarIds = [primaryCalendarId, ...selectedCalendarIds];
    }
  }

  return { selectedCalendarIds, primaryCalendarId };
}

function sameIds(a = [], b = []) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function persistResolvedSelection(selection, preferences) {
  if (!selection.primaryCalendarId) return;
  const existingIds = Array.isArray(preferences.selectedCalendarIds) ? preferences.selectedCalendarIds : [];
  if (sameIds(existingIds, selection.selectedCalendarIds) && text(preferences.primaryCalendarId, 300) === selection.primaryCalendarId) return;
  const payload = { ...selection, updatedAt: FieldValue.serverTimestamp() };
  const batch = db.batch();
  batch.set(db.doc("integrations/google"), payload, { merge: true });
  batch.set(db.doc("settings/googleCalendar"), payload, { merge: true });
  await batch.commit();
}

function parseRange(data = {}) {
  const now = DateTime.now().setZone(ZONE.value());
  const rawStart = text(data.startDate, 10);
  const rawEnd = text(data.endDate, 10);
  const parsedStart = rawStart ? DateTime.fromISO(rawStart, { zone: ZONE.value() }) : null;
  const parsedEnd = rawEnd ? DateTime.fromISO(rawEnd, { zone: ZONE.value() }) : null;
  const start = parsedStart?.isValid ? parsedStart.startOf("day") : now.startOf("month");
  let end = parsedEnd?.isValid ? parsedEnd.endOf("day") : start.plus({ months: 1 }).endOf("month");
  if (end < start) end = start.endOf("day");
  if (end.diff(start, "days").days > 400) end = start.plus({ days: 400 }).endOf("day");
  return { start, end };
}

function localDateTime(value, allDayFallback = "00:00") {
  if (!value) return null;
  const parsed = DateTime.fromISO(value, { zone: ZONE.value() });
  if (!parsed.isValid) return null;
  const local = parsed.setZone(ZONE.value());
  return { date: local.toISODate(), time: value.length === 10 ? allDayFallback : local.toFormat("HH:mm") };
}

function isApexOwnedEvent(event) {
  const privateData = event.extendedProperties?.private || {};
  return privateData.apexLaunch === "true" || Boolean(privateData.apexJobId) || Boolean(privateData.apexRequestId);
}

async function readLiveEvents(client, rows, selection, data = {}) {
  const { start, end } = parseRange(data);
  const api = google.calendar({ version: "v3", auth: client });
  const events = [];
  let skipped = 0;

  for (const calendarId of selection.selectedCalendarIds) {
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
        if (!event.id || event.status === "cancelled") { skipped += 1; continue; }
        // Apex-created Google events are already represented by the Firestore job.
        // Excluding them prevents a confirmed Apex booking appearing twice in HQ.
        if (isApexOwnedEvent(event)) { skipped += 1; continue; }
        const startPart = localDateTime(event.start?.dateTime || event.start?.date, "00:00");
        const endPart = localDateTime(event.end?.dateTime || event.end?.date, "23:59");
        if (!startPart) { skipped += 1; continue; }
        const calendarName = rows.find(row => row.id === calendarId)?.name || "Google Calendar";
        events.push({
          id: `${calendarId}:${event.id}`,
          source: "google-calendar-live",
          bookingDate: startPart.date,
          bookingTime: startPart.time,
          bookingEndTime: endPart?.time || "",
          title: text(event.summary || "Google Calendar event", 200),
          customerName: text(event.summary || "Google Calendar event", 200),
          packageName: calendarName,
          calendarName,
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
  return { events, skipped, calendars: selection.selectedCalendarIds.length, startDate: start.toISODate(), endDate: end.toISODate() };
}

async function cacheGoogleEvents(request, client, rows, selection) {
  const now = DateTime.now().setZone(ZONE.value());
  const daysBack = Math.min(Math.max(Number(request.data?.daysBack || 30), 0), 365);
  const daysForward = Math.min(Math.max(Number(request.data?.daysForward || 365), 7), 730);
  const result = await readLiveEvents(client, rows, selection, {
    startDate: now.minus({ days: daysBack }).toISODate(),
    endDate: now.plus({ days: daysForward }).toISODate()
  });
  let imported = 0;
  let updated = 0;

  for (const event of result.events) {
    const identity = crypto.createHash("sha256").update(`${event.calendarId}:${event.calendarEventId}`).digest("hex").slice(0, 40);
    const reference = db.doc(`googleCalendarBlocks/${identity}`);
    const before = await reference.get();
    await reference.set({
      ...event,
      source: "google-calendar-cache",
      ownerUid: request.auth.uid,
      updatedAt: FieldValue.serverTimestamp(),
      ...(before.exists ? {} : { createdAt: FieldValue.serverTimestamp() })
    }, { merge: true });
    if (before.exists) updated += 1; else imported += 1;
  }

  await db.doc("integrations/google").set({ lastImportAt: FieldValue.serverTimestamp(), lastImportCount: imported + updated }, { merge: true });
  return { imported, updated, skipped: result.skipped, calendars: result.calendars };
}

export const listGoogleCalendarsV6 = onCall({ region: REGION, secrets: GOOGLE_SECRETS, timeoutSeconds: 120 }, async request => {
  requireOwner(request);
  const connected = await connection();
  if (!connected) {
    if (request.data?.action === "events" || request.data?.action === "sync") throw new HttpsError("failed-precondition", "Reconnect Google Calendar first.");
    return { connected: false, calendars: [], selectedCalendarIds: [], primaryCalendarId: "", healthy: false };
  }

  const rows = await calendars(connected.client);
  const preferences = await selectionPreferences(connected.data);
  const selection = resolvedSelection(rows, preferences);
  await persistResolvedSelection(selection, preferences);
  if (!selection.selectedCalendarIds.length) throw new HttpsError("failed-precondition", "Select at least one Google Calendar first.");

  const action = text(request.data?.action, 20).toLowerCase();
  if (action === "events") return readLiveEvents(connected.client, rows, selection, request.data || {});
  if (action === "sync") return cacheGoogleEvents(request, connected.client, rows, selection);

  return {
    connected: true,
    healthy: Boolean(selection.selectedCalendarIds.length && selection.primaryCalendarId),
    email: connected.data.email || "",
    calendars: rows,
    ...selection
  };
});

export const saveGoogleCalendarSelectionV6 = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const connected = await connection();
  if (!connected) throw new HttpsError("failed-precondition", "Connect Google Calendar first.");
  const rows = await calendars(connected.client);
  const allowed = new Set(rows.map(row => row.id));
  const writable = new Set(rows.filter(row => row.writable).map(row => row.id));
  const requested = Array.isArray(request.data?.selectedCalendarIds) ? request.data.selectedCalendarIds.map(value => text(value, 300)) : [];
  let selectedCalendarIds = [...new Set(requested.filter(id => allowed.has(id)))];
  if (!selectedCalendarIds.length) throw new HttpsError("invalid-argument", "Select at least one Google Calendar.");
  const requestedPrimary = text(request.data?.primaryCalendarId, 300);
  let primaryCalendarId = selectedCalendarIds.includes(requestedPrimary) && writable.has(requestedPrimary)
    ? requestedPrimary
    : selectedCalendarIds.find(id => writable.has(id)) || "";
  if (!primaryCalendarId) {
    const fallback = rows.find(row => row.primary && row.writable) || rows.find(row => row.writable);
    if (fallback) {
      primaryCalendarId = fallback.id;
      if (!selectedCalendarIds.includes(primaryCalendarId)) selectedCalendarIds = [primaryCalendarId, ...selectedCalendarIds];
    }
  }
  if (!primaryCalendarId) throw new HttpsError("failed-precondition", "No writable Google Calendar is available for Apex.");

  const payload = { selectedCalendarIds, primaryCalendarId, updatedAt: FieldValue.serverTimestamp() };
  const batch = db.batch();
  batch.set(db.doc("integrations/google"), payload, { merge: true });
  batch.set(db.doc("settings/googleCalendar"), payload, { merge: true });
  await batch.commit();
  return { selectedCalendarIds, primaryCalendarId, healthy: true };
});
