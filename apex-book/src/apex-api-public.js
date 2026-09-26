import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase-public";
import { fallbackConfig } from "./public-booking-fallback";

const cloudOverride = import.meta.env.VITE_APEX_CLOUD_ENABLED;
export const apexCloudEnabled = cloudOverride == null ? import.meta.env.PROD : cloudOverride === "true";

const cloudCall = name => async payload => {
  if (!apexCloudEnabled) throw new Error("Apex cloud automation is disabled in this build.");
  return (await httpsCallable(functions, name)(payload || {})).data;
};

// Exposed so the UI can show *why* it fell back to static data without needing
// dev tools - getPublicBookingConfig always resolves (falls back on any error),
// which is the right behaviour, but that means the real failure reason would
// otherwise never reach anyone who isn't watching the console.
export let lastConfigError = null;

export const getPublicBookingConfig = async payload => {
  try {
    const result = await cloudCall("getPublicBookingConfig")(payload);
    lastConfigError = null;
    return result;
  } catch (error) {
    lastConfigError = { message: error?.message || String(error), code: error?.code || "", name: error?.name || "" };
    console.warn("Apex booking config unavailable; using static service information only.", error);
    return fallbackConfig(payload || {});
  }
};

export const listBookingAvailability = async payload => {
  try {
    return await cloudCall("listBookingAvailability")(payload);
  } catch (error) {
    console.error("Apex live availability unavailable.", error);
    throw new Error("Live booking availability is temporarily unavailable. Please contact Apex Detailers directly.");
  }
};

export const listMonthAvailability = async payload => {
  try {
    return await cloudCall("listMonthAvailability")(payload);
  } catch (error) {
    console.error("Apex month availability unavailable.", error);
    throw new Error("Could not check the calendar right now. Please try again.");
  }
};

export const submitBookingRequest = async payload => {
  try {
    return await cloudCall("submitBookingRequest")(payload);
  } catch (error) {
    console.error("Apex booking submission unavailable.", error);
    throw new Error(error?.message || "Live booking validation is temporarily unavailable. Please contact Apex Detailers directly.");
  }
};
