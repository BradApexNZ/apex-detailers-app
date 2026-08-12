import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { addDoc, arrayUnion, collection, doc, getDocs, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { auth, authPersistenceReady, db, signOutAndClearCache, storage } from "./firebase";
import {
  approveBookingRequest,
  createManualBooking,
  declineBookingRequest,
  dismissGoogleCalendarProspect,
  getCalendarHealth,
  importGoogleCalendarEvents,
  listGoogleCalendars,
  saveGoogleCalendarProspect,
  saveGoogleCalendarSelection,
  scanGoogleCalendarProspects,
  startGoogleCalendarConnect,
  syncJobToCalendar
} from "./apex-api";
import { defaultBookingSettings, formatDate, money, servicePackages, vehicleTypes } from "./booking-data";
import { downloadQuotePdf } from "./quote-pdf";
import {
  disableDeviceLock,
  getPinLength,
  hasBiometricLock,
  hasPinLock,
  isDeviceLockEnabled,
  isSessionUnlocked,
  lockSession,
  markSessionUnlocked,
  registerBiometricLock,
  setPin,
  supportsBiometrics,
  verifyBiometricLock,
  verifyPin
} from "./device-lock";

const ownerUids = (
  import.meta.env.VITE_APEX_OWNER_UIDS || "fnc4G85CtmQVy0OooOzfOoSC9u22,FqDrn1aPFHXUB5ogb2rN9D7mRG42,maefd5cQ9qcIKSeU4b3yZKUL8UW2"
)
  .split(",")
  .map(v => v.trim())
  .filter(Boolean);
const nav = [
  ["dashboard", "Command", "HQ"],
  ["inbox", "Inbox", "IN"],
  ["calendar", "Calendar", "CA"],
  ["jobs", "Jobs", "JB"],
  ["customers", "Customers", "CU"],
  ["quotes", "Quotes", "QT"],
  ["photos", "Photos", "PH"],
  ["vouchers", "Vouchers", "VC"],
  ["settings", "Settings", "ST"]
];
const statusList = [
  "Lead",
  "Quote Requested",
  "Quote Sent",
  "Approved",
  "Booked",
  "Confirmed",
  "In Progress",
  "Completed",
  "Prepare Hnry Invoice",
  "Invoice Sent",
  "Paid",
  "Review Request Sent",
  "Cancelled",
  "Archived"
];
const conditions = ["Light", "Average", "Heavy", "Extreme"];
const addons = [
  { id: "engine", name: "Engine Bay Detail", price: 79 },
  { id: "petHair", name: "Pet Hair Removal", price: 39 },
  { id: "odour", name: "Odour Treatment", price: 49 },
  { id: "sand", name: "Heavy Sand Removal", price: 35 },
  { id: "mud", name: "Excessive Mud Removal", price: 35 },
  { id: "stains", name: "Stain Treatment", price: 25 },
  { id: "childSeat", name: "Child Seat Removal/Reinstall", price: 20 }
];
const photoCategories = [
  ["before", "Before"],
  ["during", "During"],
  ["after", "After"],
  ["damage", "Damage / concern"],
  ["stains", "Stain"],
  ["receipt", "Receipt"]
];
const blankBooking = {
  customerName: "",
  phone: "",
  email: "",
  address: "",
  area: "Napier",
  vehicleYear: "",
  vehicleMake: "",
  vehicleModel: "",
  rego: "",
  vehicleType: "small",
  serviceId: "deep",
  bookingDate: "",
  bookingTime: "08:30",
  notes: "",
  overrideConflict: false
};
const blankCustomer = {
  firstName: "",
  lastName: "",
  businessName: "",
  phone: "",
  email: "",
  address: "",
  area: "Napier",
  preferredContact: "text",
  customerType: "standard",
  notes: ""
};
const blankQuote = {
  customerId: "",
  customerName: "",
  phone: "",
  email: "",
  address: "",
  area: "Napier",
  customerType: "standard",
  status: "Quote Sent",
  vehicleYear: "",
  vehicleMake: "",
  vehicleModel: "",
  rego: "",
  vehicleType: "small",
  packageId: "deep",
  condition: "Average",
  selectedAddons: [],
  manualAdjustment: 0,
  travel: 0,
  manualTotal: "",
  bookingDate: "",
  bookingTime: "",
  paidAmount: "",
  notes: ""
};
const blankVoucher = {
  code: "",
  customerName: "",
  phone: "",
  vehicle: "",
  value: 25,
  expiryDate: "",
  used: false,
  usedDate: "",
  referralCustomer: "",
  referralCreditStatus: "pending",
  notes: ""
};
const clean = v => String(v ?? "").trim();
const normal = v => clean(v).toLowerCase().replace(/\s+/g, " ");
const nameOf = c => c.businessName || [c.firstName, c.lastName].filter(Boolean).join(" ") || c.customerName || "Unnamed";
const customerKey = c => [normal(c.email), normal(c.phone), normal(c.businessName || `${c.firstName || ""} ${c.lastName || ""}`)].join("|");
const vehicleOf = j => j.vehicle || [j.vehicleYear, j.vehicleMake, j.vehicleModel].filter(Boolean).join(" ") || "Vehicle not added";
const packageById = id => servicePackages.find(p => p.id === id) || servicePackages[1];
const safeName = value =>
  String(value || "photo")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-90);
const statusClass = value =>
  String(value || "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .join("-")
    .toLowerCase();
const todayNZ = () => new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
const timeAgo = timestamp => {
  const seconds = timestamp?.seconds || timestamp?._seconds;
  if (!seconds) return "";
  const diffMinutes = Math.max(0, Math.round((Date.now() - seconds * 1000) / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
};

function quoteTotal(form) {
  const base = packageById(form.packageId).price;
  const add = addons.filter(a => (form.selectedAddons || []).includes(a.id)).reduce((sum, a) => sum + a.price, 0);
  let total = base + add + Number(form.manualAdjustment || 0) + Number(form.travel || 0);
  if (form.customerType === "friend") total = Math.round(total * 0.9);
  return form.manualTotal !== "" ? Number(form.manualTotal || 0) : Math.max(0, total);
}

function Brand() {
  return (
    <div className="hqBrand">
      <img src="/apex-logo-official.svg" alt="Apex Detailers" />
      <div>
        <strong>APEX DETAILERS</strong>
        <span>HQ / V6 LAUNCH</span>
      </div>
    </div>
  );
}
function Modal({ title, close, children, wide = false }) {
  return (
    <div className="modalBack" onMouseDown={e => e.target === e.currentTarget && close()}>
      <section className={`modal ${wide ? "modalWide" : ""}`}>
        <header>
          <h2>{title}</h2>
          <button onClick={close}>x</button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Login({ busy, error, onEmail, onGoogle }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  return (
    <main className="loginPage">
      <section>
        <Brand />
        <span className="eyebrow">PRIVATE OPERATIONS</span>
        <h1>The business command centre.</h1>
        <p>Customers, quotes, bookings, Calendar, jobs, photos, Hnry and follow-up in one HQ.</p>
      </section>
      <form
        onSubmit={e => {
          e.preventDefault();
          onEmail(email, password);
        }}
      >
        <h2>Sign in</h2>
        <button type="button" className="google" onClick={onGoogle}>
          Continue with Google
        </button>
        <div className="or">or</div>
        <label>
          Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </label>
        {error && <div className="alert">{error}</div>}
        <button disabled={busy}>{busy ? "Signing in..." : "Enter Apex HQ"}</button>
      </form>
    </main>
  );
}
function PinDots({ length, filled, shake }) {
  return (
    <div className={`pinDots ${shake ? "shake" : ""}`}>
      {Array.from({ length }).map((_, i) => (
        <i key={i} className={i < filled ? "filled" : ""} />
      ))}
    </div>
  );
}

function PinKeypad({ onDigit, onBackspace, disabled }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
  return (
    <div className="pinKeypad">
      {keys.map((k, i) =>
        k === "" ? (
          <span key={i} />
        ) : k === "back" ? (
          <button key={i} type="button" className="pinKey pinKeyBack" onClick={onBackspace} disabled={disabled} aria-label="Delete">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 4H8l-6 8 6 8h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z" strokeLinejoin="round" />
              <path d="M18 9l-6 6M12 9l6 6" strokeLinecap="round" />
            </svg>
          </button>
        ) : (
          <button key={i} type="button" className="pinKey" onClick={() => onDigit(k)} disabled={disabled}>
            {k}
          </button>
        )
      )}
    </div>
  );
}

function Gate({ unlock, logout }) {
  const pinLength = getPinLength();
  const [pin, setPinValue] = useState(""),
    [error, setError] = useState(""),
    [shake, setShake] = useState(false),
    [checking, setChecking] = useState(false);
  async function face() {
    try {
      if (await verifyBiometricLock()) {
        markSessionUnlocked();
        unlock();
      }
    } catch {
      setError("Face ID was cancelled or unavailable. Use your PIN or sign in again.");
    }
  }
  async function attempt(candidate) {
    setChecking(true);
    if (await verifyPin(candidate)) {
      markSessionUnlocked();
      unlock();
      return;
    }
    setError("That PIN is not correct.");
    setShake(true);
    setTimeout(() => {
      setPinValue("");
      setShake(false);
      setChecking(false);
    }, 380);
  }
  function digit(d) {
    if (checking || pin.length >= pinLength) return;
    setError("");
    const next = pin + d;
    setPinValue(next);
    if (next.length === pinLength) attempt(next);
  }
  function backspace() {
    if (!checking) setPinValue(p => p.slice(0, -1));
  }
  return (
    <main className="gate">
      <section>
        <Brand />
        <span className="eyebrow">APEX HQ LOCKED</span>
        <h1>Welcome back.</h1>
        {hasPinLock() && (
          <div className="pinEntry">
            <PinDots length={pinLength} filled={pin.length} shake={shake} />
            <PinKeypad onDigit={digit} onBackspace={backspace} disabled={checking} />
          </div>
        )}
        {hasBiometricLock() && (
          <button className="secondary" onClick={face}>
            Unlock with Face ID
          </button>
        )}
        {error && <div className="alert">{error}</div>}
        <button className="text" onClick={logout}>
          Sign out completely
        </button>
      </section>
    </main>
  );
}

function ManualBooking({ close, save, busy, preset }) {
  const [form, setForm] = useState({ ...blankBooking, ...(preset || {}) }),
    update = (k, v) => setForm(o => ({ ...o, [k]: v }));
  return (
    <Modal title="Add confirmed booking" close={close} wide>
      <form
        className="modalForm"
        onSubmit={e => {
          e.preventDefault();
          save(form);
        }}
      >
        <div className="formGrid">
          <label>
            Customer
            <input required value={form.customerName} onChange={e => update("customerName", e.target.value)} />
          </label>
          <label>
            Mobile
            <input required value={form.phone} onChange={e => update("phone", e.target.value)} />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={e => update("email", e.target.value)} />
          </label>
          <label>
            Area
            <input required value={form.area} onChange={e => update("area", e.target.value)} />
          </label>
          <label className="wide">
            Address
            <input required value={form.address} onChange={e => update("address", e.target.value)} />
          </label>
          <label>
            Year
            <input value={form.vehicleYear} onChange={e => update("vehicleYear", e.target.value)} />
          </label>
          <label>
            Make
            <input required value={form.vehicleMake} onChange={e => update("vehicleMake", e.target.value)} />
          </label>
          <label>
            Model
            <input required value={form.vehicleModel} onChange={e => update("vehicleModel", e.target.value)} />
          </label>
          <label>
            Rego
            <input value={form.rego} onChange={e => update("rego", e.target.value.toUpperCase())} />
          </label>
          <label>
            Vehicle
            <select value={form.vehicleType} onChange={e => update("vehicleType", e.target.value)}>
              {vehicleTypes.map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Service
            <select value={form.serviceId} onChange={e => update("serviceId", e.target.value)}>
              {servicePackages.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} - {money(s.price)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input required type="date" value={form.bookingDate} onChange={e => update("bookingDate", e.target.value)} />
          </label>
          <label>
            Start
            <input required type="time" value={form.bookingTime} onChange={e => update("bookingTime", e.target.value)} />
          </label>
          <label className="check wide">
            <input type="checkbox" checked={form.overrideConflict} onChange={e => update("overrideConflict", e.target.checked)} />
            Override a detected conflict (owner decision)
          </label>
          <label className="wide">
            Notes
            <textarea rows="3" value={form.notes} onChange={e => update("notes", e.target.value)} />
          </label>
        </div>
        <button disabled={busy}>{busy ? "Creating..." : "Create booking + Calendar event"}</button>
      </form>
    </Modal>
  );
}

function CustomerModal({ close, save, busy, preset }) {
  const [form, setForm] = useState({ ...blankCustomer, ...(preset || {}) }),
    update = (k, v) => setForm(o => ({ ...o, [k]: v }));
  return (
    <Modal title="Add customer" close={close}>
      <form
        className="modalForm"
        onSubmit={e => {
          e.preventDefault();
          save(form);
        }}
      >
        <div className="formGrid">
          <label>
            First name
            <input value={form.firstName} onChange={e => update("firstName", e.target.value)} />
          </label>
          <label>
            Last name
            <input value={form.lastName} onChange={e => update("lastName", e.target.value)} />
          </label>
          <label className="wide">
            Business / fleet name
            <input value={form.businessName} onChange={e => update("businessName", e.target.value)} />
          </label>
          <label>
            Mobile
            <input value={form.phone} onChange={e => update("phone", e.target.value)} />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={e => update("email", e.target.value)} />
          </label>
          <label className="wide">
            Address
            <input value={form.address} onChange={e => update("address", e.target.value)} />
          </label>
          <label>
            Area
            <input value={form.area} onChange={e => update("area", e.target.value)} />
          </label>
          <label>
            Customer type
            <select value={form.customerType} onChange={e => update("customerType", e.target.value)}>
              <option value="standard">Standard</option>
              <option value="friend">Friend - 10% off</option>
              <option value="family">Family / manual pricing</option>
              <option value="fleet">Fleet / commercial</option>
            </select>
          </label>
          <label className="wide">
            Notes
            <textarea rows="4" value={form.notes} onChange={e => update("notes", e.target.value)} />
          </label>
        </div>
        <button disabled={busy}>{busy ? "Saving..." : "Save customer"}</button>
      </form>
    </Modal>
  );
}

function PinSetup({ onDone, notify }) {
  const [stage, setStage] = useState("enter"),
    [first, setFirst] = useState(""),
    [pin, setPinValue] = useState(""),
    [shake, setShake] = useState(false),
    [saving, setSaving] = useState(false);
  function digit(d) {
    if (saving || pin.length >= 4) return;
    const next = pin + d;
    setPinValue(next);
    if (next.length < 4) return;
    if (stage === "enter") {
      setFirst(next);
      setTimeout(() => {
        setPinValue("");
        setStage("confirm");
      }, 150);
      return;
    }
    if (next === first) {
      setSaving(true);
      setPin(next)
        .then(() => {
          notify("Backup PIN set.");
          onDone();
        })
        .catch(err => {
          notify(err.message || "Could not set PIN.");
          setPinValue("");
          setStage("enter");
          setFirst("");
          setSaving(false);
        });
      return;
    }
    setShake(true);
    setTimeout(() => {
      setPinValue("");
      setShake(false);
      setStage("enter");
      setFirst("");
      notify("PINs didn't match - try again.");
    }, 380);
  }
  function backspace() {
    if (!saving) setPinValue(p => p.slice(0, -1));
  }
  return (
    <div className="pinEntry">
      <p className="muted">{stage === "enter" ? "Choose a 4-digit PIN." : "Confirm your PIN."}</p>
      <PinDots length={4} filled={pin.length} shake={shake} />
      <PinKeypad onDigit={digit} onBackspace={backspace} disabled={saving} />
    </div>
  );
}

function QuoteModal({ close, save, busy, customers, mode = "quote" }) {
  const [form, setForm] = useState(() => ({ ...blankQuote, status: mode === "job" ? "Booked" : "Quote Sent" })),
    update = (k, v) => setForm(o => ({ ...o, [k]: v }));
  function pick(id) {
    const c = customers.find(x => x.id === id);
    setForm(o => ({
      ...o,
      customerId: id,
      customerName: c ? nameOf(c) : "",
      phone: c?.phone || "",
      email: c?.email || "",
      address: c?.address || "",
      area: c?.area || "Napier",
      customerType: c?.customerType || "standard"
    }));
  }
  const total = quoteTotal(form);
  return (
    <Modal title={mode === "job" ? "Add job" : "Create quote"} close={close} wide>
      <form
        className="modalForm"
        onSubmit={e => {
          e.preventDefault();
          save({ ...form, total, entryMode: mode });
        }}
      >
        <div className="formGrid">
          <label className="wide">
            Existing customer
            <select value={form.customerId} onChange={e => pick(e.target.value)}>
              <option value="">New / not selected</option>
              {customers.map(c => (
                <option value={c.id} key={c.id}>
                  {nameOf(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Customer
            <input required value={form.customerName} onChange={e => update("customerName", e.target.value)} />
          </label>
          <label>
            Mobile
            <input value={form.phone} onChange={e => update("phone", e.target.value)} />
          </label>
          <label>
            Email
            <input value={form.email} onChange={e => update("email", e.target.value)} />
          </label>
          <label>
            Customer type
            <select value={form.customerType} onChange={e => update("customerType", e.target.value)}>
              <option value="standard">Standard</option>
              <option value="friend">Friend - 10%</option>
              <option value="family">Family / manual price</option>
              <option value="fleet">Fleet / commercial</option>
            </select>
          </label>
          <label>
            {mode === "job" ? "Job status" : "Quote status"}
            <select value={form.status} onChange={e => update("status", e.target.value)}>
              {mode === "job"
                ? statusList.map(s => <option key={s}>{s}</option>)
                : ["Lead", "Quote Requested", "Quote Sent", "Approved"].map(s => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>
            Year
            <input value={form.vehicleYear} onChange={e => update("vehicleYear", e.target.value)} />
          </label>
          <label>
            Make
            <input required value={form.vehicleMake} onChange={e => update("vehicleMake", e.target.value)} />
          </label>
          <label>
            Model
            <input required value={form.vehicleModel} onChange={e => update("vehicleModel", e.target.value)} />
          </label>
          <label>
            Rego
            <input value={form.rego} onChange={e => update("rego", e.target.value.toUpperCase())} />
          </label>
          <label>
            Vehicle
            <select value={form.vehicleType} onChange={e => update("vehicleType", e.target.value)}>
              {vehicleTypes.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Condition
            <select value={form.condition} onChange={e => update("condition", e.target.value)}>
              {conditions.map(x => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Package
            <select value={form.packageId} onChange={e => update("packageId", e.target.value)}>
              {servicePackages.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} - {money(p.price)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Manual adjustment
            <input type="number" value={form.manualAdjustment} onChange={e => update("manualAdjustment", e.target.value)} />
          </label>
          <label>
            Travel
            <input type="number" value={form.travel} onChange={e => update("travel", e.target.value)} />
          </label>
          <label>
            Manual total (optional)
            <input type="number" value={form.manualTotal} onChange={e => update("manualTotal", e.target.value)} />
          </label>
          <label>
            {mode === "job" ? "Job date" : "Proposed date"}
            <input type="date" value={form.bookingDate} onChange={e => update("bookingDate", e.target.value)} />
          </label>
          <label>
            {mode === "job" ? "Job time" : "Proposed time"}
            <input type="time" value={form.bookingTime} onChange={e => update("bookingTime", e.target.value)} />
          </label>
          {mode === "job" && (
            <label>
              Paid amount (optional)
              <input type="number" value={form.paidAmount} onChange={e => update("paidAmount", e.target.value)} />
            </label>
          )}
          <fieldset className="wide addonGrid">
            <legend>Add-ons</legend>
            {addons.map(a => (
              <label className="check" key={a.id}>
                <input
                  type="checkbox"
                  checked={form.selectedAddons.includes(a.id)}
                  onChange={e =>
                    update(
                      "selectedAddons",
                      e.target.checked ? [...form.selectedAddons, a.id] : form.selectedAddons.filter(x => x !== a.id)
                    )
                  }
                />
                {a.name} ({money(a.price)})
              </label>
            ))}
          </fieldset>
          <label className="wide">
            Notes
            <textarea rows="3" value={form.notes} onChange={e => update("notes", e.target.value)} />
          </label>
        </div>
        <div className="quoteTotal">
          <span>{mode === "job" ? "Total" : "Quote total"}</span>
          <b>{money(total)}</b>
        </div>
        <button disabled={busy}>{busy ? "Saving..." : mode === "job" ? "Save job" : "Save quote"}</button>
      </form>
    </Modal>
  );
}

function VoucherModal({ close, save, busy }) {
  const [form, setForm] = useState(blankVoucher),
    update = (k, v) => setForm(o => ({ ...o, [k]: v }));
  return (
    <Modal title="Add voucher / referral" close={close}>
      <form
        className="modalForm"
        onSubmit={e => {
          e.preventDefault();
          save(form);
        }}
      >
        <div className="formGrid">
          <label>
            Code
            <input required value={form.code} onChange={e => update("code", e.target.value.toUpperCase())} />
          </label>
          <label>
            Value
            <input type="number" value={form.value} onChange={e => update("value", Number(e.target.value))} />
          </label>
          <label>
            Customer
            <input value={form.customerName} onChange={e => update("customerName", e.target.value)} />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={e => update("phone", e.target.value)} />
          </label>
          <label className="wide">
            Vehicle
            <input value={form.vehicle} onChange={e => update("vehicle", e.target.value)} />
          </label>
          <label>
            Expiry
            <input type="date" value={form.expiryDate} onChange={e => update("expiryDate", e.target.value)} />
          </label>
          <label>
            Referral customer
            <input value={form.referralCustomer} onChange={e => update("referralCustomer", e.target.value)} />
          </label>
          <label>
            Referral credit
            <select value={form.referralCreditStatus} onChange={e => update("referralCreditStatus", e.target.value)}>
              <option value="pending">Pending</option>
              <option value="earned">Earned</option>
              <option value="used">Used</option>
            </select>
          </label>
          <label className="wide">
            Notes
            <textarea rows="3" value={form.notes} onChange={e => update("notes", e.target.value)} />
          </label>
        </div>
        <button disabled={busy}>Save voucher</button>
      </form>
    </Modal>
  );
}

function JobModal({ job, close, save, upload, busy, notify }) {
  const [form, setForm] = useState({
      ...job,
      paidAmount: job.paidAmount || "",
      invoiceNumber: job.invoiceNumber || "",
      followUpDueDate: job.followUpDueDate || "",
      maintenanceDueDate: job.maintenanceDueDate || "",
      notes: job.notes || ""
    }),
    [category, setCategory] = useState("before");
  const update = (k, v) => setForm(o => ({ ...o, [k]: v }));
  const review = `Thanks again for choosing Apex Detailers, ${job.customerName}. If you're happy with the result, a Google review would mean a lot and helps a local business grow.`;
  return (
    <Modal title={`${job.customerName} - ${vehicleOf(job)}`} close={close} wide>
      <div className="jobDetail">
        <div className="formGrid">
          <label>
            Status
            <select value={form.status || "Booked"} onChange={e => update("status", e.target.value)}>
              {statusList.map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Invoice #<input value={form.invoiceNumber} onChange={e => update("invoiceNumber", e.target.value)} />
          </label>
          <label>
            Paid amount
            <input type="number" value={form.paidAmount} onChange={e => update("paidAmount", e.target.value)} />
          </label>
          <label>
            Total
            <input type="number" value={form.total || 0} onChange={e => update("total", Number(e.target.value))} />
          </label>
          <label>
            Booking date
            <input type="date" value={form.bookingDate || ""} onChange={e => update("bookingDate", e.target.value)} />
          </label>
          <label>
            Booking time
            <input type="time" value={form.bookingTime || ""} onChange={e => update("bookingTime", e.target.value)} />
          </label>
          <label>
            Follow-up due
            <input type="date" value={form.followUpDueDate} onChange={e => update("followUpDueDate", e.target.value)} />
          </label>
          <label>
            Maintenance due
            <input type="date" value={form.maintenanceDueDate} onChange={e => update("maintenanceDueDate", e.target.value)} />
          </label>
          <label className="wide">
            Notes
            <textarea rows="4" value={form.notes} onChange={e => update("notes", e.target.value)} />
          </label>
        </div>
        <div className="detailActions">
          <button onClick={() => save(form)} disabled={busy}>
            Save job
          </button>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await syncJobToCalendar({ jobId: job.id });
                notify("Calendar event synced.");
              } catch (e) {
                notify(e.message || "Calendar sync failed.");
              }
            }}
          >
            Sync Calendar
          </button>
          <button className="secondary" onClick={() => navigator.clipboard.writeText(review).then(() => notify("Review request copied."))}>
            Copy review request
          </button>
        </div>
        <section className="photoUploader">
          <h3>Job photos</h3>
          <div className="photoUploadRow">
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {photoCategories.map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
            <label className="importButton">
              Upload photos
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={e => {
                  const files = [...(e.target.files || [])];
                  if (files.length) upload(job, files, category);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="photoGrid">
            {(job.photos || []).map((p, i) => (
              <a href={p.url} target="_blank" rel="noreferrer" key={`${p.url}-${i}`}>
                <img src={p.url} alt={`${p.category || "job"} ${i + 1}`} />
                <span>{p.category || "photo"}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}

function CalendarSettings({ notify }) {
  const [state, setState] = useState({
      connected: false,
      healthy: false,
      email: "",
      calendars: [],
      selectedCalendarIds: [],
      primaryCalendarId: ""
    }),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const [list, health] = await Promise.all([listGoogleCalendars(), getCalendarHealth()]);
      setState({ ...list, healthy: health.healthy, error: health.error || "" });
    } catch (e) {
      setState(o => ({ ...o, error: e.message || "Calendar check failed" }));
    }
    setBusy(false);
  }
  useEffect(() => {
    load();
  }, []);
  async function connect() {
    try {
      const r = await startGoogleCalendarConnect();
      window.location.assign(r.url);
    } catch (e) {
      notify(e.message || "Could not connect Google Calendar.");
    }
  }
  async function save() {
    setBusy(true);
    try {
      await saveGoogleCalendarSelection({ selectedCalendarIds: state.selectedCalendarIds, primaryCalendarId: state.primaryCalendarId });
      notify("Calendar selection saved.");
      await load();
    } catch (e) {
      notify(e.message || "Could not save calendar selection.");
    }
    setBusy(false);
  }
  async function sync() {
    setBusy(true);
    try {
      const r = await importGoogleCalendarEvents({ daysBack: 30, daysForward: 365 });
      notify(`Google sync: ${r.imported || 0} added, ${r.updated || 0} updated.`);
    } catch (e) {
      notify(e.message || "Google import failed.");
    }
    setBusy(false);
  }
  return (
    <section className="calendarSettings">
      <div className={`integration ${state.connected && state.healthy ? "connected" : ""}`}>
        <b>
          {state.connected
            ? state.healthy
              ? "Google Calendar healthy"
              : "Google connected - setup needs attention"
            : "Google Calendar not connected"}
        </b>
        <span>{state.email || state.error || "Connect the Google account used for Apex."}</span>
      </div>
      <div className="detailActions">
        <button onClick={connect}>{state.connected ? "Reconnect Google" : "Connect Google"}</button>
        <button className="secondary" onClick={load} disabled={busy}>
          Refresh health
        </button>
      </div>
      {state.connected && (
        <>
          <p className="muted">
            Selected calendars block clashes and import into Apex. The primary calendar must be writable and receives new Apex bookings.
          </p>
          <div className="calendarChoice">
            {(state.calendars || []).map(c => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={state.selectedCalendarIds.includes(c.id)}
                  onChange={e =>
                    setState(o => ({
                      ...o,
                      selectedCalendarIds: e.target.checked
                        ? [...o.selectedCalendarIds, c.id]
                        : o.selectedCalendarIds.filter(x => x !== c.id)
                    }))
                  }
                />
                <span>
                  <b>{c.name}</b>
                  <small>
                    {c.accessRole}
                    {c.writable ? " - writable" : " - read only"}
                  </small>
                </span>
                <input
                  type="radio"
                  name="primaryCalendar"
                  disabled={!c.writable || !state.selectedCalendarIds.includes(c.id)}
                  checked={state.primaryCalendarId === c.id}
                  onChange={() => setState(o => ({ ...o, primaryCalendarId: c.id }))}
                />
              </label>
            ))}
          </div>
          <div className="detailActions">
            <button onClick={save} disabled={busy}>
              Save Calendar setup
            </button>
            <button className="secondary" onClick={sync} disabled={busy}>
              Import Google events now
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function CalendarProspects({ prospects, scanned, busy, onScan, onAdd, onConvert, onDismiss }) {
  return (
    <section className="calendarProspects">
      <p className="muted">
        Scans your connected Google Calendar for events that don't look like existing Apex customers or jobs — new enquiries booked straight
        into Calendar, walk-ins, anything that hasn't made it into Apex yet.
      </p>
      <div className="detailActions">
        <button onClick={onScan} disabled={busy}>
          {busy ? "Scanning..." : scanned ? "Rescan Calendar" : "Scan Calendar for new customers"}
        </button>
      </div>
      {scanned && !prospects.length && <Empty text="No new prospects found." />}
      {Boolean(prospects.length) && (
        <div className="cards">
          {prospects.map(p => (
            <article className="request" key={p.eventId}>
              <header>
                <div>
                  <h3>{p.name}</h3>
                  <span>{p.email || p.phone || "No contact info on the event"}</span>
                </div>
                <b>{new Date(p.eventStart).toLocaleDateString("en-NZ", { day: "numeric", month: "short" })}</b>
              </header>
              <p>
                {p.eventTitle} · {p.calendarName}
                {p.rego ? ` · ${p.rego}` : ""}
              </p>
              {p.address && <p>{p.address}</p>}
              {p.existingCustomerId && <p className="muted">Might already be an existing customer: {p.existingCustomerName}</p>}
              <footer>
                <button onClick={() => onAdd(p)} disabled={busy}>
                  Add as customer
                </button>
                <button className="secondary" onClick={() => onConvert(p)} disabled={busy}>
                  Also create booking
                </button>
                <button className="danger" onClick={() => onDismiss(p)} disabled={busy}>
                  Dismiss
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ProspectsWidget({ prospects, busy, onAdd, onDismiss, openTab }) {
  if (!prospects.length) return null;
  return (
    <section className="panel prospectsWidget">
      <div className="panel-head">
        <h3>New from Calendar</h3>
        <span className="muted">{prospects.length} waiting</span>
      </div>
      {prospects.slice(0, 4).map(p => (
        <div className="prospectRow" key={p.eventId}>
          <div className="prospectAvatar">{(p.name || "?").slice(0, 1).toUpperCase()}</div>
          <div className="prospectInfo">
            <b className="pii">{p.name}</b>
            <span className="pii">
              {p.eventTitle} - {new Date(p.eventStart).toLocaleDateString("en-NZ", { day: "numeric", month: "short" })}
              {p.rego ? ` - ${p.rego}` : ""}
            </span>
          </div>
          <div className="prospectActions">
            <button className="btnMini primary" onClick={() => onAdd(p)} disabled={busy}>
              Add
            </button>
            <button className="btnMini" onClick={() => onDismiss(p)} disabled={busy}>
              Skip
            </button>
          </div>
        </div>
      ))}
      {prospects.length > 4 && (
        <button className="text" onClick={() => openTab("calendar")}>
          +{prospects.length - 4} more in Calendar
        </button>
      )}
    </section>
  );
}

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length < 2) return [];
  const split = line => {
    const out = [];
    let cur = "",
      quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const headers = split(lines[0]).map(h => normal(h).replace(/[^a-z0-9]/g, ""));
  return lines.slice(1).map(line => Object.fromEntries(headers.map((h, i) => [h, split(line)[i] || ""])));
}
function mapCustomer(raw) {
  const full = clean(raw.name || raw.fullname || raw.customername);
  const parts = full.split(/\s+/).filter(Boolean);
  return {
    firstName: clean(raw.firstName || raw.firstname || (parts.length ? parts[0] : "")),
    lastName: clean(raw.lastName || raw.lastname || (parts.length > 1 ? parts.slice(1).join(" ") : "")),
    businessName: clean(raw.businessName || raw.businessname || raw.company),
    phone: clean(raw.phone || raw.mobile || raw.telephone),
    email: clean(raw.email).toLowerCase(),
    address: clean(raw.address || raw.street),
    area: clean(raw.area || raw.suburb || raw.city) || "Napier",
    preferredContact: clean(raw.preferredContact || raw.preferredcontact) || "text",
    customerType: clean(raw.customerType || raw.customertype) || "standard",
    notes: clean(raw.notes || raw.note)
  };
}

function App() {
  const [user, setUser] = useState(null),
    [ready, setReady] = useState(false),
    [authBusy, setAuthBusy] = useState(false),
    [authError, setAuthError] = useState(""),
    [unlocked, setUnlocked] = useState(!isDeviceLockEnabled() || isSessionUnlocked()),
    [tab, setTab] = useState("dashboard"),
    [customers, setCustomers] = useState([]),
    [jobs, setJobs] = useState([]),
    [requests, setRequests] = useState([]),
    [inquiries, setInquiries] = useState([]),
    [vouchers, setVouchers] = useState([]),
    [settings, setSettings] = useState(defaultBookingSettings),
    [manual, setManual] = useState(false),
    [manualPreset, setManualPreset] = useState(null),
    [customerModal, setCustomerModal] = useState(false),
    [selectedCustomer, setSelectedCustomer] = useState(null),
    [mobileMenu, setMobileMenu] = useState(false),
    [quoteModal, setQuoteModal] = useState(false),
    [jobModal, setJobModal] = useState(false),
    [voucherModal, setVoucherModal] = useState(false),
    [selectedJob, setSelectedJob] = useState(null),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [dataError, setDataError] = useState("");
  const [prospects, setProspects] = useState([]),
    [prospectsScanned, setProspectsScanned] = useState(false),
    [prospectsBusy, setProspectsBusy] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(() => localStorage.getItem("apexPrivacyMode") === "1");
  const togglePrivacy = () =>
    setPrivacyMode(value => {
      const next = !value;
      localStorage.setItem("apexPrivacyMode", next ? "1" : "0");
      return next;
    });
  const owner = Boolean(user && ownerUids.includes(user.uid));
  useEffect(
    () =>
      onAuthStateChanged(auth, next => {
        if (next && !ownerUids.includes(next.uid)) {
          signOut(auth);
          setAuthError("That account is not authorised for Apex HQ.");
          setUser(null);
        } else setUser(next);
        setUnlocked(Boolean(next) && (!isDeviceLockEnabled() || isSessionUnlocked()));
        setReady(true);
      }),
    []
  );
  useEffect(() => {
    if (!owner) return;
    setDataError("");
    const fail = label => err => {
      console.error(`Apex HQ ${label} listener failed`, err);
      setDataError(`Live ${label} data could not be loaded. Check your connection and refresh Apex HQ.`);
    };
    const stops = [
      onSnapshot(collection(db, "customers"), s => setCustomers(s.docs.map(d => ({ id: d.id, ...d.data() }))), fail("customer")),
      onSnapshot(collection(db, "jobs"), s => setJobs(s.docs.map(d => ({ id: d.id, ...d.data() }))), fail("job")),
      onSnapshot(
        collection(db, "bookingRequests"),
        s => setRequests(s.docs.map(d => ({ id: d.id, ...d.data() }))),
        fail("booking request")
      ),
      onSnapshot(collection(db, "inquiries"), s => setInquiries(s.docs.map(d => ({ id: d.id, ...d.data() }))), fail("inbox")),
      onSnapshot(collection(db, "vouchers"), s => setVouchers(s.docs.map(d => ({ id: d.id, ...d.data() }))), fail("voucher")),
      onSnapshot(
        doc(db, "settings", "booking"),
        s => s.exists() && setSettings({ ...defaultBookingSettings, ...s.data() }),
        fail("booking settings")
      )
    ];
    return () => stops.forEach(stop => stop());
  }, [owner]);
  useEffect(() => {
    if (!selectedJob) return;
    const fresh = jobs.find(j => j.id === selectedJob.id);
    if (fresh && fresh !== selectedJob) setSelectedJob(fresh);
  }, [jobs, selectedJob]);
  useEffect(() => {
    if (!owner) return;
    scanProspects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);
  async function scanProspects() {
    setProspectsBusy(true);
    try {
      const result = await scanGoogleCalendarProspects({ days: 120 });
      setProspects(result.suggestions || []);
      setProspectsScanned(true);
    } catch {
      // Silent on the automatic once-per-login scan - Calendar tab's manual
      // rescan button surfaces real errors if the owner explicitly retries.
    }
    setProspectsBusy(false);
  }
  async function addProspectAsCustomer(p) {
    setProspectsBusy(true);
    try {
      await saveGoogleCalendarProspect({
        name: p.name,
        email: p.email,
        phone: p.phone,
        address: p.address,
        notes: p.notes,
        eventId: p.eventId,
        calendarId: p.calendarId,
        eventTitle: p.eventTitle
      });
      setProspects(list => list.filter(x => x.eventId !== p.eventId));
      notify(`${p.name} added as a customer.`);
    } catch (err) {
      notify(err.message || "Could not add customer.");
    }
    setProspectsBusy(false);
  }
  async function dismissProspect(p) {
    setProspectsBusy(true);
    try {
      await dismissGoogleCalendarProspect({ eventId: p.eventId });
      setProspects(list => list.filter(x => x.eventId !== p.eventId));
    } catch (err) {
      notify(err.message || "Could not dismiss.");
    }
    setProspectsBusy(false);
  }
  function convertProspectToBooking(p) {
    const start = new Date(p.eventStart);
    const valid = !Number.isNaN(start.getTime());
    setManualPreset({
      customerName: p.name,
      phone: p.phone,
      email: p.email,
      address: p.address,
      rego: p.rego || "",
      notes: p.notes ? `${p.notes}\n\nFrom Calendar: ${p.eventTitle}` : `From Calendar: ${p.eventTitle}`,
      bookingDate: valid ? start.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" }) : "",
      bookingTime: valid ? start.toLocaleTimeString("en-GB", { timeZone: "Pacific/Auckland", hour: "2-digit", minute: "2-digit" }) : "08:30"
    });
    setManual(true);
  }
  const notify = message => {
    setToast(message);
    setTimeout(() => setToast(""), 4000);
  };
  async function emailLogin(email, password) {
    setAuthBusy(true);
    setAuthError("");
    try {
      await authPersistenceReady;
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setAuthError("Login failed. Check your email and password.");
    }
    setAuthBusy(false);
  }
  async function googleLogin() {
    setAuthBusy(true);
    setAuthError("");
    try {
      await authPersistenceReady;
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setAuthError(
        err.code === "auth/operation-not-allowed"
          ? "Google login is not enabled in Firebase Authentication yet."
          : err.message || "Google sign-in failed."
      );
    }
    setAuthBusy(false);
  }
  async function logout() {
    lockSession();
    await signOutAndClearCache();
  }
  async function approve(item) {
    setBusy(true);
    try {
      await approveBookingRequest({ requestId: item.id });
      notify("Booking confirmed. Calendar and email workflow completed.");
    } catch (err) {
      notify(err.message || "Could not approve booking.");
    }
    setBusy(false);
  }
  async function decline(item) {
    if (!confirm(`Decline ${item.customerName}'s request?`)) return;
    setBusy(true);
    try {
      await declineBookingRequest({ requestId: item.id });
      notify("Request declined and hold released.");
    } catch (err) {
      notify(err.message || "Could not decline request.");
    }
    setBusy(false);
  }
  async function saveManual(form) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await createManualBooking(form);
      setManual(false);
      setManualPreset(null);
      setTab("calendar");
      notify(
        result?.calendarError
          ? "Booking saved. Calendar sync needs a retry."
          : form.sourceQuoteId
            ? "Quote converted to booking and Calendar synced."
            : "Booking created and Calendar synced."
      );
    } catch (err) {
      notify(err.message || "Could not create booking.");
    } finally {
      setBusy(false);
    }
  }
  async function saveCustomer(form) {
    if (!clean(form.firstName) && !clean(form.lastName) && !clean(form.businessName)) return notify("Add a customer or business name.");
    setBusy(true);
    try {
      const { id, ...data } = form,
        payload = { ...data, email: clean(data.email).toLowerCase(), ownerUid: user.uid, updatedAt: serverTimestamp() };
      if (id) await setDoc(doc(db, "customers", id), payload, { merge: true });
      else await addDoc(collection(db, "customers"), { ...payload, createdAt: serverTimestamp() });
      setCustomerModal(false);
      setSelectedCustomer(null);
      setTab("customers");
      notify(id ? "Customer updated." : "Customer added.");
    } catch (err) {
      notify(err.message || "Could not save customer.");
    }
    setBusy(false);
  }
  async function saveQuote(form) {
    setBusy(true);
    try {
      const isJob = form.entryMode === "job";
      const p = packageById(form.packageId),
        vehicle = [form.vehicleYear, form.vehicleMake, form.vehicleModel].filter(Boolean).join(" ");
      const addonRows = addons.filter(a => form.selectedAddons.includes(a.id));
      const { entryMode, ...rest } = form;
      const ref = await addDoc(collection(db, "jobs"), {
        ...rest,
        vehicle,
        packageName: p.name,
        total: Number(form.total),
        paidAmount: Number(form.paidAmount || 0),
        addonNames: addonRows.map(a => a.name),
        status: form.status || (isJob ? "Booked" : "Quote Sent"),
        mode: isJob ? "job" : "quote",
        source: isJob ? "hq-manual-job" : "hq-v6",
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      if (isJob) {
        setJobModal(false);
        setTab("jobs");
        notify("Job saved.");
      } else {
        const message = `Hi ${form.customerName}, thanks for getting in touch with Apex Detailers. Your quote for the ${vehicle || "vehicle"} is ${money(form.total)} for ${p.name}${addonRows.length ? ` plus ${addonRows.map(a => a.name).join(", ")}` : ""}. Final pricing may vary if the vehicle is heavily soiled or larger than expected. Access to an outside tap is required.`;
        await navigator.clipboard?.writeText(message).catch(() => {});
        setQuoteModal(false);
        setTab("quotes");
        notify(`Quote saved${ref.id ? " and message copied" : ""}.`);
      }
    } catch (err) {
      notify(err.message || "Could not save.");
    }
    setBusy(false);
  }
  async function saveVoucher(form) {
    setBusy(true);
    try {
      await addDoc(collection(db, "vouchers"), { ...form, ownerUid: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setVoucherModal(false);
      notify("Voucher saved.");
    } catch (err) {
      notify(err.message || "Could not save voucher.");
    }
    setBusy(false);
  }
  async function saveJob(form) {
    if (busy) return;
    const total = Number(form.total || 0),
      paidAmount = Number(form.paidAmount || 0);
    if (!Number.isFinite(total) || total < 0) return notify("Job total must be zero or more.");
    if (!Number.isFinite(paidAmount) || paidAmount < 0) return notify("Paid amount must be zero or more.");
    if (form.status === "Paid" && paidAmount <= 0) return notify("Enter the paid amount before marking this job Paid.");
    setBusy(true);
    try {
      const original = jobs.find(j => j.id === form.id),
        payload = {
          status: form.status,
          total,
          paidAmount,
          invoiceNumber: clean(form.invoiceNumber),
          bookingDate: form.bookingDate || "",
          bookingTime: form.bookingTime || "",
          bookingEndTime: form.bookingEndTime || "",
          followUpDueDate: form.followUpDueDate || "",
          maintenanceDueDate: form.maintenanceDueDate || "",
          notes: form.notes || "",
          updatedAt: serverTimestamp()
        };
      if (original?.status !== form.status) payload.statusHistory = arrayUnion({ status: form.status, at: new Date().toISOString() });
      await setDoc(doc(db, "jobs", form.id), payload, { merge: true });
      if (form.bookingDate && form.bookingTime && !["Lead", "Quote Requested", "Quote Sent", "Approved"].includes(form.status)) {
        try {
          await syncJobToCalendar({ jobId: form.id });
          notify("Job updated and Calendar synced.");
        } catch (err) {
          console.error("Calendar sync after job save failed", err);
          notify("Job saved, but Calendar sync failed. Open Calendar and retry sync.");
        }
      } else notify("Job updated.");
    } catch (err) {
      notify(err.message || "Could not update job.");
    } finally {
      setBusy(false);
    }
  }
  async function uploadPhotos(job, files, category) {
    setBusy(true);
    try {
      const uploaded = [];
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is over the 10 MB photo limit.`);
        const path = `jobs/${job.id}/${Date.now()}-${safeName(file.name)}`;
        const snap = await uploadBytes(ref(storage, path), file, { contentType: file.type });
        const url = await getDownloadURL(snap.ref);
        uploaded.push({ url, path, category, name: file.name, uploadedAt: new Date().toISOString() });
      }
      await setDoc(
        doc(db, "jobs", job.id),
        { photos: [...(job.photos || []), ...uploaded], updatedAt: serverTimestamp() },
        { merge: true }
      );
      notify(`${uploaded.length} photo${uploaded.length === 1 ? "" : "s"} uploaded.`);
    } catch (err) {
      notify(err.message || "Photo upload failed.");
    }
    setBusy(false);
  }
  async function importCustomers(file) {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      let rows;
      if (file.name.toLowerCase().endsWith(".csv")) rows = parseCsv(text);
      else {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : parsed.customers || parsed.collections?.customers || [];
      }
      if (!Array.isArray(rows) || !rows.length) throw new Error("No customer rows found.");
      const existing = await getDocs(collection(db, "customers"));
      const keys = new Set(existing.docs.map(d => customerKey(d.data())));
      let added = 0,
        skipped = 0;
      for (const raw of rows) {
        const row = mapCustomer(raw);
        if (!row.firstName && !row.lastName && !row.businessName) {
          skipped++;
          continue;
        }
        const key = customerKey(row);
        if (keys.has(key)) {
          skipped++;
          continue;
        }
        await addDoc(collection(db, "customers"), {
          ...row,
          ownerUid: user.uid,
          importedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        keys.add(key);
        added++;
      }
      notify(`${added} customers imported, ${skipped} skipped.`);
    } catch (err) {
      notify(err.message || "Customer import failed.");
    }
    setBusy(false);
  }
  const today = todayNZ(),
    pending = requests.filter(r => r.status === "pending"),
    newInquiries = inquiries.filter(i => i.status === "new"),
    upcoming = jobs
      .filter(j => j.bookingDate >= today && !["Archived", "Cancelled"].includes(j.status) && j.status !== "Quote Sent")
      .sort((a, b) => `${a.bookingDate}${a.bookingTime}`.localeCompare(`${b.bookingDate}${b.bookingTime}`)),
    quotes = jobs.filter(j => ["Lead", "Quote Requested", "Quote Sent", "Approved"].includes(j.status)),
    followups = jobs.filter(
      j =>
        j.status === "Paid" || (j.followUpDueDate && j.followUpDueDate <= today) || (j.maintenanceDueDate && j.maintenanceDueDate <= today)
    ),
    completed = jobs.filter(j => ["Completed", "Prepare Hnry Invoice", "Invoice Sent", "Paid", "Review Request Sent"].includes(j.status));
  const month = today.slice(0, 7),
    monthRevenue = jobs
      .filter(j => ["Paid", "Review Request Sent"].includes(j.status) && String(j.bookingDate || j.serviceDate || "").startsWith(month))
      .reduce((sum, j) => sum + Number(j.paidAmount || j.total || 0), 0);
  const revenueTrend = useMemo(() => {
    const paidJobs = jobs.filter(j => ["Paid", "Review Request Sent"].includes(j.status));
    const points = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(`${today}T00:00:00`);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
      const total = paidJobs
        .filter(j => (j.bookingDate || j.serviceDate) === key)
        .reduce((sum, j) => sum + Number(j.paidAmount || j.total || 0), 0);
      points.push(total);
    }
    return points;
  }, [jobs, today]);
  const allPhotos = useMemo(
    () => jobs.flatMap(j => (j.photos || []).map(p => ({ ...p, jobId: j.id, customerName: j.customerName, vehicle: vehicleOf(j) }))),
    [jobs]
  );
  if (!ready)
    return (
      <main className="boot">
        <Brand />
        Loading...
      </main>
    );
  if (!owner) return <Login busy={authBusy} error={authError} onEmail={emailLogin} onGoogle={googleLogin} />;
  if (isDeviceLockEnabled() && !unlocked) return <Gate unlock={() => setUnlocked(true)} logout={logout} />;
  return (
    <div className={`shell ${mobileMenu ? "show-mobile-menu" : ""} ${privacyMode ? "privacyOn" : ""}`}>
      <aside>
        <Brand />
        <nav>
          {nav.map(([id, label, icon]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setMobileMenu(false);
              }}
            >
              <i>{icon}</i>
              {label}
              {id === "inbox" && pending.length + newInquiries.length > 0 && <em>{pending.length + newInquiries.length}</em>}
              {id === "dashboard" && prospects.length > 0 && <em>{prospects.length}</em>}
            </button>
          ))}
        </nav>
        <button className="v6MobileClose" onClick={() => setMobileMenu(false)}>
          Close menu
        </button>
        <footer>
          <button className={`privacyToggle ${privacyMode ? "on" : ""}`} onClick={togglePrivacy}>
            {privacyMode ? "Privacy mode: on" : "Privacy mode: off"}
          </button>
          <button
            onClick={() => {
              lockSession();
              setUnlocked(false);
            }}
          >
            Lock HQ
          </button>
          <button onClick={logout}>Sign out</button>
        </footer>
      </aside>
      <div className="workspace">
        <header className="top">
          <div>
            <span className="eyebrow">
              APEX HQ V6 - {new Date().toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" }).toUpperCase()}
            </span>
            <h1>{nav.find(n => n[0] === tab)?.[1]}</h1>
          </div>
          <div className="topActions">
            <button className={`secondaryTop privacyToggle ${privacyMode ? "on" : ""}`} onClick={togglePrivacy}>
              {privacyMode ? "Privacy: on" : "Privacy: off"}
            </button>
            <button className="secondaryTop" onClick={() => setQuoteModal(true)}>
              + Quote
            </button>
            <button className="secondaryTop" onClick={() => setCustomerModal(true)}>
              + Customer
            </button>
            <button onClick={() => setManual(true)}>+ Booking</button>
          </div>
        </header>
        <main>
          {dataError && (
            <div className="alert" role="alert">
              {dataError}
            </div>
          )}
          {tab === "dashboard" && (
            <>
              <section className="command">
                <div>
                  <span className="eyebrow">TODAY'S COMMAND DECK</span>
                  <h2>
                    {upcoming.filter(j => j.bookingDate === today).length
                      ? `${upcoming.filter(j => j.bookingDate === today).length} vehicle${upcoming.filter(j => j.bookingDate === today).length === 1 ? "" : "s"} on today.`
                      : "The day is clear."}
                  </h2>
                  <p>
                    {pending.length} booking request{pending.length === 1 ? "" : "s"}, {quotes.length} active quote
                    {quotes.length === 1 ? "" : "s"}, and {followups.length} review follow-up{followups.length === 1 ? "" : "s"} waiting.
                  </p>
                  <div className="heroActions">
                    <button onClick={() => setManual(true)}>+ Add booking</button>
                    <button className="secondaryTop" onClick={() => setQuoteModal(true)}>
                      + Create quote
                    </button>
                  </div>
                </div>
                <article>
                  <span className="eyebrow">NEXT UP</span>
                  {upcoming[0] ? (
                    <>
                      <b>
                        {formatDate(upcoming[0].bookingDate)} - {upcoming[0].bookingTime}
                      </b>
                      <h3 className="pii">{upcoming[0].customerName}</h3>
                      <p className="pii">{vehicleOf(upcoming[0])}</p>
                    </>
                  ) : (
                    <h3>No upcoming booking.</h3>
                  )}
                </article>
              </section>
              <section className="stats">
                <Stat label="Today's jobs" value={upcoming.filter(j => j.bookingDate === today).length} />
                <Stat label="Pending requests" value={pending.length} />
                <Stat label="Active quotes" value={quotes.length} />
                <Stat label="This month paid" value={money(monthRevenue)} sensitive />
                <Stat label="Completed" value={completed.length} />
                <Stat label="Follow-ups" value={followups.length} />
              </section>
              <div className="dashboardGrid">
                <Panel title="Coming up">
                  {upcoming.slice(0, 6).map(j => (
                    <Agenda key={j.id} job={j} open={() => setSelectedJob(j)} />
                  ))}
                  {!upcoming.length && <Empty text="No upcoming bookings." />}
                </Panel>
                <div className="dashboardCol">
                  <section className="panel">
                    <RevenueChart points={revenueTrend} total={monthRevenue} />
                  </section>
                  <ProspectsWidget
                    prospects={prospects}
                    busy={prospectsBusy}
                    onAdd={addProspectAsCustomer}
                    onDismiss={dismissProspect}
                    openTab={setTab}
                  />
                </div>
              </div>
            </>
          )}
          {tab === "inbox" && (
            <>
              <div className="sectionLead">
                <Intro
                  title="Inbox"
                  text={
                    pending.length || newInquiries.length
                      ? `${pending.length} booking request${pending.length === 1 ? "" : "s"} and ${newInquiries.length} inquir${newInquiries.length === 1 ? "y" : "ies"} waiting.`
                      : "Booking requests and enquiries arrive here."
                  }
                />
              </div>
              <div className="cards">
                {[...pending]
                  .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
                  .map(r => (
                    <article className="request" key={r.id}>
                      <header>
                        <div>
                          <h3 className="pii">{r.customerName}</h3>
                          <span className="pii">
                            {r.email} - {r.phone}
                          </span>
                        </div>
                        <b>
                          {formatDate(r.bookingDate)}
                          <small>{r.bookingTime}</small>
                        </b>
                      </header>
                      <p className="pii">
                        {r.vehicle || [r.vehicleYear, r.vehicleMake, r.vehicleModel].filter(Boolean).join(" ")} - {r.serviceName}
                      </p>
                      <p className="pii">
                        {r.address}, {r.area}
                      </p>
                      {r.notes && <blockquote>{r.notes}</blockquote>}
                      <footer>
                        <button onClick={() => approve(r)} disabled={busy}>
                          Confirm
                        </button>
                        <button className="danger" onClick={() => decline(r)} disabled={busy}>
                          Decline
                        </button>
                        {timeAgo(r.createdAt) && <em className="waitBadge">waiting {timeAgo(r.createdAt)}</em>}
                      </footer>
                    </article>
                  ))}
                {newInquiries.map(i => (
                  <article className="request inquiry" key={i.id}>
                    <header>
                      <div>
                        <h3 className="pii">{i.name}</h3>
                        <span className="pii">
                          {i.email} - {i.phone}
                        </span>
                      </div>
                      <b>INQUIRY</b>
                    </header>
                    <blockquote>{i.message}</blockquote>
                    <footer>
                      <button
                        disabled={busy}
                        onClick={async () => {
                          if (busy) return;
                          setBusy(true);
                          try {
                            await setDoc(doc(db, "inquiries", i.id), { status: "resolved", updatedAt: serverTimestamp() }, { merge: true });
                            notify("Inquiry marked resolved.");
                          } catch (err) {
                            notify(err.message || "Could not resolve inquiry.");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Mark resolved
                      </button>
                      {timeAgo(i.createdAt) && <em className="waitBadge">waiting {timeAgo(i.createdAt)}</em>}
                    </footer>
                  </article>
                ))}
              </div>
              {!pending.length && !newInquiries.length && <Empty text="Nothing waiting in the inbox." />}
            </>
          )}
          {tab === "calendar" && (
            <>
              <Intro title="Schedule" text="Confirmed jobs with exact Google sync status." />
              <div className="calendar">
                {upcoming.map(j => (
                  <Agenda
                    key={j.id}
                    job={j}
                    open={() => setSelectedJob(j)}
                    sync={async () => {
                      try {
                        await syncJobToCalendar({ jobId: j.id });
                        notify("Calendar event synced.");
                      } catch (e) {
                        notify(e.message || "Calendar sync failed.");
                      }
                    }}
                  />
                ))}
              </div>
              {!upcoming.length && <Empty text="No upcoming bookings." />}
              <CalendarProspects
                prospects={prospects}
                scanned={prospectsScanned}
                busy={prospectsBusy}
                onScan={scanProspects}
                onAdd={addProspectAsCustomer}
                onConvert={convertProspectToBooking}
                onDismiss={dismissProspect}
              />
            </>
          )}
          {tab === "jobs" && (
            <>
              <div className="sectionLead">
                <Intro title="Jobs" text="Operational job pipeline, Hnry handoff, payment and review status." />
                <button onClick={() => setJobModal(true)}>+ Add job</button>
              </div>
              <div className="table">
                {[...jobs]
                  .filter(j => !["Lead", "Quote Requested", "Quote Sent"].includes(j.status))
                  .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                  .map(j => (
                    <div className="job" key={j.id} onClick={() => setSelectedJob(j)}>
                      <i>JB</i>
                      <div>
                        <b className="pii">{j.customerName}</b>
                        <span className="pii">{vehicleOf(j)}</span>
                      </div>
                      <div>
                        <b>{j.packageName}</b>
                        <span>{j.bookingDate ? `${formatDate(j.bookingDate)} - ${j.bookingTime || ""}` : "No booking date"}</span>
                      </div>
                      <strong className="pii">{money(j.total)}</strong>
                      <span className={`statusPill status-${statusClass(j.status)}`}>{j.status || "Booked"}</span>
                    </div>
                  ))}
              </div>
              {!jobs.length && <Empty text="No jobs saved yet." />}
            </>
          )}
          {tab === "customers" && (
            <>
              <div className="sectionLead">
                <Intro
                  title="Customers"
                  text="Contact details, fleet context, vehicles and repeat-work history. Tap a customer card to edit it."
                />
                <div className="customerActions">
                  <button onClick={() => setCustomerModal(true)}>+ Add customer</button>
                  <label className="importButton">
                    Import JSON or CSV
                    <input
                      type="file"
                      accept=".json,.csv,application/json,text/csv"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) importCustomers(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
              <div className="customerGrid">
                {customers.map(c => {
                  const history = jobs.filter(j => j.customerId === c.id),
                    vehicles = [...new Set(history.map(vehicleOf).filter(v => v !== "Vehicle not added"))];
                  return (
                    <article key={c.id} onClick={() => setSelectedCustomer(c)} style={{ cursor: "pointer" }}>
                      <header>
                        <i>{nameOf(c).slice(0, 1)}</i>
                        <div>
                          <h3 className="pii">{nameOf(c)}</h3>
                          <span className="pii">
                            {c.phone || "No phone"}
                            {c.email ? ` - ${c.email}` : ""}
                          </span>
                        </div>
                      </header>
                      <p className="pii">{c.address || c.area || "No address saved"}</p>
                      <p className="pii">{vehicles.slice(0, 3).join(" / ") || c.lastVehicle || "No vehicle saved"}</p>
                      <footer>
                        <b>{history.length} jobs</b>
                        <b className="pii">
                          {money(
                            history
                              .filter(j => ["Paid", "Review Request Sent"].includes(j.status))
                              .reduce((sum, j) => sum + Number(j.paidAmount || j.total || 0), 0)
                          )}
                        </b>
                      </footer>
                    </article>
                  );
                })}
              </div>
              {!customers.length && <Empty text="Add your first customer manually or import a JSON/CSV file." />}
            </>
          )}
          {tab === "quotes" && (
            <>
              <div className="sectionLead">
                <Intro title="Quotes" text="Create, price and convert quote work into booked jobs." />
                <button onClick={() => setQuoteModal(true)}>+ Create quote</button>
              </div>
              <div className="cards">
                {quotes
                  .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                  .map(q => (
                    <article className="request quoteCard" key={q.id}>
                      <header>
                        <div>
                          <h3 className="pii">{q.customerName}</h3>
                          <span className="pii">
                            {vehicleOf(q)} - {q.condition || "Average"}
                          </span>
                        </div>
                        <b className="pii">
                          {money(q.total)}
                          <small>{q.status}</small>
                        </b>
                      </header>
                      <p>
                        {q.packageName}
                        {q.addonNames?.length ? ` + ${q.addonNames.join(", ")}` : ""}
                      </p>
                      {q.notes && <blockquote>{q.notes}</blockquote>}
                      <footer>
                        <button
                          onClick={() => {
                            setManualPreset({
                              ...q,
                              sourceQuoteId: q.id,
                              sourceCustomerId: q.customerId || "",
                              serviceId: q.packageId,
                              quotedTotal: Number(q.total || 0),
                              customerName: q.customerName,
                              vehicleMake: q.vehicleMake,
                              vehicleModel: q.vehicleModel,
                              bookingDate: q.bookingDate || "",
                              bookingTime: q.bookingTime || "08:30"
                            });
                            setManual(true);
                          }}
                        >
                          Convert to booking
                        </button>
                        <button className="secondary" onClick={() => downloadQuotePdf(q)}>
                          Download PDF
                        </button>
                        <button className="secondary" onClick={() => setSelectedJob(q)}>
                          Open
                        </button>
                      </footer>
                    </article>
                  ))}
              </div>
              {!quotes.length && <Empty text="No active quotes." />}
            </>
          )}
          {tab === "photos" && (
            <>
              <Intro title="Photos" text="Before, during, after and concern photos tied to the correct job." />
              <div className="photoLibrary">
                {allPhotos.map((p, i) => (
                  <a key={`${p.url}-${i}`} href={p.url} target="_blank" rel="noreferrer" className="pii">
                    <img src={p.url} alt={`${p.customerName} ${p.category || "photo"}`} />
                    <div>
                      <b>{p.customerName}</b>
                      <span>{p.vehicle}</span>
                      <small>{p.category || "photo"}</small>
                    </div>
                  </a>
                ))}
              </div>
              {!allPhotos.length && <Empty text="Open a job and upload its first photos." />}
            </>
          )}
          {tab === "vouchers" && (
            <>
              <div className="sectionLead">
                <Intro title="Vouchers & referrals" text="Track return vouchers and referral credits through to use." />
                <button onClick={() => setVoucherModal(true)}>+ Voucher</button>
              </div>
              <div className="voucherGrid">
                {vouchers.map(v => (
                  <article key={v.id}>
                    <header>
                      <b>{v.code}</b>
                      <span>{money(v.value)}</span>
                    </header>
                    <h3 className="pii">{v.customerName || "Unassigned"}</h3>
                    <p className="pii">{v.vehicle || v.phone || ""}</p>
                    <p>Expiry: {v.expiryDate || "Not set"}</p>
                    <footer>
                      <label className="check">
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={Boolean(v.used)}
                          onChange={async e => {
                            if (busy) return;
                            const used = e.target.checked;
                            setBusy(true);
                            try {
                              await setDoc(
                                doc(db, "vouchers", v.id),
                                { used, usedDate: used ? today : "", updatedAt: serverTimestamp() },
                                { merge: true }
                              );
                              notify(used ? "Voucher marked used." : "Voucher marked unused.");
                            } catch (err) {
                              notify(err.message || "Could not update voucher.");
                            } finally {
                              setBusy(false);
                            }
                          }}
                        />
                        Used
                      </label>
                      <span>{v.referralCreditStatus || "pending"}</span>
                    </footer>
                  </article>
                ))}
              </div>
              {!vouchers.length && <Empty text="No vouchers or referrals recorded." />}
            </>
          )}
          {tab === "settings" && <Settings user={user} settings={settings} setSettings={setSettings} notify={notify} />}
        </main>
      </div>
      <nav className="mobile">
        {nav.slice(0, 6).map(([id, label, icon]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setMobileMenu(false);
            }}
          >
            <i>{icon}</i>
            <small>{label}</small>
          </button>
        ))}
        <button className={mobileMenu ? "active" : ""} onClick={() => setMobileMenu(true)}>
          <i>•••</i>
          <small>More</small>
        </button>
      </nav>
      {manual && (
        <ManualBooking
          close={() => {
            setManual(false);
            setManualPreset(null);
          }}
          save={saveManual}
          busy={busy}
          preset={manualPreset}
        />
      )}{" "}
      {customerModal && <CustomerModal close={() => setCustomerModal(false)} save={saveCustomer} busy={busy} />}{" "}
      {selectedCustomer && (
        <CustomerModal preset={selectedCustomer} close={() => setSelectedCustomer(null)} save={saveCustomer} busy={busy} />
      )}{" "}
      {quoteModal && <QuoteModal close={() => setQuoteModal(false)} save={saveQuote} busy={busy} customers={customers} />}{" "}
      {jobModal && <QuoteModal mode="job" close={() => setJobModal(false)} save={saveQuote} busy={busy} customers={customers} />}{" "}
      {voucherModal && <VoucherModal close={() => setVoucherModal(false)} save={saveVoucher} busy={busy} />}{" "}
      {selectedJob && (
        <JobModal job={selectedJob} close={() => setSelectedJob(null)} save={saveJob} upload={uploadPhotos} busy={busy} notify={notify} />
      )}{" "}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
function Stat({ label, value, sensitive }) {
  return (
    <article className={sensitive ? "pii" : ""}>
      <span>{label}</span>
      <b>{value}</b>
    </article>
  );
}
function RevenueChart({ points, total }) {
  const w = 400,
    h = 120,
    pad = 8;
  const max = Math.max(1, ...points);
  const stepX = points.length > 1 ? w / (points.length - 1) : w;
  const coords = points.map((v, i) => [i * stepX, h - pad - (v / max) * (h - pad * 2)]);
  const hasActivity = points.some(v => v > 0);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const last = coords[coords.length - 1];
  return (
    <div className="revenueChart">
      <div className="revenueChartHead">
        <div>
          <b className="pii">{money(total)}</b>
          <span>Revenue - last 30 days</span>
        </div>
      </div>
      {hasActivity ? (
        <svg className="revenueChartSvg pii" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" y1={h * 0.25} x2={w} y2={h * 0.25} className="chartGrid" />
          <line x1="0" y1={h * 0.5} x2={w} y2={h * 0.5} className="chartGrid" />
          <line x1="0" y1={h * 0.75} x2={w} y2={h * 0.75} className="chartGrid" />
          <path d={area} fill="url(#revenueFill)" />
          <polyline
            points={coords.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="none"
            stroke="var(--gold)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {last && <circle cx={last[0]} cy={last[1]} r="4.5" fill="var(--gold)" />}
        </svg>
      ) : (
        <div className="revenueChartEmpty muted">No paid jobs in the last 30 days yet.</div>
      )}
    </div>
  );
}
function Intro({ title, text }) {
  return (
    <header className="intro">
      <span className="eyebrow">APEX OPERATIONS</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </header>
  );
}
function Panel({ title, children }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
function Agenda({ job, sync, open }) {
  return (
    <div className="agenda">
      <time>
        <b>{new Date(`${job.bookingDate}T00:00:00`).getDate()}</b>
        <span>{new Date(`${job.bookingDate}T00:00:00`).toLocaleDateString("en-NZ", { month: "short" })}</span>
      </time>
      <div onClick={open}>
        <b className="pii">{job.customerName}</b>
        <span className="pii">
          {vehicleOf(job)} - {job.packageName}
        </span>
        <small>{job.calendarSyncStatus || "calendar status unknown"}</small>
      </div>
      <em>{job.bookingTime}</em>
      {sync && <button onClick={sync}>Sync</button>}
    </div>
  );
}
function Empty({ text }) {
  return (
    <div className="empty">
      <b>-</b>
      <p>{text}</p>
    </div>
  );
}
function Settings({ user, settings, setSettings, notify }) {
  const [settingPin, setSettingPin] = useState(false),
    [saving, setSaving] = useState(false);
  async function save() {
    const notice = Number(settings.minimumNoticeHours),
      windowDays = Number(settings.bookingWindowDays);
    if (!Number.isFinite(notice) || notice < 0 || notice > 720) return notify("Minimum notice must be between 0 and 720 hours.");
    if (!Number.isFinite(windowDays) || windowDays < 1 || windowDays > 730) return notify("Booking window must be between 1 and 730 days.");
    setSaving(true);
    try {
      await setDoc(
        doc(db, "settings", "booking"),
        { ...settings, minimumNoticeHours: notice, bookingWindowDays: windowDays },
        { merge: true }
      );
      notify("Booking settings saved.");
    } catch (err) {
      notify(err.message || "Could not save booking settings.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Intro title="Settings" text="Security, backup tools, public booking and Google integration." />
      <div className="settings">
        <section>
          <h3>Face ID unlock</h3>
          <p className="muted">Use device biometrics plus a backup PIN for quick private HQ access.</p>
          {supportsBiometrics() && (
            <button
              onClick={async () => {
                try {
                  await registerBiometricLock(user);
                  notify("Face ID unlock enabled on this device.");
                } catch (err) {
                  notify(err.message || "Face ID setup failed.");
                }
              }}
            >
              {hasBiometricLock() ? "Set up Face ID again" : "Enable Face ID unlock"}
            </button>
          )}
          {settingPin ? (
            <PinSetup onDone={() => setSettingPin(false)} notify={notify} />
          ) : (
            <button className="secondary" onClick={() => setSettingPin(true)}>
              {hasPinLock() ? "Change backup PIN" : "Set backup PIN"}
            </button>
          )}
          <button
            className="danger"
            onClick={() => {
              if (!confirm("Remove the device lock from this device? Apex HQ will open without Face ID or PIN until you enable it again."))
                return;
              disableDeviceLock();
              notify("Device lock removed.");
            }}
          >
            Remove device lock
          </button>
        </section>
        <section>
          <h3>Data & backup</h3>
          <p className="muted">Full backups and customer imports live in the owner data tools.</p>
          <a className="settingsLink" href="/tools">
            Open backup & import tools
          </a>
        </section>
        <section>
          <h3>Online booking</h3>
          <label className="check">
            <input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} />
            Public booking page enabled
          </label>
          <label>
            Minimum notice
            <input
              type="number"
              value={settings.minimumNoticeHours}
              onChange={e => setSettings({ ...settings, minimumNoticeHours: Number(e.target.value) })}
            />
          </label>
          <label>
            Booking window (days)
            <input
              type="number"
              value={settings.bookingWindowDays}
              onChange={e => setSettings({ ...settings, bookingWindowDays: Number(e.target.value) })}
            />
          </label>
          <button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save booking settings"}
          </button>
        </section>
        <CalendarSettings notify={notify} />
      </div>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
