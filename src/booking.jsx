import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { getPublicBookingConfig, listBookingAvailability, submitBookingRequest } from "./apex-api";
import "./booking.css";

const money = value => new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(Number(value || 0));
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });

function ApexMark() {
  return <div className="publicApexMark" aria-label="Apex Detailers"><span>A</span><i /></div>;
}

function Stepper({ step }) {
  return <div className="stepper" aria-label={`Step ${step} of 4`}>{[1,2,3,4].map(number => <span key={number} className={number <= step ? "active" : ""}>{number}</span>)}</div>;
}

function BookingApp() {
  const [config, setConfig] = useState(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [slots, setSlots] = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const [form, setForm] = useState({
    serviceId: "deep",
    vehicleType: "small",
    bookingDate: "",
    bookingTime: "",
    bookingEndTime: "",
    customerName: "",
    phone: "",
    email: "",
    address: "",
    area: "Napier",
    vehicleYear: "",
    vehicleMake: "",
    vehicleModel: "",
    rego: "",
    condition: "normal",
    petHair: false,
    heavyStains: false,
    notes: "",
    website: ""
  });
  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }));

  useEffect(() => {
    getPublicBookingConfig().then(result => {
      setConfig(result);
      if (result.services?.length && !result.services.find(service => service.id === form.serviceId)) update("serviceId", result.services[0].id);
    }).catch(err => {
      console.error(err);
      setError("Online booking is unavailable right now. Please message Apex Detailers directly.");
    }).finally(() => setLoading(false));
  }, []);

  const service = useMemo(() => config?.services?.find(item => item.id === form.serviceId), [config, form.serviceId]);
  const minDate = today();
  const maxDate = useMemo(() => {
    const date = new Date(`${minDate}T12:00:00`);
    date.setDate(date.getDate() + Number(config?.bookingWindowDays || 60));
    return date.toISOString().slice(0,10);
  }, [config, minDate]);

  async function findTimes() {
    if (!form.bookingDate) return setError("Choose a date first.");
    setSearching(true); setError(""); setSlots([]);
    try {
      const result = await listBookingAvailability({ date: form.bookingDate, serviceId: form.serviceId });
      setSlots(result.slots || []);
      if (!(result.slots || []).length) setError("That day is fully booked or unavailable. Try another date.");
      else setStep(3);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not load available times.");
    }
    setSearching(false);
  }

  function chooseSlot(slot) {
    update("bookingTime", slot.start);
    update("bookingEndTime", slot.end);
    setStep(4);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event) {
    event.preventDefault(); setSubmitting(true); setError("");
    try {
      const result = await submitBookingRequest(form);
      setConfirmation(result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error(err);
      setError(err?.message || "The request could not be sent. The time may have just been taken.");
    }
    setSubmitting(false);
  }

  if (loading) return <main className="publicSplash"><ApexMark/><span>Loading online booking…</span></main>;
  if (confirmation) return <main className="bookingPage"><header className="publicHeader"><div className="publicBrand"><ApexMark/><div><strong>APEX DETAILERS</strong><span>HAWKE'S BAY</span></div></div></header><section className="successCard"><div className="successTick">✓</div><span className="eyebrow">Request received</span><h1>Your Apex booking is in.</h1><p>Brad will review the vehicle details and confirm the appointment. The selected time is being held while the request is checked.</p><div className="confirmationGrid"><span><b>{confirmation.serviceName}</b>Service</span><span><b>{confirmation.bookingDate}</b>Date</span><span><b>{confirmation.bookingTime}</b>Start time</span><span><b>{confirmation.reference}</b>Reference</span></div><p className="finePrint">Final pricing is confirmed after Apex reviews vehicle size, condition and the amount of work required.</p></section></main>;

  return <main className="bookingPage">
    <header className="publicHeader"><div className="publicBrand"><ApexMark/><div><strong>APEX DETAILERS</strong><span>HAWKE'S BAY</span></div></div><a href="mailto:bookings@apexdetailers.co.nz">Need help?</a></header>
    <section className="bookingHero"><div><span className="eyebrow">Mobile car detailing</span><h1>Book your vehicle in.</h1><p>Choose the service, pick an available time, and send your vehicle details straight into Apex HQ.</p></div><div className="heroBadge"><b>Napier</b><span>Hastings · Havelock North</span></div></section>
    <Stepper step={step} />
    {error && <button type="button" className="publicError" onClick={() => setError("")}>{error}</button>}

    {step === 1 && <section className="bookingCard"><header><span className="stepLabel">01 — SERVICE</span><h2>What does your vehicle need?</h2><p>Prices are starting points. Vehicle size and condition can change the final quote.</p></header><div className="serviceGrid">{config?.services?.map(item => <button type="button" key={item.id} className={form.serviceId === item.id ? "selected" : ""} onClick={() => update("serviceId", item.id)}><div><strong>{item.name}</strong><span>{item.description}</span></div><b>from {money(item.price)}</b><small>Allow around {Math.round(item.durationMinutes / 30) / 2} hours</small></button>)}</div><label className="selectLabel">Vehicle type<select value={form.vehicleType} onChange={event => update("vehicleType", event.target.value)}><option value="small">Sedan / hatch</option><option value="suv">SUV / wagon</option><option value="singlecab">Single-cab ute</option><option value="doublecab">Double-cab ute</option><option value="large">7-seater / large SUV</option><option value="van">Van / oversized</option></select></label><button type="button" className="primaryPublic" onClick={() => setStep(2)}>Choose a date <span>→</span></button></section>}

    {step === 2 && <section className="bookingCard"><header><button type="button" className="backLink" onClick={() => setStep(1)}>← Back</button><span className="stepLabel">02 — DATE</span><h2>When suits you?</h2><p>Available times already account for confirmed Apex jobs and connected Google Calendar events.</p></header><label className="datePicker">Preferred date<input type="date" min={minDate} max={maxDate} value={form.bookingDate} onChange={event => update("bookingDate", event.target.value)} /></label><div className="selectedSummary"><span>{service?.name}</span><b>from {money(service?.price)}</b></div><button type="button" className="primaryPublic" onClick={findTimes} disabled={searching}>{searching ? "Checking the calendar…" : "Show available times"}</button><p className="bookingNote">{config?.note}</p></section>}

    {step === 3 && <section className="bookingCard"><header><button type="button" className="backLink" onClick={() => setStep(2)}>← Change date</button><span className="stepLabel">03 — TIME</span><h2>Pick an available start.</h2><p>{new Date(`${form.bookingDate}T00:00:00`).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" })}</p></header><div className="slotGrid">{slots.map(slot => <button type="button" key={slot.start} onClick={() => chooseSlot(slot)}><strong>{slot.start}</strong><span>Finish about {slot.end}</span></button>)}</div></section>}

    {step === 4 && <section className="bookingCard"><header><button type="button" className="backLink" onClick={() => setStep(3)}>← Change time</button><span className="stepLabel">04 — DETAILS</span><h2>Tell Apex about the job.</h2><p>The clearer the details, the quicker Brad can confirm it.</p></header><form className="publicForm" onSubmit={submit}><label>Full name<input value={form.customerName} onChange={event => update("customerName", event.target.value)} autoComplete="name" required /></label><label>Mobile number<input value={form.phone} onChange={event => update("phone", event.target.value)} inputMode="tel" autoComplete="tel" required /></label><label>Email<input type="email" value={form.email} onChange={event => update("email", event.target.value)} autoComplete="email" /></label><label>Area<select value={form.area} onChange={event => update("area", event.target.value)}>{(config?.serviceAreas || ["Napier", "Hastings", "Havelock North", "Taradale", "Ahuriri", "Poraiti"]).map(area => <option key={area}>{area}</option>)}</select></label><label className="wide">Detailing address<input value={form.address} onChange={event => update("address", event.target.value)} autoComplete="street-address" required /></label><label>Vehicle year<input value={form.vehicleYear} onChange={event => update("vehicleYear", event.target.value)} inputMode="numeric" placeholder="2018" /></label><label>Make<input value={form.vehicleMake} onChange={event => update("vehicleMake", event.target.value)} placeholder="Toyota" required /></label><label>Model<input value={form.vehicleModel} onChange={event => update("vehicleModel", event.target.value)} placeholder="Hilux" required /></label><label>Rego<input value={form.rego} onChange={event => update("rego", event.target.value.toUpperCase())} /></label><label>Current condition<select value={form.condition} onChange={event => update("condition", event.target.value)}><option value="normal">Normal / maintained</option><option value="dirty">Dirty / needs a deep clean</option><option value="heavily">Heavily soiled</option></select></label><label className="checkLabel"><input type="checkbox" checked={form.petHair} onChange={event => update("petHair", event.target.checked)} /><span>Pet hair present</span></label><label className="checkLabel"><input type="checkbox" checked={form.heavyStains} onChange={event => update("heavyStains", event.target.checked)} /><span>Heavy stains present</span></label><label className="wide">Anything Apex should know?<textarea rows="4" value={form.notes} onChange={event => update("notes", event.target.value)} placeholder="Access, stains, odours, vehicle use, or anything unusual…" /></label><label className="botField" aria-hidden="true">Website<input tabIndex="-1" autoComplete="off" value={form.website} onChange={event => update("website", event.target.value)} /></label><div className="bookingReview wide"><span><b>{service?.name}</b>from {money(service?.price)}</span><span><b>{form.bookingDate}</b>{form.bookingTime}–{form.bookingEndTime}</span></div><button type="submit" className="primaryPublic wide" disabled={submitting}>{submitting ? "Sending to Apex HQ…" : "Request this booking"}</button><p className="finePrint wide">By submitting, you are requesting the selected appointment. Apex confirms the booking and final price after reviewing vehicle size and condition. An accessible outside tap is required.</p></form></section>}
    <footer className="publicFooter"><strong>APEX DETAILERS</strong><span>Napier · Hastings · Hawke's Bay</span><a href="mailto:bookings@apexdetailers.co.nz">bookings@apexdetailers.co.nz</a></footer>
  </main>;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><BookingApp /></React.StrictMode>);
