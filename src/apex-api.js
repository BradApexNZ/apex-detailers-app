import { httpsCallable } from "firebase/functions";
import { auth, authPersistenceReady, functions } from "./firebase";
import {
  fallbackAvailability,
  fallbackConfig,
  fallbackSubmit
} from "./public-booking-fallback";

const cloudOverride = import.meta.env.VITE_APEX_CLOUD_ENABLED;
export const apexCloudEnabled = cloudOverride == null
  ? import.meta.env.PROD
  : cloudOverride === "true";

const cloudCall = name => async payload => {
  if (!apexCloudEnabled) throw new Error("Apex cloud automation is disabled in this build.");
  return (await httpsCallable(functions, name)(payload || {})).data;
};

const resilientPublicCall = (name, fallback) => async payload => {
  try {
    return await cloudCall(name)(payload);
  } catch (error) {
    console.warn(`${name} unavailable; using Apex direct booking fallback.`, error);
    return fallback(payload || {});
  }
};

async function ensureAuthenticatedUser() {
  await authPersistenceReady;
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to Apex HQ again to use cloud tools.");
  await user.getIdToken();
}

const privateCall = name => async payload => {
  try {
    await ensureAuthenticatedUser();
    return await cloudCall(name)(payload);
  } catch (error) {
    const message = error?.message || "Apex cloud services are temporarily unavailable.";
    throw new Error(message);
  }
};

export const getPublicBookingConfig = resilientPublicCall("getPublicBookingConfig", fallbackConfig);
export const listBookingAvailability = resilientPublicCall("listBookingAvailability", fallbackAvailability);
export const submitBookingRequest = resilientPublicCall("submitBookingRequest", fallbackSubmit);
export const submitInquiry = privateCall("submitInquiry");
export const approveBookingRequest = privateCall("approveBookingRequest");
export const declineBookingRequest = privateCall("declineBookingRequest");
export const createManualBooking = privateCall("createManualBooking");
export const startGoogleCalendarConnect = privateCall("startGoogleCalendarConnect");
export const syncJobToCalendar = privateCall("syncJobToCalendar");
export const importGoogleCalendarEvents = privateCall("importGoogleCalendarEvents");
export const listGoogleCalendars = privateCall("listGoogleCalendars");
export const saveGoogleCalendarSelection = privateCall("saveGoogleCalendarSelection");
export const scanGoogleCalendarProspects = privateCall("scanGoogleCalendarProspects");
export const saveGoogleCalendarProspect = privateCall("saveGoogleCalendarProspect");
export const dismissGoogleCalendarProspect = privateCall("dismissGoogleCalendarProspect");

export const getGoogleCalendarStatus = apexCloudEnabled
  ? privateCall("getGoogleCalendarStatus")
  : async () => ({ connected: false, disabled: true, email: "Cloud automation is off" });
