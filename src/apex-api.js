import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

function callable(name) {
  const fn = httpsCallable(functions, name);
  return async payload => {
    const result = await fn(payload || {});
    return result.data;
  };
}

export const getPublicBookingConfig = callable("getPublicBookingConfig");
export const listBookingAvailability = callable("listBookingAvailability");
export const submitBookingRequest = callable("submitBookingRequest");
export const approveBookingRequest = callable("approveBookingRequest");
export const declineBookingRequest = callable("declineBookingRequest");
export const createManualBooking = callable("createManualBooking");
export const getGoogleCalendarStatus = callable("getGoogleCalendarStatus");
export const startGoogleCalendarConnect = callable("startGoogleCalendarConnect");
export const syncJobToCalendar = callable("syncJobToCalendar");
