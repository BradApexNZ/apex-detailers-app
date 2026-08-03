import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export const apexCloudEnabled = import.meta.env.VITE_APEX_CLOUD_ENABLED === "true";

const call = name => async payload => {
  if (!apexCloudEnabled) {
    throw new Error("Cloud automation is not enabled in this free showcase build.");
  }

  return (await httpsCallable(functions, name)(payload || {})).data;
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
