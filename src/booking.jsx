import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  apexCloudEnabled,
  getPublicBookingConfig,
  listBookingAvailability,
  listMonthAvailability,
  submitBookingRequest
} from "./apex-api-public";
import { money, publicServicePackages, serviceById } from "./booking-data";
import { useNewVersionAvailable } from "./use-new-version-available";

const ZONE = "Pacific/Auckland";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: ZONE });
const monthKey = date => date.slice(0, 7);

// Pure calendar-date arithmetic, deliberately not "real" timezone-aware Date
// math - these are calendar days, not moments in time, so everything below
// runs through Date.UTC purely as a Y-M-D calculator to sidestep DST/local
// timezone edge cases entirely rather than needing to reason about them.
const pad2 = value => String(value).padStart(2, "0");
const ymd = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const weekdayOf = dateStr => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const addMonths = (key, delta) => {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`;
};
const addDays = (dateStr, days) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return ymd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};
const monthLabel = key => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-NZ", { month: "long", year: "numeric", timeZone: "UTC" });
};
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// A stalled network call otherwise leaves a button stuck on "Checking..." /
// "Sending..." forever with no error and no way out - this guarantees every
// booking-flow action either succeeds or fails visibly within 15s.
const withTimeout = (promise, ms = 15000) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out. Please try again.")), ms))]);

function BookingCalendar({ serviceId, value, bookingWindowDays, onSelect }) {
  const [viewMonth, setViewMonth] = useState(() => monthKey(value || today()));
  const [fullDates, setFullDates] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    withTimeout(listMonthAvailability({ serviceId, month: viewMonth }))
      .then(result => {
        if (cancelled) return;
        setFullDates(new Set(result?.fullDates || []));
      })
      .catch(() => {
        if (!cancelled) setError("Could not check the calendar. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, viewMonth]);

  const todayStr = today();
  const maxDateStr = addDays(todayStr, Number(bookingWindowDays || 60));
  const [viewYear, viewMonthNum] = viewMonth.split("-").map(Number);
  const total = daysInMonth(viewYear, viewMonthNum);
  const leadingBlanks = (weekdayOf(`${viewMonth}-01`) + 6) % 7;

  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= total; day++) cells.push(ymd(viewYear, viewMonthNum, day));

  const canGoPrev = viewMonth > monthKey(todayStr);
  const canGoNext = `${addMonths(viewMonth, 1)}-01` <= maxDateStr;

  return (
    <div className="apexCalendar">
      <div className="apexCalHeader">
        <button type="button" onClick={() => setViewMonth(month => addMonths(month, -1))} disabled={!canGoPrev} aria-label="Previous month">
          ‹
        </button>
        <strong>{monthLabel(viewMonth)}</strong>
        <button type="button" onClick={() => setViewMonth(month => addMonths(month, 1))} disabled={!canGoNext} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="apexCalWeekdays">
        {WEEKDAY_LABELS.map(label => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="apexCalGrid">
        {cells.map((dateStr, index) => {
          if (!dateStr) return <i key={`blank-${index}`} className="apexCalBlank" />;
          const disabled = dateStr < todayStr || dateStr > maxDateStr || fullDates.has(dateStr) || loading;
          return (
            <button
              type="button"
              key={dateStr}
              className={`apexCalDay${dateStr === value ? " selected" : ""}${disabled ? " disabled" : ""}`}
              disabled={disabled}
              onClick={() => onSelect(dateStr)}
            >
              {Number(dateStr.slice(-2))}
            </button>
          );
        })}
      </div>
      {loading && <div className="apexCalStatus">Checking availability…</div>}
      {error && <div className="apexCalStatus apexCalStatus--error">{error}</div>}
    </div>
  );
}

const blank = {
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
  acceptedTerms: false,
  website: ""
};

function Mark() {
  return (
    <div className="mark">
      <img src="/apex-logo-official.svg" alt="Apex Detailers" />
    </div>
  );
}

function VersionBanner() {
  return (
    <div className="versionBanner">
      <span>A newer version of this page is available.</span>
      <button type="button" onClick={() => window.location.reload()}>
        Refresh
      </button>
    </div>
  );
}

function Header() {
  return (
    <header>
      <div className="brand">
        <Mark />
        <div>
          <strong>APEX DETAILERS</strong>
          <small>HAWKE'S BAY</small>
        </div>
      </div>
      <a href="mailto:bookings@apexdetailers.co.nz">Contact Apex</a>
    </header>
  );
}

function ShowcaseBooking() {
  const [selectedId, setSelectedId] = useState("full");
  const selected = serviceById(selectedId);
  const emailSubject = encodeURIComponent(`Apex enquiry - ${selected.name}`);
  const emailBody = encodeURIComponent(
    `Hi Brad,\n\nI'm interested in the ${selected.name} package.\n\nVehicle:\nArea:\nPreferred date:\nNotes:\n`
  );

  return (
    <main className="publicPage showcasePage">
      <Header />

      <section className="hero showcaseHero">
        <div>
          <span className="eyebrow">MOBILE CAR DETAILING · HAWKE'S BAY</span>
          <h1>Real care for real vehicles.</h1>
          <p>
            Apex Detailers delivers premium interior resets, full details and work-vehicle cleans across Napier, Hastings and surrounding
            areas.
          </p>
        </div>
        <aside>
          <b>Showcase live</b>
          <span>Bookings arranged directly</span>
        </aside>
      </section>

      <section className="card showcaseCard">
        <span className="eyebrow">SERVICES</span>
        <h2>Choose the right level of reset.</h2>
        <p>Prices are starting points. Final pricing is confirmed from vehicle size, condition and the work required.</p>

        <div className="services">
          {publicServicePackages.map(item => (
            <button type="button" key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => setSelectedId(item.id)}>
              <div>
                <strong>{item.name}</strong>
                <small>{item.description}</small>
              </div>
              <b>from {money(item.price)}</b>
              <em>allow about {Math.round(item.durationMinutes / 30) / 2} hrs</em>
            </button>
          ))}
        </div>

        <div className="showcaseCta">
          <div>
            <span className="eyebrow">CURRENT BOOKING METHOD</span>
            <h3>Talk directly with Apex.</h3>
            <p>
              Online Calendar sync and automated confirmations are staged for a future cloud upgrade. No paid automation is active in this
              build.
            </p>
          </div>
          <a className="primary showcaseButton" href={`mailto:bookings@apexdetailers.co.nz?subject=${emailSubject}&body=${emailBody}`}>
            Enquire about {selected.name}
          </a>
        </div>
      </section>

      <footer>
        <strong>APEX DETAILERS</strong>
        <span>Napier · Hastings · Hawke's Bay</span>
      </footer>
    </main>
  );
}

function Booking() {
  // booking.html has no service worker (unlike /hq), so nothing here ever picks up a
  // new deploy on its own. A blind auto-reload risks wiping a customer's half-filled
  // form, so this just offers a refresh instead of forcing one.
  const newVersionAvailable = useNewVersionAvailable("/booking");
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState(blank);
  const [step, setStep] = useState(1);
  const [slots, setSlots] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  const update = (key, value) => setForm(old => ({ ...old, [key]: value }));

  const [loadingSeconds, setLoadingSeconds] = useState(0);
  useEffect(() => {
    // getPublicBookingConfig() is written to never reject (it falls back to
    // static service info on any error), which is normally the right call - but
    // it means a genuinely stuck underlying request has nothing to make it
    // settle. Without an outer race, that leaves the splash screen up forever
    // with no error, no retry, and nothing for the customer to act on.
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      setError("This is taking longer than it should. Check your connection and try again.");
    }, 15000);
    const tickId = setInterval(() => setLoadingSeconds(s => s + 1), 1000);
    getPublicBookingConfig()
      .then(result => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        setConfig(result);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        setError("Online booking is unavailable right now. Please contact Apex directly.");
      });
    return () => {
      settled = true;
      clearTimeout(timeoutId);
      clearInterval(tickId);
    };
  }, []);

  const publicServices = useMemo(
    () => (config?.services || []).filter(item => item.publicBookable !== false && item.id !== "maintenance"),
    [config]
  );
  const service = useMemo(() => serviceById(form.serviceId), [form.serviceId]);
  const vehicleTypes = config?.vehicleTypes || [];
  // Always sourced from the server's precomputed grid, never recalculated
  // here - the server's priceFor() (Tradie Reset's cab-only exception in
  // particular) is the only place that logic should live.
  const priceForSelected = config?.pricing?.[form.serviceId]?.[form.vehicleType];
  // Derived from whether the server actually has a price for this
  // combination, not hardcoded to "other" - large/7-seater, American truck
  // and passenger van also have adjustment: null now, and this way the UI
  // automatically stays correct if that list changes again later.
  const needsCustomQuote = priceForSelected == null;

  async function findTimes() {
    if (!form.bookingDate) {
      setError("Choose a date first.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await withTimeout(
        listBookingAvailability({
          date: form.bookingDate,
          serviceId: form.serviceId
        })
      );
      setSlots(result.slots || []);
      if (result.slots?.length) setStep(3);
      else setError("That day is full. Try another date or contact Apex.");
    } catch (err) {
      setError(err.message || "Could not safely check availability.");
    }
    setBusy(false);
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.acceptedTerms) {
      setError("Please accept the booking and pricing conditions first.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      setDone(await withTimeout(submitBookingRequest(form)));
    } catch (err) {
      setError(err.message || "That request could not be sent. Please contact Apex.");
    }
    setBusy(false);
  }

  if (!config && !error) {
    return (
      <main className="splash">
        {newVersionAvailable && <VersionBanner />}
        <Mark />
        <span>Loading Apex bookings…</span>
        <span className="splashHint">{loadingSeconds}s…</span>
      </main>
    );
  }

  if (!config && error) {
    return (
      <main className="splash">
        {newVersionAvailable && <VersionBanner />}
        <Mark />
        <span>{error}</span>
        <div className="splashActions">
          <button type="button" onClick={() => window.location.reload()}>
            Try again
          </button>
          <a href="mailto:bookings@apexdetailers.co.nz">Email Apex directly</a>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="publicPage">
        {newVersionAvailable && <VersionBanner />}
        <Header />
        <section className="success">
          <div className="tick">✓</div>
          <span className="eyebrow">REQUEST RECEIVED</span>
          <h1>Your booking request is in.</h1>
          <p>
            {done.emailSent ? "A confirmation email has been sent. " : ""}
            Brad will review the vehicle details, final price and Calendar booking before confirming it.
          </p>
          <div className="confirm">
            <span>
              <b>{done.serviceName}</b>Service
            </span>
            <span>
              <b>{done.bookingDate}</b>Date
            </span>
            <span>
              <b>{done.bookingTime}</b>Start
            </span>
            <span>
              <b>{done.reference}</b>Reference
            </span>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="publicPage">
      {newVersionAvailable && <VersionBanner />}
      <Header />

      <section className="hero">
        <div>
          <span className="eyebrow">MOBILE CAR DETAILING</span>
          <h1>Book your vehicle in.</h1>
          <p>Choose a public service and an available time. Your request lands inside Apex HQ for final approval.</p>
        </div>
        <aside>
          <b>Napier</b>
          <span>Hastings · Havelock North</span>
        </aside>
      </section>

      <div className="steps">
        {[1, 2, 3, 4].map(number => (
          <i key={number} className={number <= step ? "on" : ""}>
            {number}
          </i>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {step === 1 && (
        <section className="card">
          <span className="eyebrow">01 — SERVICE</span>
          <h2>What does the vehicle need?</h2>
          <div className="services">
            {publicServices.map(item => {
              const price = config?.pricing?.[item.id]?.[form.vehicleType];
              return (
                <button
                  type="button"
                  key={item.id}
                  className={form.serviceId === item.id ? "selected" : ""}
                  onClick={() => update("serviceId", item.id)}
                >
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </div>
                  <b>{price == null ? "POA" : `from ${money(price)}`}</b>
                  <em>about {Math.round(item.durationMinutes / 30) / 2} hrs</em>
                </button>
              );
            })}
          </div>
          <label>
            Vehicle type
            <select value={form.vehicleType} onChange={event => update("vehicleType", event.target.value)}>
              {vehicleTypes.map(vehicle => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.label}
                </option>
              ))}
            </select>
          </label>
          {needsCustomQuote ? (
            <div className="apexVehiclePricingNote apexVehiclePricingNote--quote">
              <strong>This one needs a custom quote.</strong>
              <span>
                Larger and non-standard vehicles vary too much for a fixed price — email Apex with a few details (and photos if you can) for
                an accurate quote.
              </span>
            </div>
          ) : (
            <div className="apexVehiclePricingNote">
              <strong>From {money(priceForSelected)} for this vehicle type</strong>
              <span>Final price may vary depending on vehicle condition and the work required.</span>
            </div>
          )}
          {needsCustomQuote ? (
            <a className="primary" href="mailto:bookings@apexdetailers.co.nz?subject=Custom%20quote%20request">
              Email Apex for a quote
            </a>
          ) : (
            <button className="primary" onClick={() => setStep(2)}>
              Choose a date →
            </button>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="card">
          <button className="back" onClick={() => setStep(1)}>
            ← Back
          </button>
          <span className="eyebrow">02 — DATE</span>
          <h2>When suits you?</h2>
          <BookingCalendar
            serviceId={form.serviceId}
            value={form.bookingDate}
            bookingWindowDays={config?.bookingWindowDays}
            onSelect={date => update("bookingDate", date)}
          />
          <div className="summary">
            <span>{service.name}</span>
            <b>from {money(priceForSelected)}</b>
          </div>
          <button className="primary" onClick={findTimes} disabled={busy || !form.bookingDate}>
            {busy ? "Checking Calendar…" : "Show available times"}
          </button>
        </section>
      )}

      {step === 3 && (
        <section className="card">
          <button className="back" onClick={() => setStep(2)}>
            ← Change date
          </button>
          <span className="eyebrow">03 — TIME</span>
          <h2>Pick an available start.</h2>
          <div className="slotGrid">
            {slots.map(slot => (
              <button
                key={slot.start}
                onClick={() => {
                  update("bookingTime", slot.start);
                  update("bookingEndTime", slot.end);
                  setStep(4);
                }}
              >
                <b>{slot.start}</b>
                <small>Finish about {slot.end}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="card">
          <button className="back" onClick={() => setStep(3)}>
            ← Change time
          </button>
          <span className="eyebrow">04 — DETAILS</span>
          <h2>Tell Apex about the job.</h2>
          <form className="form" onSubmit={submit}>
            <label>
              Full name
              <input required value={form.customerName} onChange={event => update("customerName", event.target.value)} />
            </label>
            <label>
              Mobile
              <input required inputMode="tel" value={form.phone} onChange={event => update("phone", event.target.value)} />
            </label>
            <label>
              Email
              <input required type="email" value={form.email} onChange={event => update("email", event.target.value)} />
            </label>
            <label>
              Area
              <select value={form.area} onChange={event => update("area", event.target.value)}>
                {config?.serviceAreas?.map(area => (
                  <option key={area}>{area}</option>
                ))}
              </select>
            </label>
            <label className="wide">
              Address
              <input required value={form.address} onChange={event => update("address", event.target.value)} />
            </label>
            <label>
              Year
              <input value={form.vehicleYear} onChange={event => update("vehicleYear", event.target.value)} />
            </label>
            <label>
              Make
              <input required value={form.vehicleMake} onChange={event => update("vehicleMake", event.target.value)} />
            </label>
            <label>
              Model
              <input required value={form.vehicleModel} onChange={event => update("vehicleModel", event.target.value)} />
            </label>
            <label>
              Rego
              <input value={form.rego} onChange={event => update("rego", event.target.value.toUpperCase())} />
            </label>
            <label className="wide">
              Notes
              <textarea rows="4" value={form.notes} onChange={event => update("notes", event.target.value)} />
            </label>
            <label className="check wide">
              <input
                required
                type="checkbox"
                checked={form.acceptedTerms}
                onChange={event => update("acceptedTerms", event.target.checked)}
              />
              I understand this is a booking request and advertised prices are “from”.
            </label>
            <input
              className="honeypot"
              tabIndex="-1"
              autoComplete="off"
              value={form.website}
              onChange={event => update("website", event.target.value)}
            />
            <button className="primary wide" disabled={busy}>
              {busy ? "Sending…" : "Request this booking"}
            </button>
          </form>
        </section>
      )}

      <footer>
        <strong>APEX DETAILERS</strong>
        <span>Napier · Hastings · Hawke's Bay</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(apexCloudEnabled ? <Booking /> : <ShowcaseBooking />);
