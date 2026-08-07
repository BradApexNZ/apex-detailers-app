import { httpsCallable } from "firebase/functions";
import { auth, authPersistenceReady, functions } from "./firebase";
import { fallbackConfig } from "./public-booking-fallback";

const cloudOverride = import.meta.env.VITE_APEX_CLOUD_ENABLED;
export const apexCloudEnabled = cloudOverride == null
  ? import.meta.env.PROD
  : cloudOverride === "true";

const cloudCall = name => async payload => {
  if (!apexCloudEnabled) throw new Error("Apex cloud automation is disabled in this build.");
  return (await httpsCallable(functions, name)(payload || {})).data;
};

const configCall = async payload => {
  try {
    return await cloudCall("getPublicBookingConfigLaunch")(payload);
  } catch (error) {
    console.warn("Apex booking config unavailable; using static service information only.", error);
    return fallbackConfig(payload || {});
  }
};

const availabilityCall = async payload => {
  try {
    return await cloudCall("listBookingAvailabilityV6")(payload);
  } catch (error) {
    console.error("Apex live availability unavailable.", error);
    throw new Error("Live booking availability is temporarily unavailable. Please contact Apex Detailers directly.");
  }
};

const bookingSubmitCall = async payload => {
  try {
    return await cloudCall("submitBookingRequestV6")(payload);
  } catch (error) {
    console.error("Apex booking submission unavailable.", error);
    throw new Error(error?.message || "Live booking validation is temporarily unavailable. Please contact Apex Detailers directly.");
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

// Launch V6: authoritative booking/calendar paths. Booking fails closed if live conflict validation is unavailable.
export const getPublicBookingConfig = configCall;
export const listBookingAvailability = availabilityCall;
export const submitBookingRequest = bookingSubmitCall;
export const approveBookingRequest = privateCall("approveBookingRequestV6");
export const declineBookingRequest = privateCall("declineBookingRequestV6");
export const createManualBooking = privateCall("createManualBookingV6");
export const syncJobToCalendar = privateCall("syncJobToCalendarV6");
export const getCalendarHealth = privateCall("getCalendarHealthV6");

// Google OAuth remains the proven connection flow; V6 owns calendar selection validation and booking behaviour.
export const submitInquiry = privateCall("submitInquiry");
export const startGoogleCalendarConnect = privateCall("startGoogleCalendarConnect");
export const importGoogleCalendarEvents = privateCall("importGoogleCalendarEvents");
export const listGoogleCalendars = privateCall("listGoogleCalendarsV6");
export const saveGoogleCalendarSelection = privateCall("saveGoogleCalendarSelectionV6");
export const scanGoogleCalendarProspects = privateCall("scanGoogleCalendarProspects");
export const saveGoogleCalendarProspect = privateCall("saveGoogleCalendarProspect");
export const dismissGoogleCalendarProspect = privateCall("dismissGoogleCalendarProspect");

export const getGoogleCalendarStatus = apexCloudEnabled
  ? privateCall("getGoogleCalendarStatus")
  : async () => ({ connected: false, disabled: true, email: "Cloud automation is off" });
