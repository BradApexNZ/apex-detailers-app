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
const OWNER_UIDS = defineString("APEX_OWNER_UIDS", {
  default: "fnc4G85CtmQVy0OooOzfOoSC9u22,FqDrn1aPFHXUB5ogb2rN9D7mRG42,maefd5cQ9qcIKSeU4b3yZKUL8UW2"
});
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

function decrypt(payload) {
  const key = crypto.createHash("sha256").update(TOKEN_KEY.value()).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload.data, "base64")), decipher.final()]).toString("utf8");
}

function readableError(error) {
  const apiMessage = error?.response?.data?.error?.message || error?.response?.data?.error_description;
  const code = error?.response?.status || error?.code;
  const message = text(apiMessage || error?.message || "Google Calendar request failed.", 350);
  return code ? `${message} (${code})` : message;
}

async function connection() {
  const snapshot = await db.doc("integrations/google").get();
  if (!snapshot.exists || !snapshot.data().refreshToken) return null;
  const data = snapshot.data();
  const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID.value(), GOOGLE_CLIENT_SECRET.value(), GOOGLE_CALLBACK_URL.value());
  client.setCredentials({ refresh_token: decrypt(data.refreshToken) });
  return { client, data };
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
    .filter(row => row.id && ["owner", "writer", "reader"].includes(row.accessRole))
    .map(row => ({
      id: row.id,
      name: row.summaryOverride || row.summary || row.id,
      primary: Boolean(row.primary),
      accessRole: row.accessRole || "reader",
      writable: ["owner", "writer"].includes(row.accessRole)
    }));
}

async function selection(rows, connectionData = {}) {
  const snapshot = await db.doc("settings/googleCalendar").get();
  const prefs = snapshot.exists ? snapshot.data() : {};
  const data = { ...connectionData, ...prefs };
  const allowed = new Set(rows.map(row => row.id));
  const writable = new Set(rows.filter(row => row.writable).map(row => row.id));
  const configured = Array.isArray(data.selectedCalendarIds)
    ? [...new Set(data.selectedCalendarIds.map(value => text(value, 300)).filter(id => allowed.has(id)))]
    : [];
  let selectedCalendarIds = configured.length ? configured : rows.filter(row => row.primary).map(row => row.id);
  let primaryCalendarId = text(data.primaryCalendarId, 300);
  if (!selectedCalendarIds.includes(primaryCalendarId) || !writable.has(primaryCalendarId)) {
    primaryCalendarId = selectedCalendarIds.find(id => writable.has(id)) || "";
  }
  if (!primaryCalendarId) {
    const fallback = rows.find(row => row.primary && row.writable) || rows.find(row => row.writable);
    if (fallback) {
      primaryCalendarId = fallback.id;
      if (!selectedCalendarIds.includes(fallback.id)) selectedCalendarIds = [fallback.id, ...selectedCalendarIds];
    }
  }
  return { selectedCalendarIds, primaryCalendarId };
}

function range(data = {}) {
  const now = DateTime.now().setZone(ZONE.value());
  const startRaw = text(data.startDate, 10);
  const endRaw = text(data.endDate, 10);
  let start = startRaw ? DateTime.fromISO(startRaw, { zone: ZONE.value() }) : now.startOf("month");
  let end = endRaw ? DateTime.fromISO(endRaw, { zone: ZONE.value() }) : start.plus({ months: 1 }).minus({ days: 1 });
  if (!start.isValid) start = now.startOf("month");
  if (!end.isValid || end < start) end = start.endOf("day");
  start = start.startOf("day");
  end = end.endOf("day");
  if (end.diff(start, "days").days > 400) end = start.plus({ days: 400 }).endOf("day");
  return { start, end };
}

function eventLocal(raw, allDay = false) {
  if (!raw) return null;
  if (allDay || raw.length === 10) {
    const value = DateTime.fromISO(raw, { zone: ZONE.value() });
    return value.isValid ? value.startOf("day") : null;
  }
  const value = DateTime.fromISO(raw, { setZone: true });
  return value.isValid ? value.setZone(ZONE.value()) : null;
}

function isApexOwned(event) {
  const value = event.extendedProperties?.private || {};
  return value.apexLaunch === "true" || Boolean(value.apexJobId) || Boolean(value.apexRequestId);
}

function detailedRow(event, calendarId, calendarName) {
  const allDay = Boolean(event.start?.date && !event.start?.dateTime);
  const start = eventLocal(event.start?.dateTime || event.start?.date, allDay);
  if (!start) return null;
  const end = eventLocal(event.end?.dateTime || event.end?.date, allDay);
  return {
    id: `${calendarId}:${event.id}`,
    source: "google-calendar-live",
    bookingDate: start.toISODate(),
    bookingTime: allDay ? "" : start.toFormat("HH:mm"),
    bookingEndTime: !allDay && end ? end.toFormat("HH:mm") : "",
    title: text(event.summary || "Google Calendar event", 200),
    customerName: text(event.summary || "Google Calendar event", 200),
    packageName: calendarName,
    calendarName,
    address: text(event.location || "", 300),
    notes: text(event.description || "", 1200),
    allDay,
    calendarId,
    calendarEventId: event.id,
    calendarUrl: text(event.htmlLink || "", 500),
    status: "Confirmed"
  };
}

async function detailedEvents(api, rows, selectedCalendarIds, start, end) {
  const events = [];
  for (const calendarId of selectedCalendarIds) {
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
      const calendarName = rows.find(row => row.id === calendarId)?.name || "Google Calendar";
      for (const event of response.data.items || []) {
        if (!event.id || event.status === "cancelled" || isApexOwned(event)) continue;
        const row = detailedRow(event, calendarId, calendarName);
        if (row) events.push(row);
      }
      pageToken = response.data.nextPageToken;
    } while (pageToken);
  }
  return events;
}

async function busyFallback(api, rows, selectedCalendarIds, start, end) {
  const response = await api.freebusy.query({
    requestBody: {
      timeMin: start.toUTC().toISO(),
      timeMax: end.toUTC().toISO(),
      timeZone: ZONE.value(),
      items: selectedCalendarIds.map(id => ({ id }))
    }
  });
  const events = [];
  for (const calendarId of selectedCalendarIds) {
    const calendarName = rows.find(row => row.id === calendarId)?.name || "Google Calendar";
    for (const block of response.data.calendars?.[calendarId]?.busy || []) {
      const startAt = DateTime.fromISO(block.start, { setZone: true }).setZone(ZONE.value());
      const endAt = DateTime.fromISO(block.end, { setZone: true }).setZone(ZONE.value());
      if (!startAt.isValid || !endAt.isValid) continue;
      const hours = endAt.diff(startAt, "hours").hours;
      const allDay = startAt.hour === 0 && startAt.minute === 0 && hours >= 23.5;
      const identity = crypto.createHash("sha1").update(`${calendarId}:${block.start}:${block.end}`).digest("hex").slice(0, 24);
      events.push({
        id: `${calendarId}:busy:${identity}`,
        source: "google-calendar-live-busy",
        bookingDate: startAt.toISODate(),
        bookingTime: allDay ? "" : startAt.toFormat("HH:mm"),
        bookingEndTime: allDay ? "" : endAt.toFormat("HH:mm"),
        title: "Google Calendar block",
        customerName: "Google Calendar block",
        packageName: calendarName,
        calendarName,
        address: "",
        notes: "Busy time from Google Calendar. Reconnect Google Calendar to restore event titles if this fallback remains active.",
        allDay,
        calendarId,
        calendarEventId: identity,
        calendarUrl: "",
        status: "Confirmed"
      });
    }
  }
  return events;
}

async function liveEvents(client, rows, selectedCalendarIds, data, scopes = "") {
  const { start, end } = range(data);
  const api = google.calendar({ version: "v3", auth: client });
  try {
    const events = await detailedEvents(api, rows, selectedCalendarIds, start, end);
    events.sort((a, b) => `${a.bookingDate} ${a.bookingTime}`.localeCompare(`${b.bookingDate} ${b.bookingTime}`));
    return {
      events,
      degraded: false,
      scopeNeedsReconnect: false,
      calendars: selectedCalendarIds.length,
      startDate: start.toISODate(),
      endDate: end.toISODate()
    };
  } catch (error) {
    const detail = readableError(error);
    console.error("Apex detailed Calendar read failed; falling back to freebusy", detail);
    try {
      const events = await busyFallback(api, rows, selectedCalendarIds, start, end);
      events.sort((a, b) => `${a.bookingDate} ${a.bookingTime}`.localeCompare(`${b.bookingDate} ${b.bookingTime}`));
      const scopeText = String(scopes || "");
      const hasEventScope =
        scopeText.includes("https://www.googleapis.com/auth/calendar") ||
        scopeText.includes("https://www.googleapis.com/auth/calendar.readonly") ||
        scopeText.includes("https://www.googleapis.com/auth/calendar.events");
      return {
        events,
        degraded: true,
        scopeNeedsReconnect: !hasEventScope,
        warning: `Google event details could not be read: ${detail}. Busy times are still loaded safely.`,
        calendars: selectedCalendarIds.length,
        startDate: start.toISODate(),
        endDate: end.toISODate()
      };
    } catch (fallbackError) {
      throw new HttpsError("unavailable", `Google Calendar could not be loaded: ${readableError(fallbackError)}`);
    }
  }
}

export const listGoogleCalendarsV6 = onCall({ region: REGION, secrets: GOOGLE_SECRETS, timeoutSeconds: 120 }, async request => {
  requireOwner(request);
  const connected = await connection();
  const action = text(request.data?.action, 20).toLowerCase();
  if (!connected) {
    if (action === "events" || action === "sync") throw new HttpsError("failed-precondition", "Reconnect Google Calendar first.");
    return { connected: false, healthy: false, calendars: [], selectedCalendarIds: [], primaryCalendarId: "" };
  }

  let rows;
  try {
    rows = await calendarRows(connected.client);
  } catch (error) {
    throw new HttpsError("unavailable", `Google Calendar account check failed: ${readableError(error)}`);
  }
  const resolved = await selection(rows, connected.data);
  if (!resolved.selectedCalendarIds.length) throw new HttpsError("failed-precondition", "Select at least one Google Calendar first.");

  if (action === "events") {
    return liveEvents(connected.client, rows, resolved.selectedCalendarIds, request.data || {}, connected.data.scopes || "");
  }
  if (action === "sync") {
    const result = await liveEvents(connected.client, rows, resolved.selectedCalendarIds, request.data || {}, connected.data.scopes || "");
    return {
      imported: 0,
      updated: 0,
      skipped: 0,
      calendars: result.calendars,
      liveOnly: true,
      degraded: result.degraded,
      warning: result.warning || "Apex HQ now reads Google Calendar live; no manual import is required."
    };
  }

  const scopeText = String(connected.data.scopes || "");
  const hasEventScope =
    scopeText.includes("https://www.googleapis.com/auth/calendar") ||
    scopeText.includes("https://www.googleapis.com/auth/calendar.readonly") ||
    scopeText.includes("https://www.googleapis.com/auth/calendar.events");
  return {
    connected: true,
    healthy: Boolean(resolved.selectedCalendarIds.length && resolved.primaryCalendarId),
    email: connected.data.email || "",
    calendars: rows,
    ...resolved,
    eventReadPermissionRecorded: hasEventScope
  };
});
