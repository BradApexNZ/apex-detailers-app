import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// Apex is now running on the paid Firebase project. Keep an environment override
// for local/showcase builds, but enable the real cloud booking workflow in production.
const cloudOverride = import.meta.env.VITE_APEX_CLOUD_ENABLED;
export const apexCloudEnabled = cloudOverride == null
  ? import.meta.env.PROD
  : cloudOverride === "true";

const call = name => async payload => {
  if (!apexCloudEnabled) {
    throw new Error("Apex cloud automation is disabled in this build.");
  }

  try {
    return (await httpsCallable(functions, name)(payload || {})).data;
  } catch (error) {
    const message = error?.message || "Apex cloud services are temporarily unavailable.";
    throw new Error(message);
  }
};

export const getPublicBookingConfig = call("getPublicBookingConfig");
export const listBookingAvailability = call("listBookingAvailability");
export const submitBookingRequest = call("submitBookingRequest");
export const submitInquiry = call("submitInquiry");
export const approveBookingRequest = call("approveBookingRequest");
export const declineBookingRequest = call("declineBookingRequest");
export const createManualBooking = call("createManualBooking");
export const startGoogleCalendarConnect = call("startGoogleCalendarConnect");
export const syncJobToCalendar = call("syncJobToCalendar");

export const getGoogleCalendarStatus = apexCloudEnabled
  ? call("getGoogleCalendarStatus")
  : async () => ({
      connected: false,
      disabled: true,
      email: "Cloud automation is off"
    });
