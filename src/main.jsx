import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db, storage } from "./firebase";
import "./styles.css";

const BRAD_UID = "FqDrn1aPFHXUB5ogb2rN9D7mRG42";

const packages = {
  express: { name: "Express Refresh", price: 79 },
  deep: { name: "Deep Interior Detail", price: 159 },
  full: { name: "Full Detail", price: 229 },
  tradie: { name: "Tradie Reset", price: 199 },
  seats: { name: "Seats Out Reset", price: 349 }
};

const addons = [
  { id: "headlights", name: "Headlight Restoration", price: 59 },
  { id: "engine", name: "Engine Bay Detail", price: 79 },
  { id: "petHair", name: "Pet Hair Removal", price: 39 },
  { id: "odour", name: "Odour Treatment", price: 49 },
  { id: "sand", name: "Heavy Sand Removal", price: 35 },
  { id: "mud", name: "Excessive Mud Removal", price: 35 },
  { id: "stains", name: "Stain Treatment", price: 25 },
  { id: "childSeat", name: "Child Seat Removal/Reinstall", price: 20 }
];

const familyPrices = { express: 60, deep: 120, full: 180, tradie: 160, seats: 350 };
const startupPrices = { express: 50, deep: 90, full: 140, tradie: 150, seats: 350 };
const statuses = ["Lead", "Quote Requested", "Quote Sent", "Approved", "Booked", "In Progress", "Completed", "Paid", "Archived"];
const customerTypes = [["standard", "Standard Customer"], ["friend", "Friend - 10% off"], ["family", "Immediate Family Pricing"], ["startup", "Close Family / Startup Support"], ["fleet", "Fleet / Commercial"]];
const contactMethods = [["text", "Text"], ["phone", "Phone"], ["email", "Email"], ["facebook", "Facebook / Messenger"], ["any", "Any"]];
const vehicleTypes = [["small", "Sedan / Hatch"], ["suv", "SUV / Wagon"], ["singlecab", "Single-Cab Ute"], ["doublecab", "Double-Cab Ute"], ["large", "7-Seater / Large SUV"], ["van", "Van / Oversized Vehicle"], ["machinery", "Machinery / Commercial"]];
const photoCategories = [["before", "Before photos"], ["after", "After photos"], ["damage", "Damage / concern photos"], ["stains", "Stain photos"], ["customer", "Customer-supplied photos"], ["receipt", "Invoice / receipt photos"]];

const emptyCustomer = { firstName: "", lastName: "", businessName: "", phone: "", email: "", address: "", area: "", preferredContact: "text", customerType: "standard", notes: "" };
const emptyJob = { mode: "quote", customerId: "", customerName: "", phone: "", email: "", address: "", area: "", preferredContact: "text", customerType: "standard", vehicleYear: "", vehicleMake: "", vehicleModel: "", rego: "", colour: "", vehicleType: "small", workVehicle: false, fleetVehicle: false, blackDuckCovers: false, petHair: false, heavyStains: false, sandMudLevel: "normal", condition: "normal", packageId: "express", selectedAddons: [], travel: 0, manualTotal: "", paidAmount: "", bookingDate: "", bookingTime: "", serviceDate: "", invoiceNumber: "", status: "Quote Sent", photoCategory: "before", photos: [], notes: "" };
const money = value => "$" + Number(value || 0).toFixed(0);

function displayCustomerName(customer) {
  const personal = [customer?.firstName, customer?.lastName].filter(Boolean).join(" ").trim();
  return customer?.businessName || personal || customer?.customerName || "Unnamed Customer";
}

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.slice(-1).join("") };
}

function vehicleName(job) {
  return [job.vehicleYear, job.vehicleMake, job.vehicleModel].filter(Boolean).join(" ").trim() || job.vehicle || "Vehicle not added";
}

function calculatePricing(form) {
  let base = packages[form.packageId]?.price || packages.express.price;
  if (form.customerType === "friend") base = Math.round(base * 0.9);
  if (form.customerType === "family") base = familyPrices[form.packageId] || base;
  if (form.customerType === "startup") base = startupPrices[form.packageId] || base;

  let vehicleAdj = 0;
  if (form.vehicleType === "suv") vehicleAdj = 15;
  if (form.vehicleType === "doublecab") vehicleAdj = 25;
  if (form.vehicleType === "large") vehicleAdj = 40;
  if (form.vehicleType === "van") vehicleAdj = 60;
  if (form.vehicleType === "machinery") vehicleAdj = 120;
  if (form.packageId === "tradie" && form.vehicleType === "singlecab") vehicleAdj = 0;
  if (form.packageId === "tradie" && form.vehicleType === "doublecab") vehicleAdj = 30;
  if (form.packageId === "tradie" && form.vehicleType === "van") vehicleAdj = 70;

  let conditionAdj = 0;
  if (form.condition === "dirty") conditionAdj = 30;
  if (form.condition === "heavily") conditionAdj = 70;
  if (form.sandMudLevel === "moderate") conditionAdj += 20;
  if (form.sandMudLevel === "heavy") conditionAdj += 45;
  if (form.petHair) conditionAdj += 25;
  if (form.heavyStains) conditionAdj += 25;

  const addonTotal = addons.filter(addon => form.selectedAddons.includes(addon.id)).reduce((sum, addon) => sum + addon.price, 0);
  const travel = Number(form.travel || 0);
  const calculatedTotal = base + vehicleAdj + conditionAdj + addonTotal + travel;
  const manualTotal = Number(form.manualTotal || 0);
  const total = manualTotal > 0 ? manualTotal : calculatedTotal;
  const warnings = ["Access to an outside tap required."];
  if (manualTotal > 0) warnings.unshift("Manual total is overriding the calculator.");
  if (form.condition === "heavily") warnings.unshift("Inspect heavily soiled vehicle before final quote.");
  if (["large", "van", "machinery"].includes(form.vehicleType)) warnings.unshift("Large/oversized vehicle: final pricing may vary.");
  if (form.packageId === "tradie") warnings.unshift("Tradie Reset starts from base pricing; larger vehicles may vary.");
  return { base, vehicleAdj, conditionAdj, addonTotal, travel, calculatedTotal, total, warnings };
}

function LoginScreen({ loading, error, onLogin }) {
  const [email, setEmail] = useState("Brad@apexdetailers.co.nz");
  const [password, setPassword] = useState("");

  function submit(event) {
    event.preventDefault();
    onLogin(email, password);
  }

  return <div className="appShell">
    <main className="appMain">
      <section className="heroCard">
        <div>
          <div className="brandLogo" aria-hidden="true"><span>A</span></div>
          <span className="eyebrow">Private Apex App</span>
          <h2>Sign in to Apex Detailers.</h2>
          <p>This app is locked to Brad's Firebase account before customer, job, booking, and photo data loads.</p>
        </div>
      </section>
      <form className="card" onSubmit={submit}>
        <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="Brad@apexdetailers.co.nz" />
        <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="Firebase password" />
        <button type="submit" disabled={loading}>{loading ? "Signing in..." : "Log In"}</button>
        {error && <p className="muted">{error}</p>}
        <p className="muted">Use the user you created in Firebase Authentication.</p>
      </form>
    </main>
  </div>;
}

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [customerForm, setCustomerForm] = useState(emptyCustomer);
  const [jobForm, setJobForm] = useState(emptyJob);
  const [modal, setModal] = useState(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const pricing = useMemo(() => calculatePricing(jobForm), [jobForm]);
  const isBrad = authUser?.uid === BRAD_UID;

  useEffect(() => {
    const stopAuth = onAuthStateChanged(auth, user => {
      if (user && user.uid !== BRAD_UID) {
        setLoginError("This Firebase user is not authorised for Apex Detailers.");
        signOut(auth);
        setAuthUser(null);
      } else {
        setAuthUser(user);
        if (user) setLoginError("");
      }
      setAuthReady(true);
    });
    return stopAuth;
  }, []);

  useEffect(() => {
    if (!isBrad) return undefined;
    const stopCustomers = onSnapshot(collection(db, "customers"), snap => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => displayCustomerName(a).localeCompare(displayCustomerName(b))));
    });
    const stopJobs = onSnapshot(collection(db, "jobs"), snap => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });
    return () => { stopCustomers(); stopJobs(); };
  }, [isBrad]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(customer => [displayCustomerName(customer), customer.phone, customer.email, customer.address, customer.area, customer.notes].join(" ").toLowerCase().includes(term));
  }, [customers, search]);

  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return jobs;
    return jobs.filter(job => [job.customerName, job.phone, job.email, job.vehicle, job.rego, job.status, job.packageName, job.notes].join(" ").toLowerCase().includes(term));
  }, [jobs, search]);

  const bookedJobs = jobs.filter(job => job.bookingDate && !["Completed", "Paid", "Archived"].includes(job.status));
  const completedJobs = jobs.filter(job => ["Completed", "Paid"].includes(job.status));
  const quotedRevenue = jobs.reduce((sum, job) => sum + Number(job.total || 0), 0);
  const paidRevenue = jobs.reduce((sum, job) => sum + Number(job.paidAmount || (job.status === "Paid" ? job.total : 0) || 0), 0);
  const photoCount = jobs.reduce((sum, job) => sum + (job.photos || []).length, 0);
  const customerJobs = id => jobs.filter(job => job.customerId === id);

  async function handleLogin(email, password) {
    setLoginLoading(true);
    setLoginError("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      console.error(error);
      setLoginError("Login failed. Check the email/password in Firebase Authentication.");
    }
    setLoginLoading(false);
  }

  async function handleLogout() {
    await signOut(auth);
    setCustomers([]);
    setJobs([]);
    setSearch("");
    setTab("dashboard");
    setModal(null);
    setActionOpen(false);
  }

  function openCustomerModal(customer = null) {
    setActionOpen(false);
    setMessage("");
    setCustomerForm(customer ? { ...emptyCustomer, ...customer } : emptyCustomer);
    setModal(customer ? "editCustomer" : "addCustomer");
  }

  function openJobModal({ mode = "quote", customer = null, job = null } = {}) {
    setActionOpen(false);
    setMessage("");
    if (job) {
      setJobForm({ ...emptyJob, ...job, mode: job.mode || "quote", selectedAddons: job.selectedAddons || [], photos: job.photos || [], manualTotal: job.manualTotal || "", paidAmount: job.paidAmount || "", photoCategory: "before" });
      setModal("editJob");
      return;
    }
    setJobForm({ ...emptyJob, mode, status: mode === "past" ? "Completed" : mode === "booking" ? "Booked" : "Quote Sent", serviceDate: mode === "past" ? new Date().toISOString().slice(0, 10) : "", customerId: customer?.id || "", customerName: customer ? displayCustomerName(customer) : "", phone: customer?.phone || "", email: customer?.email || "", address: customer?.address || "", area: customer?.area || "", preferredContact: customer?.preferredContact || "text", customerType: customer?.customerType || "standard" });
    setModal("addJob");
  }

  function quickAdd() {
    if (tab === "customers") openCustomerModal();
    else if (tab === "media") openJobModal({ mode: "past" });
    else setActionOpen(true);
  }

  function selectCustomerForJob(customerId) {
    const customer = customers.find(row => row.id === customerId);
    if (!customer) return setJobForm(previous => ({ ...previous, customerId }));
    setJobForm(previous => ({ ...previous, customerId, customerName: displayCustomerName(customer), phone: customer.phone || "", email: customer.email || "", address: customer.address || "", area: customer.area || "", preferredContact: customer.preferredContact || "text", customerType: customer.customerType || "standard" }));
  }

  function handlePhotos(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const next = files.map(file => ({ file, name: file.name, category: jobForm.photoCategory, preview: URL.createObjectURL(file) }));
    setJobForm(previous => ({ ...previous, photos: [...previous.photos, ...next] }));
    event.target.value = "";
  }

  async function saveCustomer() {
    if (displayCustomerName(customerForm) === "Unnamed Customer") return alert("Add a customer name or business name first.");
    setSaving(true);
    try {
      const payload = { ...customerForm, ownerUid: BRAD_UID, updatedAt: serverTimestamp() };
      if (customerForm.id) await updateDoc(doc(db, "customers", customerForm.id), payload);
      else await addDoc(collection(db, "customers"), { ...payload, createdAt: serverTimestamp() });
      setCustomerForm(emptyCustomer);
      setModal(null);
      setTab("customers");
    } catch (error) {
      console.error(error);
      alert("Customer save failed. Check Firebase rules.");
    }
    setSaving(false);
  }

  async function ensureCustomerForJob() {
    if (jobForm.customerId) return jobForm.customerId;
    const parts = splitName(jobForm.customerName);
    const newCustomer = await addDoc(collection(db, "customers"), { firstName: parts.firstName, lastName: parts.lastName, businessName: "", phone: jobForm.phone, email: jobForm.email, address: jobForm.address, area: jobForm.area, preferredContact: jobForm.preferredContact, customerType: jobForm.customerType, notes: "Created from job entry.", ownerUid: BRAD_UID, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return newCustomer.id;
  }

  async function saveJob() {
    if (!jobForm.customerName) return alert("Add or choose a customer first.");
    if (vehicleName(jobForm) === "Vehicle not added") return alert("Add the vehicle year/make/model first.");
    setSaving(true);
    try {
      const customerId = await ensureCustomerForJob();
      const uploadedPhotos = [];
      for (const photo of jobForm.photos) {
        if (photo.url && !photo.file) { uploadedPhotos.push(photo); continue; }
        const safeName = String(photo.name || "photo").replace(/[^a-z0-9._-]/gi, "-");
        const path = `jobs/${customerId}/${Date.now()}-${safeName}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, photo.file);
        uploadedPhotos.push({ name: photo.name, category: photo.category || "before", url: await getDownloadURL(storageRef), path });
      }
      const addonNames = addons.filter(addon => jobForm.selectedAddons.includes(addon.id)).map(addon => addon.name);
      const payload = { ...jobForm, customerId, ownerUid: BRAD_UID, vehicle: vehicleName(jobForm), packageName: packages[jobForm.packageId]?.name || "Custom Package", addonNames, pricing, total: pricing.total, paidAmount: Number(jobForm.paidAmount || 0), photos: uploadedPhotos, updatedAt: serverTimestamp() };
      delete payload.photoCategory;
      if (jobForm.id) await updateDoc(doc(db, "jobs", jobForm.id), payload);
      else await addDoc(collection(db, "jobs"), { ...payload, createdAt: serverTimestamp() });
      await updateDoc(doc(db, "customers", customerId), { phone: jobForm.phone, email: jobForm.email, address: jobForm.address, area: jobForm.area, preferredContact: jobForm.preferredContact, customerType: jobForm.customerType, lastVehicle: vehicleName(jobForm), lastJobStatus: jobForm.status, ownerUid: BRAD_UID, updatedAt: serverTimestamp() });
      setJobForm(emptyJob);
      setModal(null);
      setTab(jobForm.mode === "booking" ? "bookings" : "jobs");
    } catch (error) {
      console.error(error);
      alert("Job save failed. Check Firebase rules and Storage rules.");
    }
    setSaving(false);
  }

  async function updateJobStatus(job, status) {
    await updateDoc(doc(db, "jobs", job.id), { status, paidAmount: status === "Paid" ? Number(job.paidAmount || job.total || 0) : Number(job.paidAmount || 0), updatedAt: serverTimestamp() });
  }

  async function deleteJob(id) { if (confirm("Delete this job/quote?")) await deleteDoc(doc(db, "jobs", id)); }
  async function deleteCustomer(id) { if (confirm("Delete this customer? Old jobs will stay saved.")) await deleteDoc(doc(db, "customers", id)); }

  function generateMessage() {
    const names = addons.filter(addon => jobForm.selectedAddons.includes(addon.id)).map(addon => addon.name);
    setMessage(`Hey ${jobForm.customerName || "there"}, thanks for reaching out to Apex Detailers.\n\nFor your ${vehicleName(jobForm)}, I can do the ${packages[jobForm.packageId].name} package for an estimated total of ${money(pricing.total)}.${names.length ? "\nAdd-ons included: " + names.join(", ") + "." : ""}${jobForm.bookingDate ? "\nBooking requested: " + jobForm.bookingDate + (jobForm.bookingTime ? " at " + jobForm.bookingTime : "") + "." : ""}\n\nThis includes Apex launch pricing. Access to an outside tap is required.\n\nCheers,\nApex Detailers`);
  }

  if (!authReady) return <div className="appShell"><main className="appMain"><section className="card"><h2>Loading Apex...</h2></section></main></div>;
  if (!isBrad) return <LoginScreen loading={loginLoading} error={loginError} onLogin={handleLogin} />;

  return <div className="appShell">
    <header className="appHeader"><div className="brandLogo" aria-hidden="true"><span>A</span></div><div><h1>Apex Detailers</h1><p>Customers • Quotes • Jobs • Photos</p></div><button type="button" className="smallButton secondary" onClick={handleLogout}>Logout</button></header>
    <main className="appMain">
      <section className="heroCard"><div><span className="eyebrow">Apex App V2</span><h2>Business database, not just a quote pad.</h2><p>Add old customers, past jobs, new bookings, photos, and proper contact details from your iPhone.</p></div><button type="button" className="miniAdd" onClick={() => setActionOpen(true)}>＋ Add</button></section>
      {tab !== "dashboard" && <label className="searchBox"><span>Search</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, rego, phone, vehicle..." /></label>}
      {tab === "dashboard" && <Dashboard customers={customers} jobs={jobs} bookedJobs={bookedJobs} completedJobs={completedJobs} quotedRevenue={quotedRevenue} paidRevenue={paidRevenue} photoCount={photoCount} openCustomerModal={openCustomerModal} openJobModal={openJobModal} />}
      {tab === "customers" && <CustomersTab customers={filteredCustomers} customerJobs={customerJobs} openCustomerModal={openCustomerModal} openJobModal={openJobModal} deleteCustomer={deleteCustomer} />}
      {tab === "jobs" && <JobsTab title="Jobs & Quotes" jobs={filteredJobs} openJobModal={openJobModal} updateJobStatus={updateJobStatus} deleteJob={deleteJob} />}
      {tab === "bookings" && <JobsTab title="Upcoming Bookings" jobs={bookedJobs.sort((a, b) => String(a.bookingDate).localeCompare(String(b.bookingDate)))} openJobModal={openJobModal} updateJobStatus={updateJobStatus} deleteJob={deleteJob} />}
      {tab === "media" && <MediaTab jobs={jobs} openJobModal={openJobModal} />}
    </main>
    <button type="button" className="fab" aria-label="Add" onClick={quickAdd}>＋</button>
    <nav className="bottomNav">{[["dashboard", "Home"], ["customers", "Customers"], ["jobs", "Jobs"], ["bookings", "Bookings"], ["media", "Photos"]].map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} className={tab === id ? "active" : ""}>{label}</button>)}</nav>
    {actionOpen && <ActionSheet close={() => setActionOpen(false)} openCustomerModal={openCustomerModal} openJobModal={openJobModal} />}
    {modal && <Modal close={() => setModal(null)}>{(modal === "addCustomer" || modal === "editCustomer") && <CustomerForm form={customerForm} updateForm={(k, v) => setCustomerForm(p => ({ ...p, [k]: v }))} saving={saving} saveCustomer={saveCustomer} />}{(modal === "addJob" || modal === "editJob") && <JobForm form={jobForm} customers={customers} pricing={pricing} saving={saving} message={message} updateForm={(k, v) => setJobForm(p => ({ ...p, [k]: v }))} toggleAddon={id => setJobForm(p => ({ ...p, selectedAddons: p.selectedAddons.includes(id) ? p.selectedAddons.filter(x => x !== id) : [...p.selectedAddons, id] }))} selectCustomerForJob={selectCustomerForJob} handlePhotos={handlePhotos} removePhoto={index => setJobForm(p => ({ ...p, photos: p.photos.filter((_, i) => i !== index) }))} saveJob={saveJob} generateMessage={generateMessage} />}</Modal>}
  </div>;
}

function Dashboard({ customers, jobs, bookedJobs, completedJobs, quotedRevenue, paidRevenue, photoCount, openCustomerModal, openJobModal }) {
  return <section><div className="statGrid"><Stat label="Customers" value={customers.length} /><Stat label="Jobs/Quotes" value={jobs.length} /><Stat label="Booked" value={bookedJobs.length} /><Stat label="Completed" value={completedJobs.length} /><Stat label="Quoted" value={money(quotedRevenue)} /><Stat label="Paid" value={money(paidRevenue)} /><Stat label="Photos" value={photoCount} /></div><div className="quickGrid"><button type="button" onClick={() => openCustomerModal()}>＋ Add Customer</button><button type="button" onClick={() => openJobModal({ mode: "quote" })}>＋ New Quote</button><button type="button" onClick={() => openJobModal({ mode: "past" })}>＋ Past Job + Photos</button></div><div className="card"><h3>Recent work</h3>{jobs.slice(0, 4).map(job => <CompactJob key={job.id} job={job} />)}{!jobs.length && <p className="muted">No jobs yet. Add a customer or past job to start testing.</p>}</div></section>;
}

function CustomersTab({ customers, customerJobs, openCustomerModal, openJobModal, deleteCustomer }) {
  return <section><div className="sectionTitle"><div><h2>Customers</h2><p>Add customers here, then attach vehicles, old completed jobs, and photos.</p></div></div><div className="quickGrid"><button type="button" onClick={() => openCustomerModal()}>＋ Add Customer</button><button type="button" className="secondary" onClick={() => openJobModal({ mode: "past" })}>＋ Add Past Job + Photos</button></div>{customers.map(customer => { const rows = customerJobs(customer.id); const total = rows.reduce((sum, job) => sum + Number(job.total || 0), 0); const photos = rows.reduce((sum, job) => sum + (job.photos || []).length, 0); return <article className="card customerCard" key={customer.id}><div className="cardHeader"><div><h3>{displayCustomerName(customer)}</h3><p className="muted">{customer.phone || "No phone"}{customer.email ? ` • ${customer.email}` : ""}{customer.area ? ` • ${customer.area}` : ""}</p></div><span className="badge">{rows.length} job{rows.length === 1 ? "" : "s"}</span></div><div className="detailList">{customer.address && <span>Address: {customer.address}</span>}{customer.preferredContact && <span>Preferred contact: {customer.preferredContact}</span>}{customer.lastVehicle && <span>Last vehicle: {customer.lastVehicle}</span>}{customer.notes && <span>Notes: {customer.notes}</span>}<span>Total quoted: {money(total)}</span><span>Saved photos from jobs: {photos}</span></div><div className="buttonRow"><button type="button" className="secondary" onClick={() => openJobModal({ mode: "quote", customer })}>＋ Quote</button><button type="button" className="secondary" onClick={() => openJobModal({ mode: "past", customer })}>＋ Past Job + Photos</button><button type="button" className="secondary" onClick={() => openCustomerModal(customer)}>Edit Details</button><button type="button" className="dangerGhost" onClick={() => deleteCustomer(customer.id)}>Delete</button></div>{rows.length > 0 && <div className="detailList">{rows.slice(0, 3).map(job => <span key={job.id}>{job.vehicle} • {job.packageName} • {money(job.total)} • {(job.photos || []).length} photo(s)</span>)}</div>}</article>; })}{!customers.length && <div className="emptyState"><h3>Add your first customer</h3><p>Tap below to add name, phone, email, address, notes, then add past jobs with photos.</p><button type="button" onClick={() => openCustomerModal()}>＋ Add Customer</button><button type="button" className="secondary" onClick={() => openJobModal({ mode: "past" })}>＋ Add Past Job + Photos</button></div>}</section>;
}

function JobsTab({ title, jobs, openJobModal, updateJobStatus, deleteJob }) {
  return <section><div className="sectionTitle"><div><h2>{title}</h2><p>Quotes, bookings, old completed jobs, and paid work all live here.</p></div><button type="button" className="smallButton" onClick={() => openJobModal({ mode: "past" })}>＋ Job</button></div>{jobs.map(job => <JobCard key={job.id} job={job} openJobModal={openJobModal} updateJobStatus={updateJobStatus} deleteJob={deleteJob} />)}{!jobs.length && <div className="emptyState"><h3>No jobs here yet</h3><p>Tap below to add a quote, booking, or old completed job.</p><button type="button" onClick={() => openJobModal({ mode: "past" })}>＋ Add Past Job + Photos</button></div>}</section>;
}

function MediaTab({ jobs, openJobModal }) {
  const rows = jobs.filter(job => (job.photos || []).length);
  return <section><div className="sectionTitle"><div><h2>Photos</h2><p>Before, after, stain, damage, receipt, and customer-supplied photos.</p></div><button type="button" className="smallButton" onClick={() => openJobModal({ mode: "past" })}>＋ Upload</button></div>{rows.map(job => <article className="card" key={job.id}><h3>{job.customerName} — {job.vehicle}</h3><p className="muted">{job.packageName} • {job.status}</p><PhotoGrid photos={job.photos || []} /></article>)}{!rows.length && <div className="emptyState"><h3>No photos uploaded yet</h3><p>Add a past job and use the upload box to attach photos.</p><button type="button" onClick={() => openJobModal({ mode: "past" })}>＋ Add Job With Photos</button></div>}</section>;
}

function CustomerForm({ form, updateForm, saving, saveCustomer }) {
  return <section><h2>{form.id ? "Edit Customer" : "Add Customer"}</h2><p className="muted">Add name, phone, email, address, area, contact preference, and notes. Photos go on the customer’s jobs.</p><div className="formGrid"><Input label="First Name" value={form.firstName} onChange={v => updateForm("firstName", v)} /><Input label="Last Name" value={form.lastName} onChange={v => updateForm("lastName", v)} /></div><Input label="Business Name / Fleet Name" value={form.businessName} onChange={v => updateForm("businessName", v)} /><Input label="Phone" value={form.phone} onChange={v => updateForm("phone", v)} inputMode="tel" /><Input label="Email" value={form.email} onChange={v => updateForm("email", v)} type="email" /><Input label="Street / Address" value={form.address} onChange={v => updateForm("address", v)} /><Input label="Area / Suburb" value={form.area} onChange={v => updateForm("area", v)} placeholder="Napier, Hastings, Poraiti..." /><div className="formGrid"><Select label="Preferred Contact" value={form.preferredContact} onChange={v => updateForm("preferredContact", v)} options={contactMethods} /><Select label="Customer Type" value={form.customerType} onChange={v => updateForm("customerType", v)} options={customerTypes} /></div><Textarea label="Customer Notes" value={form.notes} onChange={v => updateForm("notes", v)} placeholder="Access notes, regular customer, dog hair, fleet account, anything useful..." /><button type="button" disabled={saving} onClick={saveCustomer}>{saving ? "Saving..." : form.id ? "Save Customer Changes" : "Save Customer"}</button></section>;
}

function JobForm({ form, customers, pricing, saving, message, updateForm, toggleAddon, selectCustomerForJob, handlePhotos, removePhoto, saveJob, generateMessage }) {
  return <section><h2>{form.id ? "Edit Job / Quote" : form.mode === "past" ? "Add Past Job + Photos" : "Add Quote / Booking"}</h2><p className="muted">Use this for new quotes, booked jobs, and old completed work with customer photos.</p><div className="formPanel"><h3>Customer</h3><Select label="Choose Existing Customer" value={form.customerId} onChange={selectCustomerForJob} options={[["", "New / not saved yet"], ...customers.map(customer => [customer.id, displayCustomerName(customer)])]} /><Input label="Customer Name" value={form.customerName} onChange={v => updateForm("customerName", v)} /><div className="formGrid"><Input label="Phone" value={form.phone} onChange={v => updateForm("phone", v)} inputMode="tel" /><Input label="Email" value={form.email} onChange={v => updateForm("email", v)} type="email" /></div><Input label="Address" value={form.address} onChange={v => updateForm("address", v)} /><Input label="Area / Suburb" value={form.area} onChange={v => updateForm("area", v)} /><div className="formGrid"><Select label="Preferred Contact" value={form.preferredContact} onChange={v => updateForm("preferredContact", v)} options={contactMethods} /><Select label="Customer Type" value={form.customerType} onChange={v => updateForm("customerType", v)} options={customerTypes} /></div></div><div className="formPanel"><h3>Vehicle</h3><div className="formGrid three"><Input label="Year" value={form.vehicleYear} onChange={v => updateForm("vehicleYear", v)} inputMode="numeric" /><Input label="Make" value={form.vehicleMake} onChange={v => updateForm("vehicleMake", v)} /><Input label="Model" value={form.vehicleModel} onChange={v => updateForm("vehicleModel", v)} /></div><div className="formGrid"><Input label="Rego" value={form.rego} onChange={v => updateForm("rego", v.toUpperCase())} /><Input label="Colour" value={form.colour} onChange={v => updateForm("colour", v)} /></div><Select label="Vehicle Type" value={form.vehicleType} onChange={v => updateForm("vehicleType", v)} options={vehicleTypes} /><div className="switchGrid"><Check label="Work vehicle" checked={form.workVehicle} onChange={v => updateForm("workVehicle", v)} /><Check label="Fleet vehicle" checked={form.fleetVehicle} onChange={v => updateForm("fleetVehicle", v)} /><Check label="Black Duck covers" checked={form.blackDuckCovers} onChange={v => updateForm("blackDuckCovers", v)} /><Check label="Pet hair" checked={form.petHair} onChange={v => updateForm("petHair", v)} /><Check label="Heavy stains" checked={form.heavyStains} onChange={v => updateForm("heavyStains", v)} /></div></div><div className="formPanel"><h3>Job Details</h3><div className="formGrid"><Select label="Package" value={form.packageId} onChange={v => updateForm("packageId", v)} options={Object.entries(packages).map(([id, item]) => [id, `${item.name} - ${money(item.price)}`])} /><Select label="Status" value={form.status} onChange={v => updateForm("status", v)} options={statuses.map(status => [status, status])} /></div><div className="formGrid"><Select label="Condition" value={form.condition} onChange={v => updateForm("condition", v)} options={[["normal", "Normal"], ["dirty", "Dirty / extra time likely"], ["heavily", "Heavily soiled - inspect first"]]} /><Select label="Sand / Mud Level" value={form.sandMudLevel} onChange={v => updateForm("sandMudLevel", v)} options={[["normal", "Normal"], ["moderate", "Moderate"], ["heavy", "Heavy"]]} /></div><label className="plainLabel">Add-ons</label><div className="addons">{addons.map(addon => <button type="button" className={form.selectedAddons.includes(addon.id) ? "chip active" : "chip"} key={addon.id} onClick={() => toggleAddon(addon.id)}>{addon.name} {money(addon.price)}</button>)}</div><div className="formGrid"><Input label="Booking Date" type="date" value={form.bookingDate} onChange={v => updateForm("bookingDate", v)} /><Input label="Booking Time" type="time" value={form.bookingTime} onChange={v => updateForm("bookingTime", v)} /></div><div className="formGrid"><Input label="Service Date / Past Job Date" type="date" value={form.serviceDate} onChange={v => updateForm("serviceDate", v)} /><Input label="Invoice Number" value={form.invoiceNumber} onChange={v => updateForm("invoiceNumber", v)} placeholder="Optional" /></div><div className="formGrid"><Input label="Travel Fee" type="number" value={form.travel} onChange={v => updateForm("travel", v)} /><Input label="Manual Total Override" type="number" value={form.manualTotal} onChange={v => updateForm("manualTotal", v)} placeholder="Optional" /></div><Input label="Paid Amount" type="number" value={form.paidAmount} onChange={v => updateForm("paidAmount", v)} placeholder="For paid/completed jobs" /></div><div className="formPanel"><h3>Photos From This Job</h3><Select label="Photo Category" value={form.photoCategory} onChange={v => updateForm("photoCategory", v)} options={photoCategories} /><label className="uploadBox"><input type="file" accept="image/*" multiple onChange={handlePhotos} /><strong>＋ Upload job photos</strong><span>Before, after, stains, damage, customer-supplied photos, receipts.</span></label>{!!form.photos.length && <div className="photoReview">{form.photos.map((photo, index) => <div className="photoTile" key={`${photo.url || photo.preview || photo.name}-${index}`}><img src={photo.url || photo.preview} alt={photo.name || "Job upload"} /><span>{photo.category || "photo"}</span><button type="button" onClick={() => removePhoto(index)}>Remove</button></div>)}</div>}</div><Textarea label="Notes" value={form.notes} onChange={v => updateForm("notes", v)} placeholder="Stains, Black Duck covers, pet hair, access notes, what was done..." /><div className="quoteTotal"><span>Quote / Job Total</span><strong>{money(pricing.total)}</strong></div><div className="breakdown"><div><span>Base</span><b>{money(pricing.base)}</b></div><div><span>Vehicle adjustment</span><b>{money(pricing.vehicleAdj)}</b></div><div><span>Condition adjustment</span><b>{money(pricing.conditionAdj)}</b></div><div><span>Add-ons</span><b>{money(pricing.addonTotal)}</b></div><div><span>Travel</span><b>{money(pricing.travel)}</b></div></div><div className="warnings">{pricing.warnings.map(w => <span key={w}>{w}</span>)}</div><button type="button" disabled={saving} onClick={saveJob}>{saving ? "Saving..." : form.id ? "Save Job Changes" : "Save Job / Quote"}</button><button type="button" className="secondary" onClick={generateMessage}>Generate Customer Message</button>{message && <div className="messageBox"><h3>Customer Message</h3><pre>{message}</pre></div>}</section>;
}

function ActionSheet({ close, openCustomerModal, openJobModal }) { return <div className="sheetBackdrop" onClick={close}><div className="actionSheet" onClick={e => e.stopPropagation()}><div className="sheetHandle" /><h2>Add to Apex</h2><p className="muted">Big buttons for quick iPhone entry.</p><button type="button" onClick={() => openCustomerModal()}>＋ Add Customer</button><button type="button" onClick={() => openJobModal({ mode: "quote" })}>＋ New Quote / Booking</button><button type="button" onClick={() => openJobModal({ mode: "past" })}>＋ Completed Past Job + Photos</button><button type="button" className="secondary" onClick={close}>Cancel</button></div></div>; }
function Modal({ children, close }) { return <div className="modalBackdrop"><div className="modalPanel"><button type="button" className="closeButton" onClick={close}>×</button>{children}</div></div>; }
function JobCard({ job, openJobModal, updateJobStatus, deleteJob }) { return <article className="card jobCard"><div className="cardHeader"><div><h3>{job.customerName} — {job.vehicle}</h3><p className="muted">{job.packageName || "Package"} • {money(job.total)} {job.serviceDate ? `• Done ${job.serviceDate}` : ""} {job.bookingDate ? `• Booked ${job.bookingDate} ${job.bookingTime || ""}` : ""}</p></div><span className="badge">{job.status || "Quote Sent"}</span></div><div className="chips">{(job.addonNames || []).map(name => <span key={name}>{name}</span>)}{job.rego && <span>Rego {job.rego}</span>}{(job.photos || []).length > 0 && <span>{job.photos.length} photo(s)</span>}{job.blackDuckCovers && <span>Black Duck covers</span>}{job.workVehicle && <span>Work vehicle</span>}</div><Select label="Update Status" value={job.status || "Quote Sent"} onChange={v => updateJobStatus(job, v)} options={statuses.map(status => [status, status])} />{(job.photos || []).length > 0 && <PhotoGrid photos={job.photos} />}{job.notes && <p className="muted">Notes: {job.notes}</p>}<div className="buttonRow"><button type="button" className="secondary" onClick={() => openJobModal({ job })}>Edit</button><button type="button" className="dangerGhost" onClick={() => deleteJob(job.id)}>Delete</button></div></article>; }
function CompactJob({ job }) { return <div className="compactJob"><div><strong>{job.customerName}</strong><span>{job.vehicle} • {job.status}</span></div><b>{money(job.total)}</b></div>; }
function PhotoGrid({ photos }) { return <div className="photos">{photos.map((photo, index) => <figure key={`${photo.url}-${index}`}><img src={photo.url} alt={photo.name || "Job photo"} /><figcaption>{photo.category || "photo"}</figcaption></figure>)}</div>; }
function Stat({ label, value }) { return <div className="stat"><strong>{value}</strong><span>{label}</span></div>; }
function Input({ label, value, onChange, type = "text", placeholder = "", inputMode }) { return <label className="field"><span>{label}</span><input type={type} value={value || ""} placeholder={placeholder} inputMode={inputMode} onChange={e => onChange(e.target.value)} /></label>; }
function Select({ label, value, onChange, options }) { return <label className="field"><span>{label}</span><select value={value || ""} onChange={e => onChange(e.target.value)}>{options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label>; }
function Textarea({ label, value, onChange, placeholder }) { return <label className="field"><span>{label}</span><textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} /></label>; }
function Check({ label, checked, onChange }) { return <label className="checkRow"><input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} /><span>{label}</span></label>; }

createRoot(document.getElementById("root")).render(<App />);
