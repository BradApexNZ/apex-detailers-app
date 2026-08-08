import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { defineString } from "firebase-functions/params";
import { onCall } from "firebase-functions/v2/https";

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "australia-southeast1";
const ZONE = defineString("APEX_TIME_ZONE", { default: "Pacific/Auckland" });
void ZONE;

const services = [
  { id: "deep", name: "Deep Interior Detail", price: 179, durationMinutes: 300, description: "A thorough interior reset with steam cleaning and extraction where required." },
  { id: "full", name: "Full Detail", price: 249, durationMinutes: 360, description: "Deep interior detail plus exterior wash, wheels, tyres and glass." },
  { id: "tradie", name: "Tradie Reset", price: 229, durationMinutes: 360, description: "Heavy-duty reset for work utes and vans." },
  { id: "seats", name: "Seats Out Reset", price: 399, durationMinutes: 480, description: "Maximum-access interior reset, subject to suitability confirmation." }
];

const defaults = {
  enabled: true,
  minimumNoticeHours: 24,
  bookingWindowDays: 60,
  serviceAreas: ["Napier", "Hastings", "Havelock North", "Taradale", "Ahuriri", "Poraiti"],
  note: "Your selected time is submitted as a booking request until Apex confirms the vehicle details and final price."
};

export const getPublicBookingConfigLaunch = onCall({ region: REGION, enforceAppCheck: false }, async () => {
  const snapshot = await db.doc("settings/booking").get();
  const config = { ...defaults, ...(snapshot.exists ? snapshot.data() : {}) };
  return {
    enabled: Boolean(config.enabled),
    minimumNoticeHours: Number(config.minimumNoticeHours || 24),
    bookingWindowDays: Number(config.bookingWindowDays || 60),
    serviceAreas: Array.isArray(config.serviceAreas) ? config.serviceAreas : defaults.serviceAreas,
    note: config.note || defaults.note,
    services
  };
});
