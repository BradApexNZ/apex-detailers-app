import crypto from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { google } from "googleapis";

// See functions/index.js for why this matters - an unbounded Google API call can
// hang a request forever with no error.
google.options({ timeout: 10000 });

if (!getApps().length) initializeApp();

const db = getFirestore();
const REGION = "australia-southeast1";
const OWNER_UIDS = defineString("APEX_OWNER_UIDS", {
  default: "fnc4G85CtmQVy0OooOzfOoSC9u22,FqDrn1aPFHXUB5ogb2rN9D7mRG42,maefd5cQ9qcIKSeU4b3yZKUL8UW2"
});
const TOKEN_KEY = defineSecret("TOKEN_ENCRYPTION_KEY");

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

export const disconnectGoogleCalendar = onCall({ region: REGION, secrets: [TOKEN_KEY] }, async request => {
  requireOwner(request);

  const integrationRef = db.doc("integrations/google");
  const selectionRef = db.doc("settings/googleCalendar");
  const snapshot = await integrationRef.get();

  if (snapshot.exists && snapshot.data()?.refreshToken) {
    try {
      const refreshToken = decrypt(snapshot.data().refreshToken);
      const client = new google.auth.OAuth2();
      await client.revokeToken(refreshToken);
    } catch (error) {
      // Revocation is best-effort. Apex should still forget a stale or already
      // revoked token locally so the owner can connect the correct account.
      console.warn("Google token revocation was not completed", error?.message || error);
    }
  }

  const batch = db.batch();
  batch.delete(integrationRef);
  batch.delete(selectionRef);
  await batch.commit();

  return { disconnected: true };
});
