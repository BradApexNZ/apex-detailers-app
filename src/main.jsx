import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  addDoc, collection, deleteDoc, doc,
  onSnapshot, serverTimestamp, updateDoc
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db, storage } from "./firebase";
import "./styles.css";

const BRAD_UID = "FqDrn1aPFHXUB5ogb2rN9D7mRG42";

// ─── Data ────────────────────────────────────────────────────────────────────

const packages = {
  express: { name: "Express Refresh", price: 79 },
  deep:    { name: "Deep Interior Detail", price: 159 },
  full:    { name: "Full Detail", price: 229 },
  tradie:  { name: "Tradie Reset", price: 199 },
  seats:   { name: "Seats Out Reset", price: 349 }
};

const addons = [
  { id: "engine",     name: "Engine Bay Detail",           price: 79 },
  { id: "petHair",    name: "Pet Hair Removal",             price: 39 },
  { id: "odour",      name: "Odour Treatment",              price: 49 },
  { id: "sand",       name: "Heavy Sand Removal",           price: 35 },
  { id: "mud",        name: "Excessive Mud Removal",        price: 35 },
  { id: "stains",     name: "Stain Treatment",              price: 25 },
  { id: "childSeat",  name: "Child Seat Removal/Reinstall", price: 20 }
  // Headlight Restoration removed — service not ready yet
];

const familyPrices  = { express: 60, deep: 120, full: 180, tradie: 160, seats: 350 };
const startupPrices = { express: 50, deep:  90, full: 140, tradie: 150, seats: 350 };

const statuses = [
  "Lead", "Quote Requested", "Quote Sent", "Approved", "Booked",
  "Confirmed", "In Progress", "Completed",
  "Prepare Hnry Invoice", "Invoice Sent", "Paid",
  "Review Request Sent", "Archived"
];

const pipelineStatuses  = ["Quote Sent", "Booked", "In Progress", "Completed", "Prepare Hnry Invoice", "Invoice Sent", "Paid"];
const paymentStatuses   = ["Completed", "Prepare Hnry Invoice", "Invoice Sent", "Paid", "Review Request Sent"];

const customerTypes  = [
  ["standard", "Standard Customer"],
  ["friend",   "Friend — 10% off"],
  ["family",   "Immediate Family Pricing"],
  ["startup",  "Close Family / Startup Support"],
  ["fleet",    "Fleet / Commercial"]
];
const contactMethods = [
  ["text",     "Text"],
  ["phone",    "Phone"],
  ["email",    "Email"],
  ["facebook", "Facebook / Messenger"],
  ["any",      "Any"]
];
const vehicleTypes = [
  ["small",     "Sedan / Hatch"],
  ["suv",       "SUV / Wagon"],
  ["singlecab", "Single-Cab Ute"],
  ["doublecab", "Double-Cab Ute"],
  ["large",     "7-Seater / Large SUV"],
  ["van",       "Van / Oversized Vehicle"],
  ["machinery", "Machinery / Commercial"]
];
const photoCategories = [
  ["before",   "Before photos"],
  ["after",    "After photos"],
  ["damage",   "Damage / concern photos"],
  ["stains",   "Stain photos"],
  ["customer", "Customer-supplied photos"],
  ["receipt",  "Invoice / receipt photos"]
];

// 7 nav items now (added Vouchers)
const navItems = [
  ["dashboard", "Home",      "⌂"],
  ["customers", "Customers", "◌"],
  ["jobs",      "Jobs",      "◆"],
  ["bookings",  "Bookings",  "◷"],
  ["payments",  "Hnry",      "$"],
  ["media",     "Photos",    "▣"],
  ["vouchers",  "Vouchers",  "✦"]
];

const hnryStages = [
  "Create Quote", "Convert to Booking", "Mark Complete",
  "Prepare Hnry Invoice", "Invoice Sent", "Paid", "Review Request Sent"
];

// Status badge colour classes
const statusColour = status => {
  if (["Paid", "Review Request Sent"].includes(status)) return "badge-success";
  if (["In Progress", "Confirmed"].includes(status))    return "badge-active";
  if (["Booked"].includes(status))                      return "badge-booked";
  if (["Completed", "Prepare Hnry Invoice", "Invoice Sent"].includes(status)) return "badge-hnry";
  if (["Archived"].includes(status))                    return "badge-muted";
  return ""; // yellow default
};

// ─── Blank forms ─────────────────────────────────────────────────────────────

const emptyCustomer = {
  firstName: "", lastName: "", businessName: "",
  phone: "", email: "", address: "", area: "",
  preferredContact: "text", customerType: "standard", notes: ""
};

const emptyJob = {
  mode: "quote", customerId: "", customerName: "",
  phone: "", email: "", address: "", area: "",
  preferredContact: "text", customerType: "standard",
  vehicleYear: "", vehicleMake: "", vehicleModel: "",
  rego: "", colour: "", vehicleType: "small",
  workVehicle: false, fleetVehicle: false, blackDuckCovers: false,
  petHair: false, heavyStains: false,
  sandMudLevel: "normal", condition: "normal",
  packageId: "express", selectedAddons: [],
  travel: 0, manualTotal: "", paidAmount: "",
  bookingDate: "", bookingTime: "", serviceDate: "",
  invoiceNumber: "", paymentDueDate: "",
  reviewRequestSent: false, hnryNotes: "",
  status: "Quote Sent", photoCategory: "before", photos: [], notes: ""
};

const emptyVoucher = {
  code: "", customerName: "", phone: "", vehicle: "",
  originalJobDate: "", originalService: "", value: 25,
  expiryDate: "", used: false, usedDate: "",
  referralCustomer: "", referralCreditStatus: "pending", notes: ""
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const money = value => "$" + Number(value || 0).toFixed(0);
const todayInput = () => new Date().toISOString().slice(0, 10);

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" });
}

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
  return [job.vehicleYear, job.vehicleMake, job.vehicleModel]
    .filter(Boolean).join(" ").trim() || job.vehicle || "Vehicle not added";
}

function addonNames(job) {
  return job.addonNames?.length
    ? job.addonNames
    : addons.filter(a => (job.selectedAddons || []).includes(a.id)).map(a => a.name);
}

function calculatePricing(form) {
  let base = packages[form.packageId]?.price || packages.express.price;
  if (form.customerType === "friend")  base = Math.round(base * 0.9);
  if (form.customerType === "family")  base = familyPrices[form.packageId]  || base;
  if (form.customerType === "startup") base = startupPrices[form.packageId] || base;

  let vehicleAdj = 0;
  if (form.vehicleType === "suv")       vehicleAdj = 15;
  if (form.vehicleType === "doublecab") vehicleAdj = 25;
  if (form.vehicleType === "large")     vehicleAdj = 40;
  if (form.vehicleType === "van")       vehicleAdj = 60;
  if (form.vehicleType === "machinery") vehicleAdj = 120;
  if (form.packageId === "tradie" && form.vehicleType === "singlecab") vehicleAdj = 0;
  if (form.packageId === "tradie" && form.vehicleType === "doublecab") vehicleAdj = 30;
  if (form.packageId === "tradie" && form.vehicleType === "van")       vehicleAdj = 70;

  let conditionAdj = 0;
  if (form.condition === "dirty")    conditionAdj = 30;
  if (form.condition === "heavily")  conditionAdj = 70;
  if (form.sandMudLevel === "moderate") conditionAdj += 20;
  if (form.sandMudLevel === "heavy")    conditionAdj += 45;
  if (form.petHair)    conditionAdj += 25;
  if (form.heavyStains) conditionAdj += 25;

  const addonTotal = addons
    .filter(a => (form.selectedAddons || []).includes(a.id))
    .reduce((sum, a) => sum + a.price, 0);

  const travel = Number(form.travel || 0);
  const calculatedTotal = base + vehicleAdj + conditionAdj + addonTotal + travel;
  const manualTotal = Number(form.manualTotal || 0);
  const total = manualTotal > 0 ? manualTotal : calculatedTotal;

  const warnings = ["Access to an outside tap is required."];
  if (manualTotal > 0) warnings.unshift("Manual total is overriding the calculator.");
  if (form.condition === "heavily") warnings.unshift("Inspect heavily soiled vehicle before final quote.");
  if (["large", "van", "machinery"].includes(form.vehicleType))
    warnings.unshift("Large/oversized vehicle — final pricing may vary.");
  if (form.packageId === "tradie")
    warnings.unshift("Tradie Reset starts from base pricing; larger vehicles may vary.");

  return { base, vehicleAdj, conditionAdj, addonTotal, travel, calculatedTotal, total, warnings };
}

// ─── Message generators ───────────────────────────────────────────────────────

function quoteMessage(job, pricing) {
  const names = addonNames(job);
  return [
    `Hey ${job.customerName || "there"}, thanks for reaching out to Apex Detailers.`,
    "",
    `For your ${vehicleName(job)}, I can do the ${packages[job.packageId]?.name || "detailing"} package for an estimated total of ${money(pricing.total)}.`,
    names.length ? `Add-ons included: ${names.join(", ")}.` : "",
    job.bookingDate
      ? `Booking requested: ${formatDate(job.bookingDate)}${job.bookingTime ? " at " + job.bookingTime : ""}.`
      : "",
    "",
    "Final pricing may vary if the vehicle is heavily soiled or larger than expected. Access to an outside tap is required.",
    "",
    "Cheers,\nApex Detailers"
  ].filter(line => line !== null).join("\n").replace(/\n{3,}/g, "\n\n");
}

function bookingConfirmationMessage(job) {
  return [
    `Hi ${job.customerName || "there"}, your booking with Apex Detailers is confirmed!`,
    "",
    `Date: ${formatDate(job.bookingDate)}${job.bookingTime ? " at " + job.bookingTime : ""}`,
    `Vehicle: ${vehicleName(job)}`,
    `Service: ${job.packageName || packages[job.packageId]?.name || "Detailing service"}`,
    `Address: ${job.address}${job.area ? ", " + job.area : ""}`,
    "",
    "Please make sure an outside tap is accessible. If you need to reschedule, just let me know.",
    "",
    "See you then!\nApex Detailers"
  ].join("\n");
}

function dayBeforeReminderMessage(job) {
  return [
    `Hi ${job.customerName || "there"}, just a quick reminder that your Apex Detailers appointment is tomorrow!`,
    "",
    `Date: ${formatDate(job.bookingDate)}${job.bookingTime ? " at " + job.bookingTime : ""}`,
    `Vehicle: ${vehicleName(job)}`,
    `Address: ${job.address}${job.area ? ", " + job.area : ""}`,
    "",
    "Please ensure an outside tap is accessible and remove any valuables from the vehicle.",
    "",
    "Looking forward to it!\nApex Detailers"
  ].join("\n");
}

function reviewMessage(job) {
  return `Hey ${job.customerName || "there"}, thanks again for choosing Apex Detailers for your ${vehicleName(job)}. If you're happy with the result, a quick review or recommendation would mean a lot and really helps a new local business grow. Cheers, Apex Detailers`;
}

function hnryBrief(job) {
  const names = addonNames(job);
  return [
    "HNRY INVOICE HANDOFF — APEX DETAILERS",
    `Customer: ${job.customerName || ""}`,
    `Phone: ${job.phone || ""}`,
    `Email: ${job.email || ""}`,
    `Address: ${job.address || ""}${job.area ? ", " + job.area : ""}`,
    `Vehicle: ${vehicleName(job)}`,
    `Rego: ${job.rego || ""}`,
    `Service date: ${job.serviceDate || todayInput()}`,
    `Package: ${job.packageName || packages[job.packageId]?.name || "Detailing service"}`,
    names.length ? `Add-ons: ${names.join(", ")}` : "Add-ons: None",
    `Total to invoice: ${money(job.total || calculatePricing(job).total)}`,
    job.invoiceNumber ? `Invoice/reference: ${job.invoiceNumber}` : "Invoice/reference: Add in Hnry",
    job.paymentDueDate ? `Payment due: ${job.paymentDueDate}` : "Payment due: Set in Hnry",
    "Payment destination: Hnry Account",
    "Apex HQ is the job record. Hnry handles official invoicing, payment collection and tax.",
    job.notes     ? `Job notes: ${job.notes}`   : "Job notes: None",
    job.hnryNotes ? `Hnry notes: ${job.hnryNotes}` : "Hnry notes: None"
  ].join("\n");
}

// ─── Login ────────────────────────────────────────────────────────────────────

function LoginScreen({ loading, error, onLogin }) {
  const [email, setEmail]       = useState("Brad@apexdetailers.co.nz");
  const [password, setPassword] = useState("");
  function submit(e) { e.preventDefault(); onLogin(email, password); }
  return (
    <div className="appShell loginShell">
      <main className="appMain loginMain">
        <section className="heroCard loginHero">
          <BrandMark />
          <div>
            <span className="eyebrow">Apex HQ V4</span>
            <h2>Sign in to your detailing command centre.</h2>
            <p>Private access for Apex Detailers jobs, quotes, bookings, customer details, photo records and Hnry handoffs.</p>
          </div>
        </section>
        <form className="card loginCard" onSubmit={submit}>
          <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="Brad@apexdetailers.co.nz" />
          <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="Firebase password" />
          <button type="submit" disabled={loading}>{loading ? "Signing in…" : "Log in"}</button>
          {error && <p className="formAlert" role="alert">{error}</p>}
          <p className="muted">Use the Firebase Authentication user created for Apex Detailers.</p>
        </form>
      </main>
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────

function App() {
  const [authUser, setAuthUser]     = useState(null);
  const [authReady, setAuthReady]   = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [tab, setTab]               = useState("dashboard");
  const [customers, setCustomers]   = useState([]);
  const [jobs, setJobs]             = useState([]);
  const [vouchers, setVouchers]     = useState([]);

  const [customerForm, setCustomerForm] = useState(emptyCustomer);
  const [jobForm, setJobForm]           = useState(emptyJob);
  const [voucherForm, setVoucherForm]   = useState(emptyVoucher);

  const [modal, setModal]           = useState(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState("");
  const [message, setMessage]       = useState("");

  const pricing = useMemo(() => calculatePricing(jobForm), [jobForm]);
  const isBrad  = authUser?.uid === BRAD_UID;

  // Auth listener
  useEffect(() => onAuthStateChanged(auth, user => {
    if (user && user.uid !== BRAD_UID) {
      setLoginError("This Firebase user is not authorised for Apex Detailers.");
      signOut(auth);
      setAuthUser(null);
    } else {
      setAuthUser(user);
      if (user) setLoginError("");
    }
    setAuthReady(true);
  }), []);

  // Firestore listeners
  useEffect(() => {
    if (!isBrad) return undefined;
    const stopCustomers = onSnapshot(collection(db, "customers"), snap =>
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => displayCustomerName(a).localeCompare(displayCustomerName(b)))));
    const stopJobs = onSnapshot(collection(db, "jobs"), snap =>
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))));
    const stopVouchers = onSnapshot(collection(db, "vouchers"), snap =>
      setVouchers(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))));
    return () => { stopCustomers(); stopJobs(); stopVouchers(); };
  }, [isBrad]);

  // Derived data
  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(c =>
      [displayCustomerName(c), c.phone, c.email, c.address, c.area, c.notes]
        .join(" ").toLowerCase().includes(term));
  }, [customers, search]);

  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return jobs;
    return jobs.filter(j =>
      [j.customerName, j.phone, j.email, j.vehicle, j.rego, j.status, j.packageName, j.notes, j.hnryNotes]
        .join(" ").toLowerCase().includes(term));
  }, [jobs, search]);

  const bookedJobs     = jobs.filter(j => j.bookingDate && !paymentStatuses.includes(j.status) && j.status !== "Archived");
  const completedJobs  = jobs.filter(j => paymentStatuses.includes(j.status));
  const paidRevenue    = jobs.reduce((sum, j) => sum + Number(j.paidAmount || (["Paid", "Review Request Sent"].includes(j.status) ? j.total : 0) || 0), 0);
  const photoCount     = jobs.reduce((sum, j) => sum + (j.photos || []).length, 0);
  const customerJobs   = id => jobs.filter(j => j.customerId === id);

  // Auth actions
  async function handleLogin(email, password) {
    setLoginLoading(true); setLoginError("");
    try { await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch { setLoginError("Login failed. Check the email/password in Firebase Authentication."); }
    setLoginLoading(false);
  }
  async function handleLogout() {
    await signOut(auth);
    setCustomers([]); setJobs([]); setVouchers([]);
    setSearch(""); setTab("dashboard"); setModal(null); setActionOpen(false);
  }

  // Modal openers
  function openCustomerModal(customer = null) {
    setActionOpen(false); setMessage("");
    setCustomerForm(customer ? { ...emptyCustomer, ...customer } : emptyCustomer);
    setModal(customer ? "editCustomer" : "addCustomer");
  }
  function openJobModal({ mode = "quote", customer = null, job = null } = {}) {
    setActionOpen(false); setMessage("");
    if (job) {
      setJobForm({
        ...emptyJob, ...job,
        mode: job.mode || "quote",
        selectedAddons: job.selectedAddons || [],
        photos: job.photos || [],
        manualTotal: job.manualTotal || "",
        paidAmount: job.paidAmount || "",
        paymentDueDate: job.paymentDueDate || "",
        reviewRequestSent: !!job.reviewRequestSent,
        hnryNotes: job.hnryNotes || "",
        photoCategory: "before"
      });
      setModal("editJob");
      return;
    }
    setJobForm({
      ...emptyJob, mode,
      status: mode === "past" ? "Completed" : mode === "booking" ? "Booked" : "Quote Sent",
      serviceDate: mode === "past" ? todayInput() : "",
      customerId: customer?.id || "",
      customerName: customer ? displayCustomerName(customer) : "",
      phone: customer?.phone || "",
      email: customer?.email || "",
      address: customer?.address || "",
      area: customer?.area || "",
      preferredContact: customer?.preferredContact || "text",
      customerType: customer?.customerType || "standard"
    });
    setModal("addJob");
  }
  function openVoucherModal(voucher = null) {
    setActionOpen(false);
    setVoucherForm(voucher ? { ...emptyVoucher, ...voucher } : {
      ...emptyVoucher,
      code: `APEX${new Date().getFullYear().toString().slice(-2)}-${String(vouchers.length + 1).padStart(3, "0")}`,
      expiryDate: addDays(todayInput(), 90)
    });
    setModal(voucher ? "editVoucher" : "addVoucher");
  }

  function quickAdd() {
    if (tab === "customers") openCustomerModal();
    else if (tab === "media") openJobModal({ mode: "past" });
    else if (tab === "vouchers") openVoucherModal();
    else setActionOpen(true);
  }

  function selectCustomerForJob(customerId) {
    const c = customers.find(r => r.id === customerId);
    if (!c) return setJobForm(p => ({ ...p, customerId }));
    setJobForm(p => ({
      ...p, customerId,
      customerName: displayCustomerName(c),
      phone: c.phone || "", email: c.email || "",
      address: c.address || "", area: c.area || "",
      preferredContact: c.preferredContact || "text",
      customerType: c.customerType || "standard"
    }));
  }

  function handlePhotos(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const next = files.map(file => ({
      file, name: file.name,
      category: jobForm.photoCategory,
      preview: URL.createObjectURL(file)
    }));
    setJobForm(p => ({ ...p, photos: [...(p.photos || []), ...next] }));
    e.target.value = "";
  }

  // Save actions
  async function saveCustomer() {
    if (displayCustomerName(customerForm) === "Unnamed Customer")
      return alert("Add a customer name or business name first.");
    setSaving(true);
    try {
      const payload = { ...customerForm, ownerUid: BRAD_UID, updatedAt: serverTimestamp() };
      if (customerForm.id) await updateDoc(doc(db, "customers", customerForm.id), payload);
      else await addDoc(collection(db, "customers"), { ...payload, createdAt: serverTimestamp() });
      setCustomerForm(emptyCustomer); setModal(null);
    } catch (err) { console.error(err); alert("Save failed. Check Firebase rules."); }
    setSaving(false);
  }

  async function ensureCustomerForJob() {
    if (jobForm.customerId) return jobForm.customerId;
    const parts = splitName(jobForm.customerName);
    const newC = await addDoc(collection(db, "customers"), {
      firstName: parts.firstName, lastName: parts.lastName,
      businessName: "", phone: jobForm.phone, email: jobForm.email,
      address: jobForm.address, area: jobForm.area,
      preferredContact: jobForm.preferredContact,
      customerType: jobForm.customerType,
      notes: "Created from job entry.",
      ownerUid: BRAD_UID,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    return newC.id;
  }

  async function saveJob() {
    if (!jobForm.customerName) return alert("Add or choose a customer first.");
    if (vehicleName(jobForm) === "Vehicle not added") return alert("Add the vehicle year/make/model first.");
    setSaving(true);
    try {
      const customerId = await ensureCustomerForJob();
      const uploadedPhotos = [];
      for (const photo of jobForm.photos || []) {
        if (photo.url && !photo.file) { uploadedPhotos.push(photo); continue; }
        const safeName = String(photo.name || "photo").replace(/[^a-z0-9._-]/gi, "-");
        const path = `jobs/${customerId}/${Date.now()}-${safeName}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, photo.file);
        uploadedPhotos.push({
          name: photo.name, category: photo.category || "before",
          url: await getDownloadURL(storageRef), path
        });
      }
      const names = addonNames(jobForm);
      const payload = {
        ...jobForm, customerId, ownerUid: BRAD_UID,
        vehicle: vehicleName(jobForm),
        packageName: packages[jobForm.packageId]?.name || "Custom Package",
        addonNames: names, pricing, total: pricing.total,
        paidAmount: Number(jobForm.paidAmount || 0),
        photos: uploadedPhotos, updatedAt: serverTimestamp()
      };
      delete payload.photoCategory;
      if (jobForm.id) await updateDoc(doc(db, "jobs", jobForm.id), payload);
      else await addDoc(collection(db, "jobs"), { ...payload, createdAt: serverTimestamp() });
      await updateDoc(doc(db, "customers", customerId), {
        phone: jobForm.phone, email: jobForm.email,
        address: jobForm.address, area: jobForm.area,
        preferredContact: jobForm.preferredContact,
        customerType: jobForm.customerType,
        lastVehicle: vehicleName(jobForm),
        lastJobStatus: jobForm.status,
        ownerUid: BRAD_UID, updatedAt: serverTimestamp()
      });
      setJobForm(emptyJob); setModal(null);
      setTab(paymentStatuses.includes(jobForm.status) ? "payments" : jobForm.mode === "booking" ? "bookings" : "jobs");
    } catch (err) { console.error(err); alert("Job save failed. Check Firebase rules and Storage rules."); }
    setSaving(false);
  }

  async function saveVoucher() {
    if (!voucherForm.code) return alert("Add a voucher code first.");
    setSaving(true);
    try {
      const payload = { ...voucherForm, ownerUid: BRAD_UID, updatedAt: serverTimestamp() };
      if (voucherForm.id) await updateDoc(doc(db, "vouchers", voucherForm.id), payload);
      else await addDoc(collection(db, "vouchers"), { ...payload, createdAt: serverTimestamp() });
      setVoucherForm(emptyVoucher); setModal(null);
    } catch (err) { console.error(err); alert("Voucher save failed."); }
    setSaving(false);
  }

  async function updateJobStatus(job, status) {
    const update = { status, updatedAt: serverTimestamp() };
    if (status === "Paid") update.paidAmount = Number(job.paidAmount || job.total || 0);
    if (status === "Review Request Sent") update.reviewRequestSent = true;
    await updateDoc(doc(db, "jobs", job.id), update);
  }

  async function deleteJob(id)      { if (confirm("Delete this job/quote?")) await deleteDoc(doc(db, "jobs", id)); }
  async function deleteCustomer(id) { if (confirm("Delete this customer? Old jobs will stay saved.")) await deleteDoc(doc(db, "customers", id)); }
  async function deleteVoucher(id)  { if (confirm("Delete this voucher?")) await deleteDoc(doc(db, "vouchers", id)); }

  function generateMessage(kind = "quote") {
    if (kind === "invoice")      return setMessage(hnryBrief({ ...jobForm, packageName: packages[jobForm.packageId]?.name, total: pricing.total }));
    if (kind === "review")       return setMessage(reviewMessage(jobForm));
    if (kind === "confirmation") return setMessage(bookingConfirmationMessage(jobForm));
    if (kind === "reminder")     return setMessage(dayBeforeReminderMessage(jobForm));
    setMessage(quoteMessage(jobForm, pricing));
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!authReady)
    return <div className="appShell"><main className="appMain"><section className="card loadingCard"><BrandMark /><h2>Loading Apex HQ…</h2></section></main></div>;

  if (!isBrad)
    return <LoginScreen loading={loginLoading} error={loginError} onLogin={handleLogin} />;

  return (
    <div className="appShell">
      <header className="appHeader">
        <div className="brandHeader">
          <BrandMark />
          <div className="wordmark">
            <h1>Apex Detailers</h1>
            <p>Apex HQ V4</p>
          </div>
        </div>
        <button type="button" className="logoutButton" onClick={handleLogout} aria-label="Log out">Logout</button>
      </header>

      <main className="appMain">
        <section className="heroCard heroV3">
          <div className="heroCopy">
            <span className="eyebrow">Apex HQ V4</span>
            <h2>Premium detailing command centre.</h2>
            <p>Fast quotes, clean bookings, customer history, job photos and Hnry-ready invoice handoffs.</p>
            <div className="heroPills" aria-label="Apex HQ highlights">
              <span>Fast quote flow</span>
              <span>Hnry handoff</span>
              <span>Photo records</span>
              <span>Voucher tracker</span>
            </div>
          </div>
          <button type="button" className="miniAdd" onClick={() => setActionOpen(true)}>＋ Add Job</button>
        </section>

        {tab !== "dashboard" && (
          <label className="searchBox">
            <span>Search</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, rego, phone, vehicle…" />
          </label>
        )}

        {tab === "dashboard" && (
          <Dashboard
            customers={customers} jobs={jobs} bookedJobs={bookedJobs}
            completedJobs={completedJobs} paidRevenue={paidRevenue}
            photoCount={photoCount} vouchers={vouchers}
            openCustomerModal={openCustomerModal} openJobModal={openJobModal}
            setTab={setTab}
          />
        )}
        {tab === "customers" && (
          <CustomersTab
            customers={filteredCustomers} customerJobs={customerJobs}
            openCustomerModal={openCustomerModal} openJobModal={openJobModal}
            deleteCustomer={deleteCustomer}
          />
        )}
        {tab === "jobs" && (
          <JobsTab
            title="Jobs & Quotes" jobs={filteredJobs}
            openJobModal={openJobModal} updateJobStatus={updateJobStatus} deleteJob={deleteJob}
          />
        )}
        {tab === "bookings" && (
          <JobsTab
            title="Upcoming Bookings"
            jobs={bookedJobs.sort((a, b) => String(a.bookingDate).localeCompare(String(b.bookingDate)))}
            openJobModal={openJobModal} updateJobStatus={updateJobStatus} deleteJob={deleteJob}
          />
        )}
        {tab === "payments" && (
          <HnryTab jobs={jobs} openJobModal={openJobModal} updateJobStatus={updateJobStatus} />
        )}
        {tab === "media" && (
          <MediaTab jobs={jobs} openJobModal={openJobModal} />
        )}
        {tab === "vouchers" && (
          <VouchersTab
            vouchers={vouchers} openVoucherModal={openVoucherModal} deleteVoucher={deleteVoucher}
          />
        )}
      </main>

      <button type="button" className="fab" aria-label="Quick add" onClick={quickAdd}>＋</button>

      <nav className="bottomNav" aria-label="Primary navigation">
        {navItems.map(([id, label, icon]) => (
          <button
            key={id} type="button"
            onClick={() => setTab(id)}
            className={tab === id ? "active" : ""}
            aria-current={tab === id ? "page" : undefined}
          >
            <span className="navIcon" aria-hidden="true">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {actionOpen && (
        <ActionSheet close={() => setActionOpen(false)} openCustomerModal={openCustomerModal} openJobModal={openJobModal} openVoucherModal={openVoucherModal} />
      )}

      {modal && (
        <Modal close={() => setModal(null)}>
          {(modal === "addCustomer" || modal === "editCustomer") && (
            <CustomerForm
              form={customerForm}
              updateForm={(k, v) => setCustomerForm(p => ({ ...p, [k]: v }))}
              saving={saving} saveCustomer={saveCustomer}
            />
          )}
          {(modal === "addJob" || modal === "editJob") && (
            <JobForm
              form={jobForm} customers={customers} pricing={pricing}
              saving={saving} message={message}
              updateForm={(k, v) => setJobForm(p => ({ ...p, [k]: v }))}
              toggleAddon={id => setJobForm(p => ({
                ...p,
                selectedAddons: (p.selectedAddons || []).includes(id)
                  ? p.selectedAddons.filter(x => x !== id)
                  : [...(p.selectedAddons || []), id]
              }))}
              selectCustomerForJob={selectCustomerForJob}
              handlePhotos={handlePhotos}
              removePhoto={i => setJobForm(p => ({ ...p, photos: (p.photos || []).filter((_, idx) => idx !== i) }))}
              saveJob={saveJob} generateMessage={generateMessage}
            />
          )}
          {(modal === "addVoucher" || modal === "editVoucher") && (
            <VoucherForm
              form={voucherForm}
              updateForm={(k, v) => setVoucherForm(p => ({ ...p, [k]: v }))}
              saving={saving} saveVoucher={saveVoucher}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ customers, jobs, bookedJobs, completedJobs, paidRevenue, photoCount, vouchers, openCustomerModal, openJobModal, setTab }) {
  const todayJobs     = bookedJobs.filter(j => j.bookingDate === todayInput());
  const tomorrowJobs  = bookedJobs.filter(j => j.bookingDate === addDays(todayInput(), 1));
  const pendingQuotes = jobs.filter(j => ["Lead", "Quote Requested", "Quote Sent", "Approved"].includes(j.status || "Quote Sent")).length;
  const activeJobs    = jobs.filter(j => ["Booked", "Confirmed", "In Progress"].includes(j.status || "")).length;
  const hnryDue       = jobs.filter(j => ["Completed", "Prepare Hnry Invoice"].includes(j.status || "")).length;
  const activeVouchers = vouchers.filter(v => !v.used).length;

  const pipelineCounts = pipelineStatuses.map(status => ({
    status, count: jobs.filter(j => (j.status || "Quote Sent") === status).length
  }));

  const latestJob = jobs[0];

  return (
    <section className="dashboardPage" aria-label="Apex dashboard">

      {/* Today alert banner */}
      {(todayJobs.length > 0 || tomorrowJobs.length > 0) && (
        <div className="todayBanner">
          {todayJobs.length > 0 && (
            <div className="todayItem">
              <span className="todayLabel">TODAY</span>
              {todayJobs.map(j => (
                <span key={j.id} className="todayJob">
                  {j.customerName} — {j.vehicle} {j.bookingTime ? `at ${j.bookingTime}` : ""}
                </span>
              ))}
            </div>
          )}
          {tomorrowJobs.length > 0 && (
            <div className="todayItem">
              <span className="todayLabel">TOMORROW</span>
              {tomorrowJobs.map(j => (
                <span key={j.id} className="todayJob">
                  {j.customerName} — {j.vehicle} {j.bookingTime ? `at ${j.bookingTime}` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="commandGrid">
        <article className="commandCard mainCommand">
          <span className="eyebrow">Today's command deck</span>
          <h2>
            {todayJobs.length
              ? `${todayJobs.length} job${todayJobs.length === 1 ? "" : "s"} booked today`
              : "Ready for the next booking."}
          </h2>
          <p>
            {latestJob
              ? `Latest: ${latestJob.customerName || "Customer"} — ${latestJob.vehicle || "Vehicle"} at ${money(latestJob.total)}.`
              : "Start by adding a quote, booking, or completed job with photos."}
          </p>
          <div className="commandActions">
            <button type="button" onClick={() => openJobModal({ mode: "quote" })}>＋ New Quote</button>
            <button type="button" className="secondary" onClick={() => openJobModal({ mode: "booking" })}>＋ Booking</button>
            <button type="button" className="secondary" onClick={() => setTab("payments")}>Hnry Handoff</button>
          </div>
        </article>
        <article className="commandCard accentCommand">
          <span>Paid revenue</span>
          <strong>{money(paidRevenue)}</strong>
          <p>{completedJobs.length} completed job{completedJobs.length === 1 ? "" : "s"} saved</p>
        </article>
      </div>

      <div className="statGrid homeStats">
        <Stat label="Customers"   value={customers.length} />
        <Stat label="Open Quotes" value={pendingQuotes} />
        <Stat label="Active Jobs" value={activeJobs} />
        <Stat label="Hnry Due"    value={hnryDue} />
        <Stat label="Photos"      value={photoCount} />
        <Stat label="Vouchers"    value={activeVouchers} />
      </div>

      <div className="quickGrid actionGrid">
        <button type="button" className="actionCard" onClick={() => openCustomerModal()}>
          <span>Customer</span>
          <strong>＋ Add client details</strong>
          <em>Name, phone, address and notes</em>
        </button>
        <button type="button" className="actionCard" onClick={() => openJobModal({ mode: "quote" })}>
          <span>Quote</span>
          <strong>＋ Price a job fast</strong>
          <em>Package, condition and add-ons</em>
        </button>
        <button type="button" className="actionCard" onClick={() => setTab("payments")}>
          <span>Hnry</span>
          <strong>Prepare invoice handoff</strong>
          <em>Copy job details into Hnry</em>
        </button>
      </div>

      <article className="card pipelineCard">
        <div className="cardHeader">
          <div>
            <h3>Job pipeline</h3>
            <p className="muted">Clear status snapshots from quotes through Hnry and paid work.</p>
          </div>
        </div>
        <div className="pipelineRail">
          {pipelineCounts.map(item => (
            <div className="pipelineStep" key={item.status}>
              <strong>{item.count}</strong>
              <span>{item.status}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="card recentCard">
        <div className="cardHeader">
          <div>
            <h3>Recent work</h3>
            <p className="muted">Latest quotes, bookings and completed details.</p>
          </div>
        </div>
        {jobs.slice(0, 5).map(job => <CompactJob key={job.id} job={job} />)}
        {!jobs.length && (
          <div className="emptyMini">
            <strong>No jobs yet.</strong>
            <span>Add a quote or past job to start using Apex HQ V4.</span>
          </div>
        )}
      </article>
    </section>
  );
}

// ─── Customers tab ────────────────────────────────────────────────────────────

function CustomersTab({ customers, customerJobs, openCustomerModal, openJobModal, deleteCustomer }) {
  return (
    <section>
      <div className="sectionTitle">
        <div>
          <h2>Customers</h2>
          <p>Save contact details, notes, vehicles and repeat-work history.</p>
        </div>
      </div>
      <div className="quickGrid">
        <button type="button" onClick={() => openCustomerModal()}>＋ Add Customer</button>
        <button type="button" className="secondary" onClick={() => openJobModal({ mode: "past" })}>＋ Add Past Job + Photos</button>
      </div>
      {customers.map(customer => {
        const rows  = customerJobs(customer.id);
        const total = rows.reduce((sum, j) => sum + Number(j.total || 0), 0);
        const photos = rows.reduce((sum, j) => sum + (j.photos || []).length, 0);
        return (
          <article className="card customerCard" key={customer.id}>
            <div className="cardHeader">
              <div>
                <h3>{displayCustomerName(customer)}</h3>
                <p className="muted">
                  {customer.phone || "No phone"}
                  {customer.email ? ` • ${customer.email}` : ""}
                  {customer.area  ? ` • ${customer.area}`  : ""}
                </p>
              </div>
              <span className="badge">{rows.length} job{rows.length === 1 ? "" : "s"}</span>
            </div>
            <div className="detailList">
              {customer.address          && <span>Address: {customer.address}</span>}
              {customer.preferredContact && <span>Preferred contact: {customer.preferredContact}</span>}
              {customer.customerType !== "standard" && <span>Type: {customerTypes.find(([v]) => v === customer.customerType)?.[1] || customer.customerType}</span>}
              {customer.lastVehicle      && <span>Last vehicle: {customer.lastVehicle}</span>}
              {customer.notes            && <span>Notes: {customer.notes}</span>}
              <span>Total quoted: {money(total)}</span>
              <span>Saved photos from jobs: {photos}</span>
            </div>
            <div className="buttonRow">
              <button type="button" className="secondary" onClick={() => openJobModal({ mode: "quote", customer })}>＋ Quote</button>
              <button type="button" className="secondary" onClick={() => openJobModal({ mode: "past", customer })}>＋ Past Job + Photos</button>
              <button type="button" className="secondary" onClick={() => openCustomerModal(customer)}>Edit Details</button>
              <button type="button" className="dangerGhost" onClick={() => deleteCustomer(customer.id)}>Delete</button>
            </div>
            {rows.length > 0 && (
              <div className="detailList">
                {rows.slice(0, 3).map(j => (
                  <span key={j.id}>{j.vehicle} • {j.packageName} • {money(j.total)} • {(j.photos || []).length} photo(s)</span>
                ))}
              </div>
            )}
          </article>
        );
      })}
      {!customers.length && (
        <div className="emptyState">
          <h3>Add your first customer</h3>
          <p>Tap below to save name, phone, email, address, notes, then attach jobs and photos.</p>
          <button type="button" onClick={() => openCustomerModal()}>＋ Add Customer</button>
          <button type="button" className="secondary" onClick={() => openJobModal({ mode: "past" })}>＋ Add Past Job + Photos</button>
        </div>
      )}
    </section>
  );
}

// ─── Jobs tab ─────────────────────────────────────────────────────────────────

function JobsTab({ title, jobs, openJobModal, updateJobStatus, deleteJob }) {
  return (
    <section>
      <div className="sectionTitle">
        <div>
          <h2>{title}</h2>
          <p>Quotes, bookings, completed jobs and paid work all live here.</p>
        </div>
        <button type="button" className="smallButton" onClick={() => openJobModal({ mode: "past" })}>＋ Job</button>
      </div>
      {jobs.map(job => (
        <JobCard key={job.id} job={job} openJobModal={openJobModal} updateJobStatus={updateJobStatus} deleteJob={deleteJob} />
      ))}
      {!jobs.length && (
        <div className="emptyState">
          <h3>No jobs here yet</h3>
          <p>Tap below to add a quote, booking, or old completed job.</p>
          <button type="button" onClick={() => openJobModal({ mode: "past" })}>＋ Add Past Job + Photos</button>
        </div>
      )}
    </section>
  );
}

// ─── Hnry / Payments tab ──────────────────────────────────────────────────────

function HnryTab({ jobs, openJobModal, updateJobStatus }) {
  const handoffs = jobs.filter(j => paymentStatuses.includes(j.status || "") || Number(j.paidAmount || 0) > 0);
  return (
    <section>
      <div className="sectionTitle">
        <div>
          <h2>Payments &amp; Hnry</h2>
          <p>Apex HQ prepares the job record. Hnry handles official invoicing, payment collection and tax.</p>
        </div>
      </div>
      <article className="card">
        <div className="cardHeader">
          <div>
            <h3>Payments &amp; Tax Setup</h3>
            <p className="muted">Stage 1 manual handoff is active.</p>
          </div>
          <span className="badge">Hnry</span>
        </div>
        <div className="detailList">
          <span>Business structure: Sole trader</span>
          <span>Trading name: Apex Detailers</span>
          <span>Tax provider: Hnry</span>
          <span>Invoice method: Hnry invoice first</span>
          <span>Payment destination: Hnry Account</span>
          <span>Warning: payments outside Hnry may need manual handling.</span>
        </div>
      </article>
      <article className="card">
        <div className="cardHeader">
          <div>
            <h3>Workflow</h3>
            <p className="muted">Use these statuses to keep the money side tidy.</p>
          </div>
        </div>
        <div className="pipelineRail">
          {hnryStages.map((stage, i) => (
            <div className="pipelineStep" key={stage}>
              <strong>{i + 1}</strong>
              <span>{stage}</span>
            </div>
          ))}
        </div>
      </article>
      <article className="card">
        <div className="cardHeader">
          <div>
            <h3>Invoice handoffs</h3>
            <p className="muted">Copy these details into Hnry after a job is complete.</p>
          </div>
        </div>
        {handoffs.map(job => (
          <HnryJobCard key={job.id} job={job} openJobModal={openJobModal} updateJobStatus={updateJobStatus} />
        ))}
        {!handoffs.length && (
          <div className="emptyMini">
            <strong>No handoffs yet.</strong>
            <span>Mark a job as Completed to start the Hnry flow.</span>
          </div>
        )}
      </article>
    </section>
  );
}

function HnryJobCard({ job, openJobModal, updateJobStatus }) {
  const brief = hnryBrief(job);
  async function copyBrief() {
    try { await navigator.clipboard.writeText(brief); alert("Hnry invoice details copied."); }
    catch { alert("Copy failed. Select and copy the details manually."); }
  }
  return (
    <article className="paymentJobCard">
      <div className="cardHeader">
        <div>
          <h3>{job.customerName} — {job.vehicle}</h3>
          <p className="muted">{job.packageName || "Package"} • {money(job.total)} • {job.status || "Completed"}</p>
        </div>
        <span className={`badge ${statusColour(job.status)}`}>{job.status || "Completed"}</span>
      </div>
      <div className="messageBox invoiceBrief">
        <h3>Copy into Hnry</h3>
        <pre>{brief}</pre>
      </div>
      <div className="buttonRow">
        <button type="button" onClick={copyBrief}>Copy Hnry Details</button>
        <button type="button" className="secondary" onClick={() => updateJobStatus(job, "Prepare Hnry Invoice")}>Prepare</button>
        <button type="button" className="secondary" onClick={() => updateJobStatus(job, "Invoice Sent")}>Invoice Sent</button>
        <button type="button" className="secondary" onClick={() => updateJobStatus(job, "Paid")}>Paid</button>
        <button type="button" className="secondary" onClick={() => updateJobStatus(job, "Review Request Sent")}>Review Sent</button>
        <button type="button" className="secondary" onClick={() => openJobModal({ job })}>Edit</button>
      </div>
    </article>
  );
}

// ─── Media tab ────────────────────────────────────────────────────────────────

function MediaTab({ jobs, openJobModal }) {
  const rows = jobs.filter(j => (j.photos || []).length);
  return (
    <section>
      <div className="sectionTitle">
        <div>
          <h2>Photos</h2>
          <p>Before, after, stain, damage, receipt and customer-supplied photos.</p>
        </div>
        <button type="button" className="smallButton" onClick={() => openJobModal({ mode: "past" })}>＋ Upload</button>
      </div>
      {rows.map(job => (
        <article className="card" key={job.id}>
          <h3>{job.customerName} — {job.vehicle}</h3>
          <p className="muted">{job.packageName} • {job.status}</p>
          <PhotoGrid photos={job.photos || []} />
        </article>
      ))}
      {!rows.length && (
        <div className="emptyState">
          <h3>No photos uploaded yet</h3>
          <p>Add a past job and use the upload box to attach photos.</p>
          <button type="button" onClick={() => openJobModal({ mode: "past" })}>＋ Add Job With Photos</button>
        </div>
      )}
    </section>
  );
}

// ─── Vouchers tab ─────────────────────────────────────────────────────────────

function VouchersTab({ vouchers, openVoucherModal, deleteVoucher }) {
  const active  = vouchers.filter(v => !v.used);
  const used    = vouchers.filter(v => v.used);

  return (
    <section>
      <div className="sectionTitle">
        <div>
          <h2>Vouchers &amp; Referrals</h2>
          <p>Track return vouchers, referral credits and discount codes.</p>
        </div>
        <button type="button" className="smallButton" onClick={() => openVoucherModal()}>＋ Voucher</button>
      </div>

      <div className="statGrid" style={{ marginBottom: 14 }}>
        <Stat label="Active"    value={active.length} />
        <Stat label="Used"      value={used.length} />
        <Stat label="Total"     value={vouchers.length} />
        <Stat label="Value out" value={money(active.reduce((s, v) => s + Number(v.value || 0), 0))} />
      </div>

      {active.length > 0 && (
        <>
          <h3 style={{ marginBottom: 10, fontSize: 16 }}>Active vouchers</h3>
          {active.map(v => <VoucherCard key={v.id} voucher={v} openVoucherModal={openVoucherModal} deleteVoucher={deleteVoucher} />)}
        </>
      )}

      {used.length > 0 && (
        <>
          <h3 style={{ marginBottom: 10, marginTop: 20, fontSize: 16, color: "var(--muted)" }}>Used vouchers</h3>
          {used.map(v => <VoucherCard key={v.id} voucher={v} openVoucherModal={openVoucherModal} deleteVoucher={deleteVoucher} />)}
        </>
      )}

      {!vouchers.length && (
        <div className="emptyState">
          <h3>No vouchers yet</h3>
          <p>Create return vouchers or referral codes to reward loyal customers.</p>
          <button type="button" onClick={() => openVoucherModal()}>＋ Add Voucher</button>
        </div>
      )}
    </section>
  );
}

function VoucherCard({ voucher, openVoucherModal, deleteVoucher }) {
  return (
    <article className="card voucherCard">
      <div className="cardHeader">
        <div>
          <h3>{voucher.code}</h3>
          <p className="muted">
            {voucher.customerName || "No customer"} • {money(voucher.value)} value
            {voucher.expiryDate ? ` • Expires ${formatDate(voucher.expiryDate)}` : ""}
          </p>
        </div>
        <span className={`badge ${voucher.used ? "badge-muted" : "badge-success"}`}>
          {voucher.used ? "Used" : "Active"}
        </span>
      </div>
      <div className="detailList">
        {voucher.vehicle           && <span>Vehicle: {voucher.vehicle}</span>}
        {voucher.originalService   && <span>Original service: {voucher.originalService}</span>}
        {voucher.originalJobDate   && <span>Job date: {formatDate(voucher.originalJobDate)}</span>}
        {voucher.referralCustomer  && <span>Referral: {voucher.referralCustomer} ({voucher.referralCreditStatus})</span>}
        {voucher.notes             && <span>Notes: {voucher.notes}</span>}
        {voucher.used && voucher.usedDate && <span>Used on: {formatDate(voucher.usedDate)}</span>}
      </div>
      <div className="buttonRow">
        <button type="button" className="secondary" onClick={() => openVoucherModal(voucher)}>Edit</button>
        <button type="button" className="dangerGhost" onClick={() => deleteVoucher(voucher.id)}>Delete</button>
      </div>
    </article>
  );
}

// ─── Forms ────────────────────────────────────────────────────────────────────

function CustomerForm({ form, updateForm, saving, saveCustomer }) {
  return (
    <section>
      <h2>{form.id ? "Edit Customer" : "Add Customer"}</h2>
      <p className="muted">Add name, phone, email, address, area, contact preference and notes.</p>
      <div className="formGrid">
        <Input label="First Name" value={form.firstName} onChange={v => updateForm("firstName", v)} />
        <Input label="Last Name"  value={form.lastName}  onChange={v => updateForm("lastName", v)} />
      </div>
      <Input label="Business Name / Fleet Name" value={form.businessName} onChange={v => updateForm("businessName", v)} />
      <Input label="Phone" value={form.phone} onChange={v => updateForm("phone", v)} inputMode="tel" />
      <Input label="Email" value={form.email} onChange={v => updateForm("email", v)} type="email" />
      <Input label="Street / Address" value={form.address} onChange={v => updateForm("address", v)} />
      <Input label="Area / Suburb" value={form.area} onChange={v => updateForm("area", v)} placeholder="Napier, Hastings, Poraiti…" />
      <div className="formGrid">
        <Select label="Preferred Contact" value={form.preferredContact} onChange={v => updateForm("preferredContact", v)} options={contactMethods} />
        <Select label="Customer Type"     value={form.customerType}     onChange={v => updateForm("customerType", v)}     options={customerTypes} />
      </div>
      <Textarea label="Customer Notes" value={form.notes} onChange={v => updateForm("notes", v)} placeholder="Access notes, regular customer, dog hair, fleet account, anything useful…" />
      <button type="button" disabled={saving} onClick={saveCustomer}>
        {saving ? "Saving…" : form.id ? "Save Customer Changes" : "Save Customer"}
      </button>
    </section>
  );
}

function JobForm({ form, customers, pricing, saving, message, updateForm, toggleAddon, selectCustomerForJob, handlePhotos, removePhoto, saveJob, generateMessage }) {
  return (
    <section>
      <h2>{form.id ? "Edit Job / Quote" : form.mode === "past" ? "Add Past Job + Photos" : "Add Quote / Booking"}</h2>
      <p className="muted">Use this for new quotes, booked jobs, completed work and Hnry handoffs.</p>

      {/* Customer */}
      <div className="formPanel">
        <h3>Customer</h3>
        <Select
          label="Choose Existing Customer"
          value={form.customerId}
          onChange={selectCustomerForJob}
          options={[["", "New / not saved yet"], ...customers.map(c => [c.id, displayCustomerName(c)])]}
        />
        <Input label="Customer Name" value={form.customerName} onChange={v => updateForm("customerName", v)} />
        <div className="formGrid">
          <Input label="Phone" value={form.phone} onChange={v => updateForm("phone", v)} inputMode="tel" />
          <Input label="Email" value={form.email} onChange={v => updateForm("email", v)} type="email" />
        </div>
        <Input label="Address" value={form.address} onChange={v => updateForm("address", v)} />
        <Input label="Area / Suburb" value={form.area} onChange={v => updateForm("area", v)} />
        <div className="formGrid">
          <Select label="Preferred Contact" value={form.preferredContact} onChange={v => updateForm("preferredContact", v)} options={contactMethods} />
          <Select label="Customer Type"     value={form.customerType}     onChange={v => updateForm("customerType", v)}     options={customerTypes} />
        </div>
      </div>

      {/* Vehicle */}
      <div className="formPanel">
        <h3>Vehicle</h3>
        <div className="formGrid three">
          <Input label="Year"  value={form.vehicleYear}  onChange={v => updateForm("vehicleYear", v)}  inputMode="numeric" />
          <Input label="Make"  value={form.vehicleMake}  onChange={v => updateForm("vehicleMake", v)} />
          <Input label="Model" value={form.vehicleModel} onChange={v => updateForm("vehicleModel", v)} />
        </div>
        <div className="formGrid">
          <Input label="Rego"   value={form.rego}   onChange={v => updateForm("rego", v.toUpperCase())} />
          <Input label="Colour" value={form.colour} onChange={v => updateForm("colour", v)} />
        </div>
        <Select label="Vehicle Type" value={form.vehicleType} onChange={v => updateForm("vehicleType", v)} options={vehicleTypes} />
        <div className="switchGrid">
          <Check label="Work vehicle"     checked={form.workVehicle}     onChange={v => updateForm("workVehicle", v)} />
          <Check label="Fleet vehicle"    checked={form.fleetVehicle}    onChange={v => updateForm("fleetVehicle", v)} />
          <Check label="Black Duck covers" checked={form.blackDuckCovers} onChange={v => updateForm("blackDuckCovers", v)} />
          <Check label="Pet hair"         checked={form.petHair}         onChange={v => updateForm("petHair", v)} />
          <Check label="Heavy stains"     checked={form.heavyStains}     onChange={v => updateForm("heavyStains", v)} />
        </div>
      </div>

      {/* Job details */}
      <div className="formPanel">
        <h3>Job Details</h3>
        <div className="formGrid">
          <Select label="Package" value={form.packageId} onChange={v => updateForm("packageId", v)}
            options={Object.entries(packages).map(([id, item]) => [id, `${item.name} — ${money(item.price)}`])} />
          <Select label="Status" value={form.status} onChange={v => updateForm("status", v)}
            options={statuses.map(s => [s, s])} />
        </div>
        <div className="formGrid">
          <Select label="Condition" value={form.condition} onChange={v => updateForm("condition", v)}
            options={[["normal", "Normal"], ["dirty", "Dirty / extra time likely"], ["heavily", "Heavily soiled — inspect first"]]} />
          <Select label="Sand / Mud Level" value={form.sandMudLevel} onChange={v => updateForm("sandMudLevel", v)}
            options={[["normal", "Normal"], ["moderate", "Moderate"], ["heavy", "Heavy"]]} />
        </div>
        <label className="plainLabel">Add-ons</label>
        <div className="addons">
          {addons.map(addon => (
            <button
              type="button"
              className={(form.selectedAddons || []).includes(addon.id) ? "chip active" : "chip"}
              key={addon.id}
              onClick={() => toggleAddon(addon.id)}
            >
              {addon.name} {money(addon.price)}
            </button>
          ))}
        </div>
        <div className="formGrid">
          <Input label="Booking Date" type="date" value={form.bookingDate} onChange={v => updateForm("bookingDate", v)} />
          <Input label="Booking Time" type="time" value={form.bookingTime} onChange={v => updateForm("bookingTime", v)} />
        </div>
        <div className="formGrid">
          <Input label="Service Date / Past Job Date" type="date" value={form.serviceDate} onChange={v => updateForm("serviceDate", v)} />
          <Input label="Invoice / Hnry Reference" value={form.invoiceNumber} onChange={v => updateForm("invoiceNumber", v)} placeholder="Optional" />
        </div>
        <div className="formGrid">
          <Input label="Payment Due Date" type="date" value={form.paymentDueDate} onChange={v => updateForm("paymentDueDate", v)} />
          <Input label="Paid Amount" type="number" value={form.paidAmount} onChange={v => updateForm("paidAmount", v)} placeholder="For paid jobs" />
        </div>
        <div className="formGrid">
          <Input label="Travel Fee" type="number" value={form.travel} onChange={v => updateForm("travel", v)} />
          <Input label="Manual Total Override" type="number" value={form.manualTotal} onChange={v => updateForm("manualTotal", v)} placeholder="Optional" />
        </div>
        <Check label="Review request sent" checked={form.reviewRequestSent} onChange={v => updateForm("reviewRequestSent", v)} />
        <Textarea label="Hnry / Payment Notes" value={form.hnryNotes} onChange={v => updateForm("hnryNotes", v)} placeholder="Invoice sent in Hnry, payment outside Hnry, follow-up notes…" />
      </div>

      {/* Photos */}
      <div className="formPanel">
        <h3>Photos From This Job</h3>
        <Select label="Photo Category" value={form.photoCategory} onChange={v => updateForm("photoCategory", v)} options={photoCategories} />
        <label className="uploadBox">
          <input type="file" accept="image/*" multiple onChange={handlePhotos} />
          <strong>＋ Upload job photos</strong>
          <span>Before, after, stains, damage, customer-supplied photos, receipts.</span>
        </label>
        {!!(form.photos || []).length && (
          <div className="photoReview">
            {(form.photos || []).map((photo, i) => (
              <div className="photoTile" key={`${photo.url || photo.preview || photo.name}-${i}`}>
                <img src={photo.url || photo.preview} alt={photo.name || "Job upload"} />
                <span>{photo.category || "photo"}</span>
                <button type="button" onClick={() => removePhoto(i)}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Textarea label="Notes" value={form.notes} onChange={v => updateForm("notes", v)} placeholder="Stains, Black Duck covers, pet hair, access notes, what was done…" />

      <div className="quoteTotal">
        <span>Quote / Job Total</span>
        <strong>{money(pricing.total)}</strong>
      </div>
      <div className="breakdown">
        <div><span>Base</span><b>{money(pricing.base)}</b></div>
        <div><span>Vehicle adjustment</span><b>{money(pricing.vehicleAdj)}</b></div>
        <div><span>Condition adjustment</span><b>{money(pricing.conditionAdj)}</b></div>
        <div><span>Add-ons</span><b>{money(pricing.addonTotal)}</b></div>
        <div><span>Travel</span><b>{money(pricing.travel)}</b></div>
      </div>
      <div className="warnings">
        {pricing.warnings.map(w => <span key={w}>{w}</span>)}
      </div>

      <button type="button" disabled={saving} onClick={saveJob}>
        {saving ? "Saving…" : form.id ? "Save Job Changes" : "Save Job / Quote"}
      </button>
      <button type="button" className="secondary" onClick={() => generateMessage("quote")}>Generate Customer Message</button>
      <button type="button" className="secondary" onClick={() => generateMessage("confirmation")}>Booking Confirmation Message</button>
      <button type="button" className="secondary" onClick={() => generateMessage("reminder")}>Day-Before Reminder Message</button>
      <button type="button" className="secondary" onClick={() => generateMessage("invoice")}>Prepare Hnry Details</button>
      <button type="button" className="secondary" onClick={() => generateMessage("review")}>Review Request Message</button>

      {message && (
        <div className="messageBox">
          <h3>Customer Message / Handoff</h3>
          <pre>{message}</pre>
          <button type="button" className="secondary" onClick={async () => {
            try { await navigator.clipboard.writeText(message); alert("Copied!"); }
            catch { alert("Copy failed — select and copy manually."); }
          }}>Copy to Clipboard</button>
        </div>
      )}
    </section>
  );
}

function VoucherForm({ form, updateForm, saving, saveVoucher }) {
  return (
    <section>
      <h2>{form.id ? "Edit Voucher" : "Add Voucher"}</h2>
      <p className="muted">Track return vouchers, referral credits and discount codes.</p>
      <div className="formGrid">
        <Input label="Voucher Code" value={form.code} onChange={v => updateForm("code", v.toUpperCase())} placeholder="APEX26-001" />
        <Input label="Value ($)" type="number" value={form.value} onChange={v => updateForm("value", v)} />
      </div>
      <Input label="Customer Name" value={form.customerName} onChange={v => updateForm("customerName", v)} />
      <Input label="Phone" value={form.phone} onChange={v => updateForm("phone", v)} inputMode="tel" />
      <Input label="Vehicle" value={form.vehicle} onChange={v => updateForm("vehicle", v)} placeholder="Toyota Corolla" />
      <div className="formGrid">
        <Input label="Original Job Date" type="date" value={form.originalJobDate} onChange={v => updateForm("originalJobDate", v)} />
        <Input label="Expiry Date" type="date" value={form.expiryDate} onChange={v => updateForm("expiryDate", v)} />
      </div>
      <Input label="Original Service" value={form.originalService} onChange={v => updateForm("originalService", v)} placeholder="Full Detail" />
      <div className="formGrid">
        <Input label="Referral Customer" value={form.referralCustomer} onChange={v => updateForm("referralCustomer", v)} placeholder="Who referred them?" />
        <Select label="Referral Credit Status" value={form.referralCreditStatus} onChange={v => updateForm("referralCreditStatus", v)}
          options={[["pending", "Pending"], ["issued", "Credit Issued"], ["notApplicable", "N/A"]]} />
      </div>
      <div className="switchGrid">
        <Check label="Voucher has been used" checked={form.used} onChange={v => updateForm("used", v)} />
      </div>
      {form.used && (
        <Input label="Date Used" type="date" value={form.usedDate} onChange={v => updateForm("usedDate", v)} />
      )}
      <Textarea label="Notes" value={form.notes} onChange={v => updateForm("notes", v)} placeholder="Any extra notes about this voucher or referral…" />
      <button type="button" disabled={saving} onClick={saveVoucher}>
        {saving ? "Saving…" : form.id ? "Save Voucher Changes" : "Save Voucher"}
      </button>
    </section>
  );
}

// ─── Shared UI components ─────────────────────────────────────────────────────

function ActionSheet({ close, openCustomerModal, openJobModal, openVoucherModal }) {
  return (
    <div className="sheetBackdrop" onClick={close}>
      <div className="actionSheet" role="dialog" aria-modal="true" aria-label="Quick add menu" onClick={e => e.stopPropagation()}>
        <div className="sheetHandle" />
        <h2>Quick add</h2>
        <p className="muted">Big buttons for fast iPhone entry.</p>
        <button type="button" onClick={() => openCustomerModal()}>＋ Add Customer</button>
        <button type="button" onClick={() => openJobModal({ mode: "quote" })}>＋ New Quote / Booking</button>
        <button type="button" onClick={() => openJobModal({ mode: "past" })}>＋ Completed Past Job + Photos</button>
        <button type="button" onClick={() => openVoucherModal()}>＋ Add Voucher / Referral</button>
        <button type="button" className="secondary" onClick={close}>Cancel</button>
      </div>
    </div>
  );
}

function Modal({ children, close }) {
  return (
    <div className="modalBackdrop">
      <div className="modalPanel" role="dialog" aria-modal="true">
        <button type="button" className="closeButton" onClick={close} aria-label="Close">×</button>
        {children}
      </div>
    </div>
  );
}

function JobCard({ job, openJobModal, updateJobStatus, deleteJob }) {
  return (
    <article className="card jobCard">
      <div className="cardHeader">
        <div>
          <h3>{job.customerName} — {job.vehicle}</h3>
          <p className="muted">
            {job.packageName || "Package"} • {money(job.total)}
            {job.serviceDate  ? ` • Done ${formatDate(job.serviceDate)}` : ""}
            {job.bookingDate  ? ` • Booked ${formatDate(job.bookingDate)}${job.bookingTime ? " " + job.bookingTime : ""}` : ""}
          </p>
        </div>
        <span className={`badge ${statusColour(job.status)}`}>{job.status || "Quote Sent"}</span>
      </div>
      <div className="chips">
        {addonNames(job).map(name => <span key={name}>{name}</span>)}
        {job.rego && <span>Rego {job.rego}</span>}
        {(job.photos || []).length > 0 && <span>{job.photos.length} photo(s)</span>}
        {job.blackDuckCovers && <span>Black Duck covers</span>}
        {job.workVehicle     && <span>Work vehicle</span>}
        {paymentStatuses.includes(job.status || "") && <span>Hnry flow</span>}
      </div>
      <Select
        label="Update Status"
        value={job.status || "Quote Sent"}
        onChange={v => updateJobStatus(job, v)}
        options={statuses.map(s => [s, s])}
      />
      {(job.photos || []).length > 0 && <PhotoGrid photos={job.photos} />}
      {job.notes && <p className="muted">Notes: {job.notes}</p>}
      <div className="buttonRow">
        <button type="button" className="secondary" onClick={() => openJobModal({ job })}>Edit</button>
        <button type="button" className="dangerGhost" onClick={() => deleteJob(job.id)}>Delete</button>
      </div>
    </article>
  );
}

function CompactJob({ job }) {
  return (
    <div className="compactJob">
      <div>
        <strong>{job.customerName}</strong>
        <span>{job.vehicle} • <span className={`inlineBadge ${statusColour(job.status)}`}>{job.status}</span></span>
      </div>
      <b>{money(job.total)}</b>
    </div>
  );
}

function PhotoGrid({ photos }) {
  return (
    <div className="photos">
      {photos.map((photo, i) => (
        <figure key={`${photo.url || photo.preview}-${i}`}>
          <img src={photo.url || photo.preview} alt={photo.name || "Job photo"} />
          <figcaption>{photo.category || "photo"}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function BrandMark() {
  return <div className="brandLogo" aria-hidden="true"><span>AD</span></div>;
}

function Input({ label, value, onChange, type = "text", placeholder = "", inputMode }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value || ""} placeholder={placeholder} inputMode={inputMode} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value || ""} onChange={e => onChange(e.target.value)}>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
}

function Textarea({ label, value, onChange, placeholder }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Check({ label, checked, onChange }) {
  return (
    <label className="checkRow">
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// ─── Mount ────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")).render(<App />);
