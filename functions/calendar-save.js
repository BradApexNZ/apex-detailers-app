import crypto from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { google } from "googleapis";

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "australia-southeast1";
const OWNER_UIDS = defineString("APEX_OWNER_UIDS", {
  default: "fnc4G85CtmQVy0OooOzfOoSC9u22,FqDrn1aPFHXUB5ogb2rN9D7mRG42,maefd5cQ9qcIKSeU4b3yZKUL8UW2"
});
const GOOGLE_CALLBACK_URL = defineString("GOOGLE_CALLBACK_URL", {
  default: "https://australia-southeast1-apex-detailers.cloudfunctions.net/googleCalendarCallback"
});
const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
const TOKEN_KEY = defineSecret("TOKEN_ENCRYPTION_KEY");
const SECRETS = [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_KEY];
const owners = () =>
  OWNER_UIDS.value()
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);
const clean = value =>
  String(value || "")
    .trim()
    .slice(0, 300);

function requireOwner(request) {
  if (!request.auth || !owners().includes(request.auth.uid)) throw new HttpsError("permission-denied", "Apex owner access is required.");
}
function decrypt(payload) {
  const key = crypto.createHash("sha256").update(TOKEN_KEY.value()).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload.data, "base64")), decipher.final()]).toString("utf8");
}

export const saveGoogleCalendarSelection = onCall({ region: REGION, secrets: SECRETS }, async request => {
  requireOwner(request);
  const integration = await db.doc("integrations/google").get();
  if (!integration.exists || !integration.data().refreshToken)
    throw new HttpsError("failed-precondition", "Reconnect Google Calendar first.");
  const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID.value(), GOOGLE_CLIENT_SECRET.value(), GOOGLE_CALLBACK_URL.value());
  client.setCredentials({ refresh_token: decrypt(integration.data().refreshToken) });
  const api = google.calendar({ version: "v3", auth: client });
  const rows = [];
  let pageToken;
  do {
    const response = await api.calendarList.list({ pageToken, maxResults: 250, showHidden: false });
    rows.push(...(response.data.items || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  const allowed = new Set(rows.filter(r => r.id).map(r => r.id));
  const writable = new Set(rows.filter(r => r.id && ["owner", "writer"].includes(r.accessRole)).map(r => r.id));
  const requested = Array.isArray(request.data?.selectedCalendarIds)
    ? request.data.selectedCalendarIds.map(clean).filter(id => allowed.has(id))
    : [];
  let selectedCalendarIds = [...new Set(requested)];
  let primaryCalendarId = clean(request.data?.primaryCalendarId);
  if (!writable.has(primaryCalendarId)) primaryCalendarId = "";
  if (!primaryCalendarId)
    primaryCalendarId =
      selectedCalendarIds.find(id => writable.has(id)) || rows.find(r => r.primary && writable.has(r.id))?.id || [...writable][0] || "";
  if (!primaryCalendarId) throw new HttpsError("failed-precondition", "Google did not expose a writable calendar for this account.");
  if (!selectedCalendarIds.includes(primaryCalendarId)) selectedCalendarIds.unshift(primaryCalendarId);
  await db
    .doc("settings/googleCalendar")
    .set({ selectedCalendarIds, primaryCalendarId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { selectedCalendarIds, primaryCalendarId };
});
