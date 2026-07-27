import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "./firebase";
import {
  APEX_OWNER_UID,
  defaultBookingSettings,
  formatDate,
  formatLongDate,
  money,
  packageById,
  servicePackages,
  slotKey,
  vehicleTypes
} from "./booking-data";
import {
  disableDeviceLock,
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
import "./hq-v5.css";

const NAV = [
  ["dashboard", "Command", "⌂"],
  ["requests", "Requests", "↧"],
  ["calendar", "Calendar", "◷"],
  ["jobs", "Jobs", "◆"],
  ["customers", "Customers", "◎"],
  ["settings", "Settings", "⚙"]
];

const JOB_STATUSES = [
  "Lead", "Quote Requested", "Quote Sent", "Approved", "Booked", "Confirmed",
  "In Progress", "Completed", "Prepare Hnry Invoice", "Invoice Sent", "Paid",
  "Review Request Sent", "Archived"
];

const blankBooking = {
  customerId: "", customerName: "", phone: "", email: "", address: "", area: "",
  vehicleYear: "", vehicleMake: "", vehicleModel: "", rego: "", vehicleType: "small",
  packageId: "deep", bookingDate: "", bookingTime: "08:30", notes: ""
};

function Brand({ small = false }) {
  return <div className={`brand ${small ? "small" : ""}`}><i /><div><strong>APEX DETAILERS</strong><span>HQ / V5</span></div></div>;
}

function Login({ busy, error, login }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return <main className="authLayout">
    <section className="authStory"><Brand /><div><p className="eyebrow">PRIVATE OPERATIONS</p><h1>Your detailing business, under control.</h1><p>Bookings, customer history, jobs and revenue in one sharp mobile command centre.</p></div></section>
    <form className="authCard" onSubmit={event => { event.preventDefault(); login(email, password); }}>
      <span className="lockGlyph">⌾</span><h2>Sign in</h2><p>Use the Firebase account linked to Apex HQ.</p>
      <label>Email<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
      {error && <div className="alert error">{error}</div>}
      <button disabled={busy}>{busy ? "Signing in…" : "Enter Apex HQ"}</button>
    </form>
  </main>;
}

function DeviceGate({ user, unlock, logout }) {
  const [pin, setPinValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function biometric() {
    setBusy(true); setError("");
    try { if (await verifyBiometricLock()) unlock(); }
    catch (err) { setError(err?.name === "NotAllowedError" ? "Biometric unlock was cancelled." : "Biometric unlock failed. Use your PIN or sign in again."); }
    setBusy(false);
  }
  async function pinUnlock(event) {
    event.preventDefault(); setBusy(true); setError("");
    if (await verifyPin(pin)) unlock(); else setError("That PIN is not correct.");
    setBusy(false);
  }
  return <main className="gatePage"><section className="gateCard"><Brand /><span className="lockGlyph">⌾</span><p className="eyebrow">DEVICE LOCKED</p><h1>Welcome back, Brad.</h1><p>Your Firebase session is still signed in. Unlock this device to open Apex HQ.</p>
    {hasBiometricLock() && <button onClick={biometric} disabled={busy}>Use Face ID / fingerprint</button>}
    {hasPinLock() && <form className="pinForm" onSubmit={pinUnlock}><input type="password" inputMode="numeric" maxLength="6" value={pin} onChange={event => setPinValue(event.target.value.replace(/\D/g, ""))} placeholder="Device PIN" /><button className="secondary" disabled={busy || pin.length < 4}>Unlock with PIN</button></form>}
    {error && <div className="alert error">{error}</div>}
    <button className="textButton" onClick={logout}>Sign out of {user.email}</button>
  </section></main>;
}

function Modal({ title, close, children }) {
  return <div className="modalBackdrop" onMouseDown={event => event.target === event.currentTarget && close()}><section className="modal"><header><div><p className="eyebrow">APEX HQ</p><h2>{title}</h2></div><button className="iconButton" onClick={close}>×</button></header>{children}</section></div>;
}

function ManualBooking({ customers, close, save, busy }) {
  const [form, setForm] = useState(blankBooking);
  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  function chooseCustomer(id) {
    const customer = customers.find(item => item.id === id);
    if (!customer) return update("customerId", id);
    setForm(previous => ({ ...previous, customerId: id, customerName: nameOf(customer), phone: customer.phone || "", email: customer.email || "", address: customer.address || "", area: customer.area || "" }));
  }
  return <Modal title="Add a confirmed booking" close={close}><form className="modalForm" onSubmit={event => { event.preventDefault(); save(form); }}>
    <div className="formGrid two">
      <label>Existing customer<select value={form.customerId} onChange={event => chooseCustomer(event.target.value)}><option value="">New / manual customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{nameOf(customer)}</option>)}</select></label>
      <label>Customer name<input value={form.customerName} onChange={event => update("customerName", event.target.value)} required /></label>
      <label>Mobile<input type="tel" value={form.phone} onChange={event => update("phone", event.target.value)} required /></label>
      <label>Email<input type="email" value={form.email} onChange={event => update("email", event.target.value)} /></label>
      <label>Address<input value={form.address} onChange={event => update("address", event.target.value)} required /></label>
      <label>Area<input value={form.area} onChange={event => update("area", event.target.value)} required /></label>
      <label>Year<input inputMode="numeric" value={form.vehicleYear} onChange={event => update("vehicleYear", event.target.value)} /></label>
      <label>Make<input value={form.vehicleMake} onChange={event => update("vehicleMake", event.target.value)} required /></label>
      <label>Model<input value={form.vehicleModel} onChange={event => update("vehicleModel", event.target.value)} required /></label>
      <label>Rego<input value={form.rego} onChange={event => update("rego", event.target.value.toUpperCase())} /></label>
      <label>Vehicle type<select value={form.vehicleType} onChange={event => update("vehicleType", event.target.value)}>{vehicleTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Service<select value={form.packageId} onChange={event => update("packageId", event.target.value)}>{servicePackages.map(item => <option key={item.id} value={item.id}>{item.name} — from {money(item.price)}</option>)}</select></label>
      <label>Date<input type="date" value={form.bookingDate} onChange={event => update("bookingDate", event.target.value)} required /></label>
      <label>Start time<input type="time" value={form.bookingTime} onChange={event => update("bookingTime", event.target.value)} required /></label>
    </div>
    <label>Notes<textarea rows="4" value={form.notes} onChange={event => update("notes", event.target.value)} /></label>
    <div className="summaryLine"><span>Starting estimate</span><strong>{money(packageById(form.packageId).price)}</strong></div>
    <button disabled={busy}>{busy ? "Saving booking…" : "Create confirmed booking"}</button>
  </form></Modal>;
}

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [unlocked, setUnlocked] = useState(!isDeviceLockEnabled() || isSessionUnlocked());
  const [tab, setTab] = useState("dashboard");
  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [requests, setRequests] = useState([]);
  const [slots, setSlots] = useState([]);
  const [settings, setSettings] = useState(defaultBookingSettings);
  const [search, setSearch] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const isOwner = authUser?.uid === APEX_OWNER_UID;

  useEffect(() => onAuthStateChanged(auth, user => {
    if (user && user.uid !== APEX_OWNER_UID) {
      signOut(auth); setAuthUser(null); setAuthError("This Firebase account is not authorised for Apex HQ.");
    } else {
      setAuthUser(user);
      setUnlocked(Boolean(user) && (!isDeviceLockEnabled() || isSessionUnlocked()));
    }
    setAuthReady(true);
  }), []);

  useEffect(() => {
    if (!isOwner) return undefined;
    const stops = [
      onSnapshot(collection(db, "customers"), snap => setCustomers(snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => nameOf(a).localeCompare(nameOf(b))))),
      onSnapshot(collection(db, "jobs"), snap => setJobs(snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => stamp(b.createdAt) - stamp(a.createdAt)))),
      onSnapshot(collection(db, "bookingRequests"), snap => setRequests(snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => stamp(b.createdAt) - stamp(a.createdAt)))),
      onSnapshot(collection(db, "bookingSlots"), snap => setSlots(snap.docs.map(item => ({ id: item.id, ...item.data() })))),
      onSnapshot(doc(db, "publicSettings", "booking"), snap => snap.exists() && setSettings({ ...defaultBookingSettings, ...snap.data() }))
    ];
    return () => stops.forEach(stop => stop());
  }, [isOwner]);

  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(""), 3500); return () => clearTimeout(timer); }, [toast]);
  const notify = message => setToast(message);

  async function login(email, password) {
    setAuthBusy(true); setAuthError("");
    try { await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch { setAuthError("Login failed. Check the Firebase email and password."); }
    setAuthBusy(false);
  }

  async function logout() {
    lockSession(); await signOut(auth); setCustomers([]); setJobs([]); setRequests([]); setSlots([]); setUnlocked(false); setTab("dashboard");
  }

  async function approve(request) {
    setBusy(true);
    try {
      const existing = customers.find(customer => (request.email && customer.email?.toLowerCase() === request.email.toLowerCase()) || (request.phone && phoneKey(customer.phone) === phoneKey(request.phone)));
      const batch = writeBatch(db);
      const customerRef = existing ? doc(db, "customers", existing.id) : doc(collection(db, "customers"));
      const jobRef = doc(collection(db, "jobs"));
      const vehicle = [request.vehicleYear, request.vehicleMake, request.vehicleModel].filter(Boolean).join(" ");
      if (existing) batch.update(customerRef, { phone: request.phone || existing.phone || "", email: request.email || existing.email || "", address: request.address || existing.address || "", area: request.area || existing.area || "", lastVehicle: vehicle, lastJobStatus: "Booked", updatedAt: serverTimestamp() });
      else {
        const names = splitName(request.customerName);
        batch.set(customerRef, { firstName: request.firstName || names.firstName, lastName: request.lastName || names.lastName, businessName: "", customerName: request.customerName, phone: request.phone || "", email: request.email || "", address: request.address || "", area: request.area || "", preferredContact: request.email ? "email" : "text", customerType: "standard", notes: "Created from online booking request.", lastVehicle: vehicle, lastJobStatus: "Booked", ownerUid: APEX_OWNER_UID, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      const service = packageById(request.packageId);
      batch.set(jobRef, { mode: "booking", status: "Booked", customerId: customerRef.id, customerName: request.customerName, phone: request.phone || "", email: request.email || "", address: request.address || "", area: request.area || "", preferredContact: request.email ? "email" : "text", customerType: "standard", vehicleYear: request.vehicleYear || "", vehicleMake: request.vehicleMake || "", vehicleModel: request.vehicleModel || "", vehicle, rego: request.rego || "", vehicleType: request.vehicleType || "small", condition: request.condition || "average", packageId: request.packageId, packageName: request.packageName || service.name, bookingDate: request.preferredDate, bookingTime: request.preferredTime, notes: request.notes || "", total: Number(request.estimatedFromPrice || service.price), paidAmount: 0, photos: [], selectedAddons: [], source: "online-booking", sourceBookingRequestId: request.id, ownerUid: APEX_OWNER_UID, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      batch.update(doc(db, "bookingRequests", request.id), { status: "accepted", linkedJobId: jobRef.id, linkedCustomerId: customerRef.id, reviewedAt: serverTimestamp(), reviewedBy: APEX_OWNER_UID });
      batch.update(doc(db, "bookingSlots", request.slotKey), { status: "confirmed", jobId: jobRef.id, ownerUid: APEX_OWNER_UID, updatedAt: serverTimestamp() });
      await batch.commit(); notify(`${request.customerName}'s booking is confirmed.`);
    } catch (error) { console.error(error); notify("Booking approval failed. Check Firebase rules."); }
    setBusy(false);
  }

  async function reject(request) {
    if (!window.confirm(`Decline ${request.customerName}'s request and release the slot?`)) return;
    setBusy(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "bookingRequests", request.id), { status: "rejected", reviewedAt: serverTimestamp(), reviewedBy: APEX_OWNER_UID });
      if (request.slotKey) batch.delete(doc(db, "bookingSlots", request.slotKey));
      await batch.commit(); notify("Request declined and the time has been released.");
    } catch (error) { console.error(error); notify("Could not decline that request."); }
    setBusy(false);
  }

  async function saveManual(form) {
    const key = slotKey(form.bookingDate, form.bookingTime);
    if (slots.some(slot => slot.id === key)) return notify("That time is already held. Choose another time.");
    setBusy(true);
    try {
      const batch = writeBatch(db);
      const customerRef = form.customerId ? doc(db, "customers", form.customerId) : doc(collection(db, "customers"));
      const jobRef = doc(collection(db, "jobs"));
      const service = packageById(form.packageId);
      const vehicle = [form.vehicleYear, form.vehicleMake, form.vehicleModel].filter(Boolean).join(" ");
      if (!form.customerId) {
        const names = splitName(form.customerName);
        batch.set(customerRef, { firstName: names.firstName, lastName: names.lastName, customerName: form.customerName, businessName: "", phone: form.phone, email: form.email, address: form.address, area: form.area, customerType: "standard", preferredContact: form.email ? "email" : "text", notes: "Created from manual Apex HQ booking.", lastVehicle: vehicle, lastJobStatus: "Booked", ownerUid: APEX_OWNER_UID, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      batch.set(jobRef, { ...form, mode: "booking", status: "Booked", customerId: customerRef.id, packageName: service.name, vehicle, total: service.price, paidAmount: 0, selectedAddons: [], photos: [], source: "hq-manual", ownerUid: APEX_OWNER_UID, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      batch.set(doc(db, "bookingSlots", key), { slotKey: key, date: form.bookingDate, time: form.bookingTime, jobId: jobRef.id, status: "confirmed", source: "hq-manual", ownerUid: APEX_OWNER_UID, createdAt: serverTimestamp() });
      await batch.commit(); setManualOpen(false); setTab("calendar"); notify("Confirmed booking added to Apex HQ.");
    } catch (error) { console.error(error); notify("Could not save that booking."); }
    setBusy(false);
  }

  async function changeStatus(job, status) {
    await updateDoc(doc(db, "jobs", job.id), { status, paidAmount: status === "Paid" ? Number(job.paidAmount || job.total || 0) : Number(job.paidAmount || 0), updatedAt: serverTimestamp() });
    notify(`Job moved to ${status}.`);
  }

  async function saveSettings(next) {
    setBusy(true);
    try { await setDoc(doc(db, "publicSettings", "booking"), { ...next, updatedAt: serverTimestamp() }, { merge: true }); setSettings(next); notify("Online booking settings saved."); }
    catch (error) { console.error(error); notify("Could not save booking settings."); }
    setBusy(false);
  }

  const today = dateKeyLocal(new Date());
  const pending = requests.filter(item => item.status === "pending");
  const upcoming = jobs.filter(job => job.bookingDate && job.bookingDate >= today && !["Archived", "Cancelled"].includes(job.status)).sort((a, b) => `${a.bookingDate}${a.bookingTime || ""}`.localeCompare(`${b.bookingDate}${b.bookingTime || ""}`));
  const todayJobs = upcoming.filter(job => job.bookingDate === today);
  const openQuotes = jobs.filter(job => ["Lead", "Quote Requested", "Quote Sent", "Approved"].includes(job.status)).length;
  const revenue = jobs.reduce((sum, job) => sum + (["Paid", "Review Request Sent"].includes(job.status) ? Number(job.paidAmount || job.total || 0) : 0), 0);
  const term = search.trim().toLowerCase();
  const visibleJobs = jobs.filter(job => !term || [job.customerName, job.vehicle, job.rego, job.packageName, job.status].join(" ").toLowerCase().includes(term));
  const visibleCustomers = customers.filter(customer => !term || [nameOf(customer), customer.phone, customer.email, customer.lastVehicle].join(" ").toLowerCase().includes(term));

  if (!authReady) return <main className="boot"><Brand /><span className="spinner" /><p>Loading Apex HQ…</p></main>;
  if (!isOwner) return <Login busy={authBusy} error={authError} login={login} />;
  if (!unlocked && isDeviceLockEnabled()) return <DeviceGate user={authUser} unlock={() => { markSessionUnlocked(); setUnlocked(true); }} logout={logout} />;

  return <div className="hqShell">
    <aside className="sideRail"><Brand />
      <nav>{NAV.map(([id, label, icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><span>{icon}</span><strong>{label}</strong>{id === "requests" && pending.length > 0 && <em>{pending.length}</em>}</button>)}</nav>
      <footer><button onClick={() => { lockSession(); setUnlocked(false); }}>⌾ Lock device</button><button onClick={logout}>→ Sign out</button></footer>
    </aside>
    <div className="workspace">
      <header className="topBar"><div><p className="eyebrow">APEX HQ · {new Date().toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" }).toUpperCase()}</p><h1>{NAV.find(([id]) => id === tab)?.[1]}</h1></div><div className="topActions">
        {["jobs", "customers"].includes(tab) && <input className="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search Apex HQ" />}
        <a className="secondaryButton" href="/book" target="_blank" rel="noreferrer">Open booking page ↗</a><button onClick={() => setManualOpen(true)}>＋ New booking</button>
      </div></header>
      <main className="content">
        {tab === "dashboard" && <Dashboard todayJobs={todayJobs} pending={pending} upcoming={upcoming} openQuotes={openQuotes} revenue={revenue} customers={customers} jobs={jobs} setTab={setTab} add={() => setManualOpen(true)} />}
        {tab === "requests" && <Requests pending={pending} history={requests.filter(item => item.status !== "pending")} approve={approve} reject={reject} busy={busy} />}
        {tab === "calendar" && <Calendar jobs={upcoming} add={() => setManualOpen(true)} changeStatus={changeStatus} />}
        {tab === "jobs" && <Jobs jobs={visibleJobs} changeStatus={changeStatus} />}
        {tab === "customers" && <Customers customers={visibleCustomers} jobs={jobs} />}
        {tab === "settings" && <Settings user={authUser} settings={settings} save={saveSettings} busy={busy} notify={notify} />}
      </main>
    </div>
    <nav className="mobileNav">{NAV.map(([id, label, icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><span>{icon}</span><small>{label === "Settings" ? "More" : label}</small>{id === "requests" && pending.length > 0 && <em>{pending.length}</em>}</button>)}</nav>
    {manualOpen && <ManualBooking customers={customers} close={() => setManualOpen(false)} save={saveManual} busy={busy} />}
    {toast && <div className="toast">✓ {toast}</div>}
  </div>;
}

function Dashboard({ todayJobs, pending, upcoming, openQuotes, revenue, customers, jobs, setTab, add }) {
  const completed = jobs.filter(job => ["Completed", "Prepare Hnry Invoice", "Invoice Sent", "Paid", "Review Request Sent"].includes(job.status)).length;
  return <section>
    <div className="heroGrid"><article className="hero"><p className="eyebrow">TODAY'S COMMAND DECK</p><h2>{todayJobs.length ? `${todayJobs.length} vehicle${todayJobs.length === 1 ? "" : "s"} on the board today.` : "The day is clear. Let's fill it properly."}</h2><p>{pending.length ? `${pending.length} online booking request${pending.length === 1 ? " is" : "s are"} waiting for your call.` : "No pending online requests right now."}</p><div><button onClick={add}>＋ Add booking</button><button className="secondary" onClick={() => setTab("requests")}>Review requests →</button></div></article>
      <article className="nextCard"><p className="eyebrow">NEXT UP</p>{upcoming[0] ? <><span>{formatDate(upcoming[0].bookingDate)} · {upcoming[0].bookingTime || "TBC"}</span><h3>{upcoming[0].customerName}</h3><p>{upcoming[0].vehicle}</p><strong>{upcoming[0].packageName}</strong></> : <><h3>No upcoming booking.</h3><p>Add one in HQ or share the public booking link.</p></>}</article></div>
    <div className="stats"><Stat label="Pending requests" value={pending.length} note="From the public booking page" /><Stat label="Open quotes" value={openQuotes} note="Still waiting on a decision" /><Stat label="Paid revenue" value={money(revenue)} note="Recorded paid work" /><Stat label="Customer base" value={customers.length} note={`${completed} completed jobs`} /></div>
    <div className="columns"><article className="panel"><header><div><p className="eyebrow">SCHEDULE</p><h3>Coming up</h3></div><button className="textButton" onClick={() => setTab("calendar")}>Full calendar</button></header>{upcoming.slice(0, 5).map(job => <Agenda key={job.id} job={job} />)}{!upcoming.length && <Empty title="No bookings lined up" text="Share the /book link or add a customer booking from HQ." action="Add booking" click={add} />}</article>
      <article className="panel pulse"><header><div><p className="eyebrow">BUSINESS PULSE</p><h3>What needs attention</h3></div></header><button onClick={() => setTab("requests")}><i>↧</i><div><strong>{pending.length} booking request{pending.length === 1 ? "" : "s"}</strong><span>Approve or decline requested times</span></div><b>→</b></button><button onClick={() => setTab("jobs")}><i>◆</i><div><strong>{openQuotes} open quote{openQuotes === 1 ? "" : "s"}</strong><span>Follow up and turn them into work</span></div><b>→</b></button><a href="/book" target="_blank" rel="noreferrer"><i>◷</i><div><strong>Public booking page</strong><span>Preview the customer experience</span></div><b>→</b></a></article></div>
  </section>;
}

function Stat({ label, value, note }) { return <article className="stat"><small>{label}</small><strong>{value}</strong><p>{note}</p></article>; }
function Agenda({ job }) { return <div className="agenda"><div><strong>{new Date(`${job.bookingDate}T00:00:00`).getDate()}</strong><span>{new Date(`${job.bookingDate}T00:00:00`).toLocaleDateString("en-NZ", { month: "short" })}</span></div><section><strong>{job.customerName}</strong><span>{job.vehicle} · {job.packageName}</span></section><em>{job.bookingTime || "TBC"}</em></div>; }
function Empty({ title, text, action, click }) { return <div className="empty"><span>→</span><h3>{title}</h3><p>{text}</p>{action && <button onClick={click}>{action}</button>}</div>; }

function Requests({ pending, history, approve, reject, busy }) {
  return <section><PageIntro eyebrow="ONLINE INTAKE" title="Booking requests" text="Customers choose a held time online. You keep final control over price, travel and confirmation." badge={`${pending.length} pending`} />
    <div className="requestGrid">{pending.map(request => <article className="requestCard" key={request.id}><header><div><p className="eyebrow">PENDING REQUEST</p><h3>{request.customerName}</h3><span>{request.phone}{request.email ? ` · ${request.email}` : ""}</span></div><b>{formatDate(request.preferredDate)}<small>{request.preferredTime}</small></b></header><div className="requestBody"><section><span>Vehicle</span><strong>{[request.vehicleYear, request.vehicleMake, request.vehicleModel].filter(Boolean).join(" ")}</strong></section><section><span>Service</span><strong>{request.packageName}</strong></section><section><span>Estimate</span><strong>from {money(request.estimatedFromPrice)}</strong></section><section><span>Location</span><strong>{request.address}, {request.area}</strong></section></div>{request.notes && <p className="requestNotes">“{request.notes}”</p>}<footer><button onClick={() => approve(request)} disabled={busy}>Accept & create job</button><button className="danger" onClick={() => reject(request)} disabled={busy}>Decline</button></footer></article>)}{!pending.length && <Empty title="Inbox clear" text="New public booking requests will appear here instantly." />}</div>
    {history.length > 0 && <article className="panel history"><header><div><p className="eyebrow">HISTORY</p><h3>Reviewed requests</h3></div></header>{history.slice(0, 10).map(item => <div key={item.id}><strong>{item.customerName}</strong><span>{formatDate(item.preferredDate)} · {item.preferredTime}</span><em className={item.status}>{item.status}</em></div>)}</article>}
  </section>;
}

function Calendar({ jobs, add, changeStatus }) {
  const grouped = useMemo(() => jobs.reduce((map, job) => { (map[job.bookingDate] ||= []).push(job); return map; }, {}), [jobs]);
  return <section><PageIntro eyebrow="APPOINTMENT BOARD" title="Upcoming calendar" text="Online requests and manual bookings land in the same operating schedule." action="＋ Add booking" click={add} />
    <div className="calendarStack">{Object.entries(grouped).map(([date, rows]) => <article className="dayCard" key={date}><header><div><p className="eyebrow">{new Date(`${date}T00:00:00`).toLocaleDateString("en-NZ", { weekday: "long" }).toUpperCase()}</p><h3>{formatLongDate(date)}</h3></div><span>{rows.length} job{rows.length === 1 ? "" : "s"}</span></header>{rows.map(job => <JobStrip key={job.id} job={job} changeStatus={changeStatus} />)}</article>)}{!jobs.length && <Empty title="Nothing booked yet" text="Add a confirmed booking or share your public booking page." action="Add booking" click={add} />}</div>
  </section>;
}

function JobStrip({ job, changeStatus }) { return <div className="jobStrip"><div><strong>{job.bookingTime || "TBC"}</strong><span>{job.packageName}</span></div><section><h3>{job.customerName}</h3><p>{job.vehicle} · {job.area || "Location TBC"}</p></section><em className={`status ${slug(job.status)}`}>{job.status}</em><select value={job.status || "Booked"} onChange={event => changeStatus(job, event.target.value)}>{JOB_STATUSES.map(status => <option key={status}>{status}</option>)}</select></div>; }

function Jobs({ jobs, changeStatus }) {
  return <section><PageIntro eyebrow="JOB PIPELINE" title="Quotes, work and money" text="Every vehicle record stays tied to its customer, appointment and payment stage." badge={`${jobs.length} records`} /><div className="jobTable">{jobs.map(job => <div className="jobRow" key={job.id}><i>◆</i><div><strong>{job.customerName}</strong><span>{job.vehicle || "Vehicle not added"}</span></div><div><strong>{job.packageName || "Custom detail"}</strong><span>{job.bookingDate ? `${formatDate(job.bookingDate)} ${job.bookingTime || ""}` : "No booking date"}</span></div><b>{money(job.total)}</b><em className={`status ${slug(job.status)}`}>{job.status || "Quote Sent"}</em><select value={job.status || "Quote Sent"} onChange={event => changeStatus(job, event.target.value)}>{JOB_STATUSES.map(status => <option key={status}>{status}</option>)}</select></div>)}{!jobs.length && <Empty title="No matching jobs" text="Create a booking or clear the search field." />}</div></section>;
}

function Customers({ customers, jobs }) {
  return <section><PageIntro eyebrow="CUSTOMER CRM" title="People and vehicle history" text="Keep contact details, repeat vehicles and lifetime work together." badge={`${customers.length} customers`} /><div className="customerGrid">{customers.map(customer => { const related = jobs.filter(job => job.customerId === customer.id); const value = related.reduce((sum, job) => sum + Number(job.total || 0), 0); return <article className="customerCard" key={customer.id}><header><i>{nameOf(customer).slice(0, 1).toUpperCase()}</i><div><h3>{nameOf(customer)}</h3><p>{customer.phone || "No phone"}</p></div></header><section><span>{customer.email || "No email"}</span><span>{customer.area || "No area"}</span><span>{customer.lastVehicle || "No vehicle saved"}</span></section><footer><div><small>Jobs</small><strong>{related.length}</strong></div><div><small>Quoted value</small><strong>{money(value)}</strong></div></footer></article>; })}{!customers.length && <Empty title="No matching customers" text="Customers are created automatically when you approve online requests." />}</div></section>;
}

function Settings({ user, settings, save, busy, notify }) {
  const [draft, setDraft] = useState(settings);
  const [pin, setPinValue] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => setDraft(settings), [settings]);
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const schedule = (day, value) => setDraft(previous => ({ ...previous, weeklySchedule: { ...previous.weeklySchedule, [day]: value.split(",").map(item => item.trim()).filter(Boolean) } }));
  async function savePinLock() { try { await setPin(pin); setPinValue(""); setMessage("Device PIN saved."); } catch (error) { setMessage(error.message); } }
  async function biometric() { try { await registerBiometricLock(user); setMessage("Biometric device unlock is ready."); } catch (error) { setMessage(error?.name === "NotAllowedError" ? "Biometric setup was cancelled." : error.message); } }
  return <section><PageIntro eyebrow="CONTROL ROOM" title="Booking and device settings" text="Control what customers can request and how quickly this device opens." />
    <div className="settingsGrid"><article className="panel settingsPanel"><header><div><p className="eyebrow">PUBLIC BOOKING</p><h3>Booking page controls</h3></div><label className="switch"><input type="checkbox" checked={draft.enabled} onChange={event => update("enabled", event.target.checked)} /><span /></label></header>
      <div className="formGrid two"><label>Headline<input value={draft.headline} onChange={event => update("headline", event.target.value)} /></label><label>Service area<input value={draft.serviceArea} onChange={event => update("serviceArea", event.target.value)} /></label><label>Minimum notice (hours)<input type="number" min="0" max="168" value={draft.minimumNoticeHours} onChange={event => update("minimumNoticeHours", Number(event.target.value))} /></label><label>Book ahead (days)<input type="number" min="7" max="365" value={draft.maxAdvanceDays} onChange={event => update("maxAdvanceDays", Number(event.target.value))} /></label></div>
      <label>Intro<textarea rows="4" value={draft.intro} onChange={event => update("intro", event.target.value)} /></label>
      <div className="scheduleEditor"><p className="eyebrow">WEEKLY START TIMES</p>{[1,2,3,4,5,6,0].map(day => <label key={day}><span>{["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][day]}</span><input value={(draft.weeklySchedule?.[day] || []).join(", ")} onChange={event => schedule(day, event.target.value)} placeholder="Closed" /></label>)}</div>
      <label>Closed dates <small>Comma-separated YYYY-MM-DD</small><input value={(draft.closedDates || []).join(", ")} onChange={event => update("closedDates", event.target.value.split(",").map(item => item.trim()).filter(Boolean))} placeholder="2026-12-25, 2026-12-26" /></label><button onClick={() => save(draft)} disabled={busy}>{busy ? "Saving…" : "Save booking settings"}</button>
    </article>
    <article className="panel settingsPanel"><header><div><p className="eyebrow">QUICK UNLOCK</p><h3>PIN and biometrics</h3></div><b className="securityState">⌾ {isDeviceLockEnabled() ? "On" : "Off"}</b></header><p className="muted">This is a convenience lock for this phone or computer. Firebase email/password remains the real account authentication.</p>
      <div className="securityOption"><div><strong>Device PIN</strong><span>{hasPinLock() ? "Configured" : "Not configured"}</span></div><div><input type="password" inputMode="numeric" maxLength="6" value={pin} onChange={event => setPinValue(event.target.value.replace(/\D/g, ""))} placeholder="4–6 digits" /><button onClick={savePinLock} disabled={pin.length < 4}>Save PIN</button></div></div>
      <div className="securityOption"><div><strong>Face ID / fingerprint</strong><span>{supportsBiometrics() ? (hasBiometricLock() ? "Configured on this device" : "Available on this device") : "Not supported here"}</span></div><button className="secondary" onClick={biometric} disabled={!supportsBiometrics()}>Set up biometric unlock</button></div>
      {message && <div className="alert">{message}</div>}{isDeviceLockEnabled() && <button className="danger" onClick={() => { disableDeviceLock(); setMessage("Device lock removed."); notify("Quick unlock removed from this device."); }}>Remove device lock</button>}
      <div className="securityNote"><strong>Security note</strong><p>Biometric unlock uses the device WebAuthn prompt over HTTPS. It gates the retained Firebase session; it does not replace the Firebase account or recovery password.</p></div>
    </article></div>
  </section>;
}

function PageIntro({ eyebrow, title, text, badge, action, click }) { return <div className="pageIntro"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{text}</p></div>{badge && <span>{badge}</span>}{action && <button onClick={click}>{action}</button>}</div>; }
function stamp(value) { return value?.seconds || value?.toMillis?.() || 0; }
function nameOf(customer) { return customer.businessName || [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.customerName || "Unnamed customer"; }
function splitName(value = "") { const parts = value.trim().split(/\s+/).filter(Boolean); return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") }; }
function phoneKey(value = "") { return String(value).replace(/\D/g, "").replace(/^64/, "0"); }
function slug(value = "") { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-"); }
function dateKeyLocal(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

createRoot(document.getElementById("root")).render(<App />);
