import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  apexCloudEnabled,
  getPublicBookingConfig,
  lastConfigError,
  listBookingAvailability,
  submitBookingRequest
} from "./apex-api-public";
import { money, publicServicePackages, serviceById } from "./booking-data";
import { useNewVersionAvailable } from "./use-new-version-available";

// If React itself crashes or hangs, everything below - state, effects, the
// 15s timeout guard - stops running with it, so nothing built on React state
// can ever report that failure. This writes straight to the DOM the instant
// anything goes globally wrong, bypassing React entirely, so a crash is
// always visible instead of just leaving the splash screen sitting there.
if (typeof window !== "undefined") {
  const showCrash = (label, detail) => {
    if (document.getElementById("apexCrashNotice")) return;
    const box = document.createElement("div");
    box.id = "apexCrashNotice";
    box.style.cssText =
      "position:fixed;inset:auto 12px 12px 12px;z-index:99999;background:#1a0a0a;color:#fca5a5;border:1px solid #7f1d1d;border-radius:10px;padding:14px;font:12px/1.5 -apple-system,system-ui,sans-serif;max-height:60vh;overflow:auto;";
    box.innerHTML =
      `<strong style="color:#fecaca;">Something crashed (${label})</strong><pre style="white-space:pre-wrap;word-break:break-word;margin:8px 0 0;">${String(detail).slice(0, 800)}</pre>` +
      `<button type="button" id="apexCrashCopy" style="margin-top:10px;width:100%;padding:10px;border:none;border-radius:8px;background:#fca5a5;color:#1a0a0a;font-weight:600;">Copy this and send to Brad</button>`;
    document.body.appendChild(box);
    document.getElementById("apexCrashCopy").addEventListener("click", () => {
      const text = `${label}\n${detail}\n${navigator.userAgent}\n${window.location.href}\n${new Date().toISOString()}`;
      navigator.clipboard.writeText(text).then(
        () => alert("Copied - paste it to Brad."),
        () => alert(text)
      );
    });
  };
  window.addEventListener("error", event => showCrash("script error", event.error?.stack || event.message));
  window.addEventListener("unhandledrejection", event => showCrash("unhandled promise rejection", event.reason?.stack || event.reason));
}

const today = () =>
  new Date().toLocaleDateString("en-CA", {
    timeZone: "Pacific/Auckland"
  });

// A stalled network call otherwise leaves a button stuck on "Checking..." /
// "Sending..." forever with no error and no way out - this guarantees every
// booking-flow action either succeeds or fails visibly within 15s.
const withTimeout = (promise, ms = 15000) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out. Please try again.")), ms))]);

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
  const [debugInfo, setDebugInfo] = useState(null);
  useEffect(() => {
    // getPublicBookingConfig() is written to never reject (it falls back to
    // static service info on any error), which is normally the right call - but
    // it means a genuinely stuck underlying request has nothing to make it
    // settle. Without an outer race, that leaves the splash screen up forever
    // with no error, no retry, and nothing for the customer (or Brad) to act on.
    let settled = false;
    const startedAt = Date.now();
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      setError("This is taking longer than it should. Check your connection and try again.");
      setDebugInfo({
        cause: "client-timeout-15s",
        underlyingError: lastConfigError,
        elapsedMs: Date.now() - startedAt,
        url: window.location.href,
        userAgent: navigator.userAgent,
        at: new Date().toISOString()
      });
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
        setDebugInfo({
          cause: "promise-rejected",
          underlyingError: lastConfigError,
          elapsedMs: Date.now() - startedAt,
          url: window.location.href,
          userAgent: navigator.userAgent,
          at: new Date().toISOString()
        });
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
        {debugInfo && (
          <button
            type="button"
            className="splashDebugCopy"
            onClick={() => {
              navigator.clipboard
                .writeText(JSON.stringify(debugInfo, null, 2))
                .then(() => alert("Debug info copied - paste it to Brad."))
                .catch(() => alert(JSON.stringify(debugInfo)));
            }}
          >
            Copy debug info
          </button>
        )}
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
            {publicServices.map(item => (
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
                <b>from {money(item.price)}</b>
                <em>about {Math.round(item.durationMinutes / 30) / 2} hrs</em>
              </button>
            ))}
          </div>
          <label>
            Vehicle type
            <select value={form.vehicleType} onChange={event => update("vehicleType", event.target.value)}>
              <option value="small">Sedan / hatch</option>
              <option value="suv">SUV / wagon</option>
              <option value="singlecab">Single-cab ute</option>
              <option value="doublecab">Double-cab ute</option>
              <option value="large">7-seater / large SUV</option>
              <option value="van">Van / oversized</option>
            </select>
          </label>
          <button className="primary" onClick={() => setStep(2)}>
            Choose a date →
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="card">
          <button className="back" onClick={() => setStep(1)}>
            ← Back
          </button>
          <span className="eyebrow">02 — DATE</span>
          <h2>When suits you?</h2>
          <label>
            Preferred date
            <input type="date" min={today()} value={form.bookingDate} onChange={event => update("bookingDate", event.target.value)} />
          </label>
          <div className="summary">
            <span>{service.name}</span>
            <b>from {money(service.price)}</b>
          </div>
          <button className="primary" onClick={findTimes} disabled={busy}>
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
