import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { db } from "./firebase";
import { publicServicePackages, serviceById } from "./booking-data";

const serviceAreas = ["Napier", "Hastings", "Havelock North", "Taradale", "Ahuriri", "Poraiti"];
const text = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const pad = value => String(value).padStart(2, "0");
const minutes = value => { const [h, m] = String(value).split(":").map(Number); return h * 60 + m; };
const clock = value => `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;

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

export async function fallbackAvailability({ date, serviceId }) {
  const service = serviceById(serviceId);
  if (!date || !service) return { date, slots: [] };
  const chosen = new Date(`${date}T00:00:00+12:00`);
  const now = new Date();
  const earliest = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const latest = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(chosen.getTime()) || chosen < new Date(earliest.toDateString()) || chosen > latest || chosen.getDay() === 0) return { date, slots: [] };

  const snapshot = await getDocs(query(collection(db, "bookingLocks"), where("date", "==", date)));
  const blocked = snapshot.docs.map(item => item.data()).filter(item => item.status !== "released");
  const duration = Number(service.durationMinutes || 300);
  const rows = [];
  for (let start = 8 * 60; start + duration <= 18 * 60; start += 30) {
    const end = start + duration;
    const overlaps = blocked.some(item => start < minutes(item.endTime) && end > minutes(item.startTime));
    if (!overlaps) rows.push({ start: clock(start), end: clock(end) });
  }
  return { date, slots: rows };
}

export async function fallbackSubmit(input) {
  if (input.website) throw new Error("Unable to submit this request.");
  const service = serviceById(input.serviceId);
  const data = {
    serviceId: text(service.id, 30),
    serviceName: text(service.name, 100),
    durationMinutes: Number(service.durationMinutes || 300),
    estimatedPrice: Number(service.price || 0),
    vehicleType: text(input.vehicleType, 30),
    bookingDate: text(input.bookingDate, 10),
    bookingTime: text(input.bookingTime, 5),
    bookingEndTime: text(input.bookingEndTime, 5),
    customerName: text(input.customerName, 120),
    phone: text(input.phone, 40),
    email: text(input.email, 180).toLowerCase(),
    address: text(input.address, 240),
    area: text(input.area, 80),
    vehicleYear: text(input.vehicleYear, 8),
    vehicleMake: text(input.vehicleMake, 80),
    vehicleModel: text(input.vehicleModel, 80),
    rego: text(input.rego, 20).toUpperCase(),
    condition: text(input.condition, 30),
    petHair: Boolean(input.petHair),
    heavyStains: Boolean(input.heavyStains),
    notes: text(input.notes, 1200),
    acceptedTerms: Boolean(input.acceptedTerms),
    source: "public-firestore-fallback"
  };
  if (!data.customerName || !data.phone || !data.email || !data.address || !data.bookingDate || !data.bookingTime || !data.bookingEndTime || !data.acceptedTerms) {
    throw new Error("Complete all required booking details.");
  }

  const requestRef = doc(collection(db, "bookingRequests"));
  const lockId = `${data.bookingDate}_${data.bookingTime.replace(":", "-")}`;
  const lockRef = doc(db, "bookingLocks", lockId);
  const reference = `APX-${requestRef.id.slice(0, 6).toUpperCase()}`;
  await runTransaction(db, async transaction => {
    const existing = await transaction.get(lockRef);
    if (existing.exists()) throw new Error("That time was just requested. Please choose another.");
    transaction.set(lockRef, {
      date: data.bookingDate,
      startTime: data.bookingTime,
      endTime: data.bookingEndTime,
      status: "pending",
      requestId: requestRef.id,
      createdAt: serverTimestamp()
    });
    transaction.set(requestRef, {
      ...data,
      lockId,
      status: "pending",
      reference,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
  return { reference, serviceName: data.serviceName, bookingDate: data.bookingDate, bookingTime: data.bookingTime, emailSent: false };
}
