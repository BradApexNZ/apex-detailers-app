import crypto from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { google } from "googleapis";

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "australia-southeast1";
const OWNER_UIDS = defineString("APEX_OWNER_UIDS", { default: "fnc4G85CtmQVy0OooOzfOoSC9u22,FqDrn1aPFHXUB5ogb2rN9D7mRG42,maefd5cQ9qcIKSeU4b3yZKUL8UW2" });
const GOOGLE_CALLBACK_URL = defineString("GOOGLE_CALLBACK_URL", { default: "https://australia-southeast1-apex-detailers.cloudfunctions.net/googleCalendarCallback" });
const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
const TOKEN_KEY = defineSecret("TOKEN_ENCRYPTION_KEY");
const GOOGLE_SECRETS = [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_KEY];

const text = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const owners = () => OWNER_UIDS.value().split(",").map(value => value.trim()).filter(Boolean);

function requireOwner(request) {
  if (!request.auth || !owners().includes(request.auth.uid)) {
    throw new HttpsError("permission-denied", "Apex owner access is required.");
  }
}

function decrypt(payload) {
  const key = crypto.createHash("sha256").update(TOKEN_KEY.value()).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final()
  ]).toString("utf8");
}

async function connection() {
  const snapshot = await db.doc("integrations/google").get();
  if (!snapshot.exists || !snapshot.data().refreshToken) return null;
  const client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID.value(),
    GOOGLE_CLIENT_SECRET.value(),
    GOOGLE_CALLBACK_URL.value()
  );
  client.setCredentials({ refresh_token: decrypt(snapshot.data().refreshToken) });
  return client;
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

  return rows
    .filter(row => row.id && row.accessRole !== "freeBusyReader")
    .map(row => ({
      id: row.id,
      name: row.summaryOverride || row.summary || row.id,
      primary: Boolean(row.primary),
      accessRole: row.accessRole || "reader",
      writable: ["owner", "writer"].includes(row.accessRole)
    }));
}

export const saveGoogleCalendarSelectionV6 = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);

  const client = await connection();
  if (!client) throw new HttpsError("failed-precondition", "Connect Google Calendar first.");

  const rows = await calendars(client);
  const allowed = new Set(rows.map(row => row.id));
  const writable = new Set(rows.filter(row => row.writable).map(row => row.id));
  const requested = Array.isArray(request.data?.selectedCalendarIds)
    ? request.data.selectedCalendarIds.map(value => text(value, 300))
    : [];

  let selectedCalendarIds = [...new Set(requested.filter(id => allowed.has(id)))];
  if (!selectedCalendarIds.length) {
    throw new HttpsError("invalid-argument", "Select at least one Google Calendar.");
  }

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

  if (!primaryCalendarId) {
    throw new HttpsError("failed-precondition", "No writable Google Calendar is available for Apex.");
  }

  const payload = { selectedCalendarIds, primaryCalendarId, updatedAt: FieldValue.serverTimestamp() };
  const batch = db.batch();
  batch.set(db.doc("integrations/google"), payload, { merge: true });
  batch.set(db.doc("settings/googleCalendar"), payload, { merge: true });
  await batch.commit();

  return { selectedCalendarIds, primaryCalendarId, healthy: true };
});
