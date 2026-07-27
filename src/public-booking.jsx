import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from "firebase/firestore";
import { db } from "./firebase";
import {
  conditionLevels,
  defaultBookingSettings,
  formatLongDate,
  getAvailableDates,
  money,
  packageById,
  servicePackages,
  slotKey,
  vehicleTypes
} from "./booking-data";
import "./public-booking.css";

const initialForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  address: "",
  area: "",
  vehicleYear: "",
  vehicleMake: "",
  vehicleModel: "",
  rego: "",
  vehicleType: "small",
  condition: "average",
  packageId: "deep",
  preferredDate: "",
  preferredTime: "",
  notes: "",
  outsideTapConfirmed: false,
  consentConfirmed: false,
  website: ""
};

function Brand() {
  return (
    <div className="bookingBrand" aria-label="Apex Detailers">
      <span className="brandSignal" aria-hidden="true" />
      <div>
        <strong>APEX DETAILERS</strong>
        <small>HAWKE'S BAY</small>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function PublicBooking() {
  const [settings, setSettings] = useState(defaultBookingSettings);
  const [bookedSlots, setBookedSlots] = useState(new Set());
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    let active = true;
    getDoc(doc(db, "publicSettings", "booking"))
      .then(snapshot => {
        if (active && snapshot.exists()) {
          setSettings({ ...defaultBookingSettings, ...snapshot.data() });
        }
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));

    const stop = onSnapshot(collection(db, "bookingSlots"), snapshot => {
      setBookedSlots(new Set(snapshot.docs.map(item => item.id)));
    }, () => setLoading(false));

    return () => { active = false; stop(); };
  }, []);

  const dates = useMemo(
    () => getAvailableDates(settings, bookedSlots),
    [settings, bookedSlots]
  );

  const selectedDate = dates.find(item => item.date === form.preferredDate);
  const selectedPackage = packageById(form.packageId);

  function update(key, value) {
    setError("");
    setForm(previous => {
      const next = { ...previous, [key]: value };
      if (key === "preferredDate") next.preferredTime = "";
      return next;
    });
  }

  function validate() {
    if (form.website) return "Unable to submit.";
    if (!form.firstName.trim() || !form.phone.trim()) return "Add your name and phone number.";
    if (!form.vehicleMake.trim() || !form.vehicleModel.trim()) return "Add the vehicle make and model.";
    if (!form.preferredDate || !form.preferredTime) return "Choose an available appointment.";
    if (!form.address.trim() || !form.area.trim()) return "Add the service address and suburb/area.";
    if (!form.outsideTapConfirmed) return "Please confirm that an outside tap is available.";
    if (!form.consentConfirmed) return "Please confirm the booking and privacy acknowledgement.";
    return "";
  }

  async function submit(event) {
    event.preventDefault();
    const validation = validate();
    if (validation) return setError(validation);

    setSubmitting(true);
    setError("");
    const requestRef = doc(collection(db, "bookingRequests"));
    const key = slotKey(form.preferredDate, form.preferredTime);
    const slotRef = doc(db, "bookingSlots", key);
    const batch = writeBatch(db);

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      customerName: `${form.firstName} ${form.lastName}`.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      area: form.area.trim(),
      vehicleYear: form.vehicleYear.trim(),
      vehicleMake: form.vehicleMake.trim(),
      vehicleModel: form.vehicleModel.trim(),
      rego: form.rego.trim().toUpperCase(),
      vehicleType: form.vehicleType,
      condition: form.condition,
      packageId: form.packageId,
      packageName: selectedPackage.name,
      estimatedFromPrice: selectedPackage.price,
      preferredDate: form.preferredDate,
      preferredTime: form.preferredTime,
      slotKey: key,
      notes: form.notes.trim(),
      outsideTapConfirmed: true,
      consentConfirmed: true,
      source: "public",
      status: "pending",
      createdAt: serverTimestamp()
    };

    batch.set(requestRef, payload);
    batch.set(slotRef, {
      slotKey: key,
      date: form.preferredDate,
      time: form.preferredTime,
      requestId: requestRef.id,
      status: "pending",
      source: "public",
      createdAt: serverTimestamp()
    });

    try {
      await batch.commit();
      setSuccess({
        reference: requestRef.id.slice(0, 8).toUpperCase(),
        date: form.preferredDate,
        time: form.preferredTime,
        service: selectedPackage.name
      });
      setForm(initialForm);
    } catch (submitError) {
      console.error(submitError);
      setError(
        submitError?.code === "permission-denied"
          ? "That appointment was just taken. Choose another available time."
          : "The booking could not be sent. Please try again or contact Apex directly."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main className="bookingShell"><div className="loadingCard"><Brand /><span className="spinner" /><p>Loading available appointments…</p></div></main>;
  }

  if (!settings.enabled) {
    return (
      <main className="bookingShell">
        <section className="closedCard">
          <Brand />
          <p className="kicker">ONLINE BOOKINGS PAUSED</p>
          <h1>Bookings are temporarily being handled directly.</h1>
          <p>Email <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a> and Apex will get you sorted.</p>
        </section>
      </main>
    );
  }

  if (success) {
    return (
      <main className="bookingShell">
        <section className="successCard">
          <Brand />
          <div className="successIcon">✓</div>
          <p className="kicker">REQUEST RECEIVED</p>
          <h1>Your preferred appointment is being held.</h1>
          <p>Apex will confirm the booking after checking the vehicle details and travel requirements.</p>
          <div className="confirmationGrid">
            <div><span>Service</span><strong>{success.service}</strong></div>
            <div><span>Preferred time</span><strong>{formatLongDate(success.date)} at {success.time}</strong></div>
            <div><span>Reference</span><strong>{success.reference}</strong></div>
          </div>
          <button type="button" onClick={() => setSuccess(null)}>Book another vehicle</button>
        </section>
      </main>
    );
  }

  return (
    <main className="bookingShell">
      <header className="bookingHeader">
        <Brand />
        <a href={`mailto:${settings.contactEmail}`}>Need help?</a>
      </header>

      <section className="bookingHero">
        <div>
          <p className="kicker">ONLINE BOOKING · HAWKE'S BAY</p>
          <h1>{settings.headline}</h1>
          <p>{settings.intro}</p>
        </div>
        <div className="heroMeta">
          <span>Mobile / semi-mobile service</span>
          <span>{settings.serviceArea}</span>
          <span>Final price confirmed before work begins</span>
        </div>
      </section>

      <form className="bookingForm" onSubmit={submit}>
        <section className="formSection">
          <div className="sectionNumber">01</div>
          <div className="sectionHeading">
            <p className="kicker">CHOOSE YOUR SERVICE</p>
            <h2>What does the vehicle need?</h2>
          </div>
          <div className="packageGrid">
            {servicePackages.map(item => (
              <button
                type="button"
                key={item.id}
                className={`packageCard ${form.packageId === item.id ? "selected" : ""}`}
                onClick={() => update("packageId", item.id)}
              >
                <span className="selectionDot" />
                <strong>{item.name}</strong>
                <em>from {money(item.price)}</em>
                <p>{item.description}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="formSection">
          <div className="sectionNumber">02</div>
          <div className="sectionHeading">
            <p className="kicker">VEHICLE DETAILS</p>
            <h2>Tell Apex what is being detailed.</h2>
          </div>
          <div className="formGrid two">
            <Field label="Vehicle year"><input inputMode="numeric" value={form.vehicleYear} onChange={event => update("vehicleYear", event.target.value)} placeholder="e.g. 2018" /></Field>
            <Field label="Make"><input value={form.vehicleMake} onChange={event => update("vehicleMake", event.target.value)} placeholder="e.g. Ford" required /></Field>
            <Field label="Model"><input value={form.vehicleModel} onChange={event => update("vehicleModel", event.target.value)} placeholder="e.g. Ranger" required /></Field>
            <Field label="Registration"><input value={form.rego} onChange={event => update("rego", event.target.value)} placeholder="Optional" /></Field>
            <Field label="Vehicle type"><select value={form.vehicleType} onChange={event => update("vehicleType", event.target.value)}>{vehicleTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Current condition"><select value={form.condition} onChange={event => update("condition", event.target.value)}>{conditionLevels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          </div>
        </section>

        <section className="formSection">
          <div className="sectionNumber">03</div>
          <div className="sectionHeading">
            <p className="kicker">PREFERRED APPOINTMENT</p>
            <h2>Choose an available starting time.</h2>
          </div>
          {!dates.length ? (
            <div className="noSlots">No online appointments are currently available. Email {settings.contactEmail} and Apex will find an option.</div>
          ) : (
            <>
              <div className="dateRail">
                {dates.slice(0, 14).map(item => (
                  <button type="button" key={item.date} className={form.preferredDate === item.date ? "selected" : ""} onClick={() => update("preferredDate", item.date)}>
                    <small>{new Date(`${item.date}T00:00:00`).toLocaleDateString("en-NZ", { weekday: "short" })}</small>
                    <strong>{new Date(`${item.date}T00:00:00`).getDate()}</strong>
                    <span>{new Date(`${item.date}T00:00:00`).toLocaleDateString("en-NZ", { month: "short" })}</span>
                  </button>
                ))}
              </div>
              {form.preferredDate && (
                <div className="timeGrid">
                  {selectedDate?.times.map(time => (
                    <button type="button" key={time} className={form.preferredTime === time ? "selected" : ""} onClick={() => update("preferredTime", time)}>{time}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <section className="formSection">
          <div className="sectionNumber">04</div>
          <div className="sectionHeading">
            <p className="kicker">CONTACT & LOCATION</p>
            <h2>Where should Apex come to?</h2>
          </div>
          <div className="formGrid two">
            <Field label="First name"><input autoComplete="given-name" value={form.firstName} onChange={event => update("firstName", event.target.value)} required /></Field>
            <Field label="Last name"><input autoComplete="family-name" value={form.lastName} onChange={event => update("lastName", event.target.value)} /></Field>
            <Field label="Mobile"><input type="tel" autoComplete="tel" value={form.phone} onChange={event => update("phone", event.target.value)} required /></Field>
            <Field label="Email"><input type="email" autoComplete="email" value={form.email} onChange={event => update("email", event.target.value)} /></Field>
            <Field label="Service address"><input autoComplete="street-address" value={form.address} onChange={event => update("address", event.target.value)} required /></Field>
            <Field label="Suburb / area"><input autoComplete="address-level2" value={form.area} onChange={event => update("area", event.target.value)} placeholder="e.g. Taradale" required /></Field>
          </div>
          <Field label="Anything Apex should know?" hint="Mention pet hair, stains, sand, work grime, odours, access issues or anything unusual.">
            <textarea rows="5" value={form.notes} onChange={event => update("notes", event.target.value)} placeholder="Optional notes" />
          </Field>
          <input className="honeypot" tabIndex="-1" autoComplete="off" value={form.website} onChange={event => update("website", event.target.value)} aria-hidden="true" />
        </section>

        <section className="reviewSection">
          <div className="reviewSummary">
            <p className="kicker">YOUR REQUEST</p>
            <h2>{selectedPackage.name}</h2>
            <div><span>Estimate</span><strong>from {money(selectedPackage.price)}</strong></div>
            <div><span>Vehicle</span><strong>{[form.vehicleYear, form.vehicleMake, form.vehicleModel].filter(Boolean).join(" ") || "Add vehicle details"}</strong></div>
            <div><span>Appointment</span><strong>{form.preferredDate ? `${formatLongDate(form.preferredDate)}${form.preferredTime ? ` at ${form.preferredTime}` : ""}` : "Choose a date and time"}</strong></div>
          </div>
          <div className="confirmPanel">
            <label className="checkRow"><input type="checkbox" checked={form.outsideTapConfirmed} onChange={event => update("outsideTapConfirmed", event.target.checked)} /><span>An accessible outside tap and safe working space will be available.</span></label>
            <label className="checkRow"><input type="checkbox" checked={form.consentConfirmed} onChange={event => update("consentConfirmed", event.target.checked)} /><span>I understand this is a pending booking request. Apex will confirm the final price and appointment.</span></label>
            {error && <div className="formError" role="alert">{error}</div>}
            <button className="submitButton" type="submit" disabled={submitting || !dates.length}>{submitting ? "Sending request…" : "Request this booking"}</button>
            <small>By submitting, you agree that Apex can contact you about this booking. No payment is taken online.</small>
          </div>
        </section>
      </form>

      <footer>
        <Brand />
        <p>Premium vehicle detailing in Hawke's Bay.</p>
        <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<PublicBooking />);
