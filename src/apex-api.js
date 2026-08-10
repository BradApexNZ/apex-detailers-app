import { httpsCallable } from "firebase/functions";
import { auth, authPersistenceReady, functions } from "./firebase";
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

const readGoogleCalendarStatus = apexCloudEnabled ? privateCall("getGoogleCalendarStatus") : async () => ({ connected:false, disabled:true, email:"Cloud automation is off" });
let statusPromise = null;
let statusPromiseStartedAt = 0;
const STATUS_DEDUPE_MS = 1200;
export const getGoogleCalendarStatus = async ({ force=false }={}) => {
  const now=Date.now();
  if(!force && statusPromise && now-statusPromiseStartedAt<STATUS_DEDUPE_MS) return statusPromise;
  statusPromiseStartedAt=now;
  statusPromise=readGoogleCalendarStatus().finally(()=>setTimeout(()=>{ if(Date.now()-statusPromiseStartedAt>=STATUS_DEDUPE_MS) statusPromise=null; },STATUS_DEDUPE_MS));
  return statusPromise;
};
export const listGoogleCalendars = async () => {
  const status=await getGoogleCalendarStatus();
  return { connected:Boolean(status.connected), healthy:Boolean(status.healthy), email:status.email||"", error:status.error||"", reason:status.reason||"", calendars:Array.isArray(status.calendars)?status.calendars:[], selectedCalendarIds:Array.isArray(status.selectedCalendarIds)?status.selectedCalendarIds:[], primaryCalendarId:status.primaryCalendarId||"" };
};

// Calendar preferences are validated server-side against the connected Google account.
// If the UI has no writable primary selected, the backend automatically chooses the
// connected account's writable primary calendar and includes it in the selected set.
const saveCalendarSelectionCall = privateCall("saveGoogleCalendarSelection");
export const saveGoogleCalendarSelection = async payload => {
  const result = await saveCalendarSelectionCall(payload || {});
  statusPromise = null;
  return result;
};
export const getCalendarHealth = async () => {
  const status=await getGoogleCalendarStatus({force:true});
  return { ...status, healthy:Boolean(status.healthy ?? (status.connected && status.primaryCalendarId && status.selectedCalendarIds?.length)), reason:status.reason || (status.connected ? (status.primaryCalendarId ? "ok" : "primary-calendar-required") : "not-connected") };
};
