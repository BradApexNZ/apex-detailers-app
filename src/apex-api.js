import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, authPersistenceReady, db, functions } from "./firebase";
import { fallbackConfig } from "./public-booking-fallback";

const cloudOverride = import.meta.env.VITE_APEX_CLOUD_ENABLED;
export const apexCloudEnabled = cloudOverride == null ? import.meta.env.PROD : cloudOverride === "true";
const cloudCall = name => async payload => {
  if (!apexCloudEnabled) throw new Error("Apex cloud automation is disabled in this build.");
  return (await httpsCallable(functions, name)(payload || {})).data;
};
const configCall = async payload => { try { return await cloudCall("getPublicBookingConfig")(payload); } catch (error) { console.warn("Apex booking config unavailable; using static service information only.", error); return fallbackConfig(payload || {}); } };
const availabilityCall = async payload => { try { return await cloudCall("listBookingAvailability")(payload); } catch (error) { console.error("Apex live availability unavailable.", error); throw new Error("Live booking availability is temporarily unavailable. Please contact Apex Detailers directly."); } };
const bookingSubmitCall = async payload => { try { return await cloudCall("submitBookingRequest")(payload); } catch (error) { console.error("Apex booking submission unavailable.", error); throw new Error(error?.message || "Live booking validation is temporarily unavailable. Please contact Apex Detailers directly."); } };
async function ensureAuthenticatedUser() { await authPersistenceReady; await auth.authStateReady(); const user = auth.currentUser; if (!user) throw new Error("Sign in to Apex HQ again to use cloud tools."); await user.getIdToken(); return user; }
const privateCall = name => async payload => { try { await ensureAuthenticatedUser(); return await cloudCall(name)(payload); } catch (error) { throw new Error(error?.message || "Apex cloud services are temporarily unavailable."); } };

export const getPublicBookingConfig = configCall;
export const listBookingAvailability = availabilityCall;
export const submitBookingRequest = bookingSubmitCall;
export const approveBookingRequest = privateCall("approveBookingRequest");
export const declineBookingRequest = privateCall("declineBookingRequest");
export const createManualBooking = privateCall("createManualBooking");
export const syncJobToCalendar = privateCall("syncJobToCalendar");
export const submitInquiry = privateCall("submitInquiry");
export const startGoogleCalendarConnect = privateCall("startGoogleCalendarConnect");
export const importGoogleCalendarEvents = privateCall("importGoogleCalendarEvents");
export const scanGoogleCalendarProspects = privateCall("scanGoogleCalendarProspects");
export const saveGoogleCalendarProspect = privateCall("saveGoogleCalendarProspect");
export const dismissGoogleCalendarProspect = privateCall("dismissGoogleCalendarProspect");
export const disconnectGoogleCalendar = privateCall("disconnectGoogleCalendar");

const readLegacyGoogleCalendarStatus = apexCloudEnabled ? privateCall("getGoogleCalendarStatus") : async () => ({ connected:false, disabled:true, email:"Cloud automation is off" });
const readGoogleCalendars = apexCloudEnabled ? privateCall("listGoogleCalendarsV6") : async () => ({ connected:false, healthy:false, calendars:[], selectedCalendarIds:[], primaryCalendarId:"" });
let statusPromise = null;
let statusPromiseStartedAt = 0;
const STATUS_DEDUPE_MS = 1200;

export const getGoogleCalendarStatus = async ({ force=false }={}) => {
  const now=Date.now();
  if(!force && statusPromise && now-statusPromiseStartedAt<STATUS_DEDUPE_MS) return statusPromise;
  statusPromiseStartedAt=now;
  statusPromise=(async()=>{
    try {
      return await readGoogleCalendars();
    } catch {
      return await readLegacyGoogleCalendarStatus();
    }
  })().finally(()=>setTimeout(()=>{ if(Date.now()-statusPromiseStartedAt>=STATUS_DEDUPE_MS) statusPromise=null; },STATUS_DEDUPE_MS));
  return statusPromise;
};

export const listGoogleCalendars = async () => {
  const status=await getGoogleCalendarStatus({force:true});
  return { connected:Boolean(status.connected), healthy:Boolean(status.healthy), email:status.email||"", error:status.error||"", reason:status.reason||"", calendars:Array.isArray(status.calendars)?status.calendars:[], selectedCalendarIds:Array.isArray(status.selectedCalendarIds)?status.selectedCalendarIds:[], primaryCalendarId:status.primaryCalendarId||"" };
};

// Calendar choices are ordinary owner settings, not OAuth credentials. This keeps
// calendar selection independent from the encrypted Google refresh token/secrets.
export const saveGoogleCalendarSelection = async payload => {
  await ensureAuthenticatedUser();
  const status = await getGoogleCalendarStatus({ force:true });
  if (!status.connected) throw new Error("Reconnect Google Calendar first.");
  const calendars = Array.isArray(status.calendars) ? status.calendars : [];
  const allowed = new Set(calendars.map(row => String(row.id || "")).filter(Boolean));
  const writable = new Set(calendars.filter(row => row.writable || ["owner","writer"].includes(row.accessRole)).map(row => String(row.id || "")).filter(Boolean));
  const requested = Array.isArray(payload?.selectedCalendarIds) ? payload.selectedCalendarIds.map(String).filter(id => allowed.has(id)) : [];
  let selectedCalendarIds = [...new Set(requested)];
  let primaryCalendarId = String(payload?.primaryCalendarId || "");
  if (!writable.has(primaryCalendarId)) primaryCalendarId = "";
  if (!primaryCalendarId) primaryCalendarId = selectedCalendarIds.find(id => writable.has(id)) || calendars.find(row => row.primary && writable.has(String(row.id)))?.id || [...writable][0] || "";
  if (!primaryCalendarId) throw new Error("Google did not expose a writable calendar for this account.");
  primaryCalendarId = String(primaryCalendarId);
  if (!selectedCalendarIds.includes(primaryCalendarId)) selectedCalendarIds.unshift(primaryCalendarId);
  await setDoc(doc(db, "settings", "googleCalendar"), { selectedCalendarIds, primaryCalendarId, updatedAt: serverTimestamp() }, { merge:true });
  statusPromise = null;
  return { selectedCalendarIds, primaryCalendarId };
};

export const getCalendarHealth = async () => {
  const status=await getGoogleCalendarStatus({force:true});
  return { ...status, healthy:Boolean(status.healthy ?? (status.connected && status.primaryCalendarId && status.selectedCalendarIds?.length)), reason:status.reason || (status.connected ? (status.primaryCalendarId ? "ok" : "primary-calendar-required") : "not-connected") };
};
