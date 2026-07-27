import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

const call = name => async payload => (await httpsCallable(functions, name)(payload || {})).data;

export const getPublicBookingConfig = call("getPublicBookingConfig");
export const listBookingAvailability = call("listBookingAvailability");
export const submitBookingRequest = call("submitBookingRequest");
export const submitInquiry = call("submitInquiry");
export const approveBookingRequest = call("approveBookingRequest");
export const declineBookingRequest = call("declineBookingRequest");
export const createManualBooking = call("createManualBooking");
export const getGoogleCalendarStatus = call("getGoogleCalendarStatus");
export const startGoogleCalendarConnect = call("startGoogleCalendarConnect");
export const syncJobToCalendar = call("syncJobToCalendar");
