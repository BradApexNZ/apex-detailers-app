import { publicServicePackages } from "./booking-data";

const serviceAreas = ["Napier", "Hastings", "Havelock North", "Taradale", "Ahuriri", "Poraiti"];

export async function fallbackConfig() {
  return {
    enabled: true,
    minimumNoticeHours: 24,
    bookingWindowDays: 60,
    serviceAreas,
    note: "Your selected time is submitted as a booking request until Apex confirms the vehicle details and final price.",
    services: publicServicePackages
  };
}
