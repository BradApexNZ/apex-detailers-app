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

// Launch V6: these are the authoritative booking/calendar paths.
export const getPublicBookingConfig = resilientPublicCall("getPublicBookingConfigV6", fallbackConfig);
export const listBookingAvailability = resilientPublicCall("listBookingAvailabilityV6", fallbackAvailability);
export const submitBookingRequest = resilientPublicCall("submitBookingRequestV6", fallbackSubmit);
export const approveBookingRequest = privateCall("approveBookingRequestV6");
export const declineBookingRequest = privateCall("declineBookingRequestV6");
export const createManualBooking = privateCall("createManualBookingV6");
export const syncJobToCalendar = privateCall("syncJobToCalendarV6");
export const getCalendarHealth = privateCall("getCalendarHealthV6");

// Existing integrations retained where they are already built around selectedCalendarIds/primaryCalendarId.
export const submitInquiry = privateCall("submitInquiry");
export const startGoogleCalendarConnect = privateCall("startGoogleCalendarConnect");
export const importGoogleCalendarEvents = privateCall("importGoogleCalendarEvents");
export const listGoogleCalendars = privateCall("listGoogleCalendars");
export const saveGoogleCalendarSelection = privateCall("saveGoogleCalendarSelection");
export const scanGoogleCalendarProspects = privateCall("scanGoogleCalendarProspects");
export const saveGoogleCalendarProspect = privateCall("saveGoogleCalendarProspect");
export const dismissGoogleCalendarProspect = privateCall("dismissGoogleCalendarProspect");

export const getGoogleCalendarStatus = apexCloudEnabled
  ? privateCall("getGoogleCalendarStatus")
  : async () => ({ connected: false, disabled: true, email: "Cloud automation is off" });
