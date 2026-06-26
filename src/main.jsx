import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";
import "./styles.css";

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

const statuses = [
  "Lead",
  "Quote Requested",
  "Quote Sent",
  "Approved",
  "Booked",
  "In Progress",
  "Completed",
  "Paid",
  "Archived"
];

const vehicleTypes = [
  ["small", "Sedan / Hatch"],
  ["suv", "SUV / Wagon"],
  ["singlecab", "Single-Cab Ute"],
  ["doublecab", "Double-Cab Ute"],
  ["large", "7-Seater / Large SUV"],
  ["van", "Van / Oversized Vehicle"],
  ["machinery", "Machinery / Commercial"]
];

const customerTypes = [
  ["standard", "Standard Customer"],
  ["friend", "Friend - 10% off"],
  ["family", "Immediate Family Pricing"],
  ["startup", "Close Family / Startup Support"],
  ["fleet", "Fleet / Commercial"]
];

const contactMethods = [
  ["text", "Text"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["facebook", "Facebook / Messenger"],
  ["any", "Any"]
];

const emptyCustomer = {
  firstName: "",
  lastName: "",
  businessName: "",
  phone: "",
  email: "",
  address: "",
  area: "",
  preferredContact: "text",
  customerType: "standard",
  notes: ""
};

const emptyJob = {
  mode: "quote",
  customerId: "",
  customerName: "",
  phone: "",
  email: "",
  address: "",
  area: "",
  preferredContact: "text",
  customerType: "standard",
  vehicleYear: "",
  vehicleMake: "",
  vehicleModel: "",
  rego: "",
  colour: "",
  vehicleType: "small",
  workVehicle: false,
  fleetVehicle: false,
  blackDuckCovers: false,
  petHair: false,
  heavyStains: false,
  sandMudLevel: "normal",
  condition: "normal",
  packageId: "express",
  selectedAddons: [],
  travel: 0,
  manualTotal: "",
  paidAmount: "",
  bookingDate: "",
  bookingTime: "",
  serviceDate: "",
  invoiceNumber: "",
  status: "Quote Sent",
  photoCategory: "before",
  photos: [],
  notes: ""
};

const photoCategories = [
  ["before", "Before photos"],
  ["after", "After photos"],
  ["damage", "Damage / concern photos"],
  ["stains", "Stain photos"],
  ["customer", "Customer-supplied photos"],
  ["receipt", "Invoice / receipt photos"]
];

const money = value => "$" + Number(value || 0).toFixed(0);

function calculatePricing(form) {
  const selectedPackage = packages[form.packageId] || packages.express;
  let base = selectedPackage.price;

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

  const addonTotal = addons
    .filter(addon => form.selectedAddons.includes(addon.id))
    .reduce((sum, addon) => sum + addon.price, 0);

  const travel = Number(form.travel || 0);
  const calculatedTotal = base + vehicleAdj + conditionAdj + addonTotal + travel;
  const manualTotal = Number(form.manualTotal || 0);
  const total = manualTotal > 0 ? manualTotal : calculatedTotal;

  const warnings = ["Access to an outside tap required."];
  if (form.condition === "heavily") warnings.unshift("Inspect heavily soiled vehicle before final quote.");
  if (["large", "van", "machinery"].includes(form.vehicleType)) warnings.unshift("Large/oversized vehicle: final pricing may vary.");
  if (form.packageId === "tradie") warnings.unshift("Tradie Reset starts from base pricing; larger vehicles may vary.");
  if (manualTotal > 0) warnings.unshift("Manual total is overriding the calculator.");

  return { base, vehicleAdj, conditionAdj, addonTotal, travel, calculatedTotal, total, warnings };
}

function displayCustomerName(customer) {
  if (!customer) return "Unknown Customer";
  const personalName = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  return customer.businessName || personalName || customer.customerName || "Unnamed Customer";
}

function buildVehicleName(job) {
  return [job.vehicleYear, job.vehicleMake, job.vehicleModel].filter(Boolean).join(" ").trim() || job.vehicle || "Vehicle not added";
}

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.slice(-1).join("") };
}

function App() {
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

  useEffect(() => {
    const unsubscribeCustomers = onSnapshot(collection(db, "customers"), snapshot => {
      const rows = snapshot.docs
        .map(document => ({ id: document.id, ...document.data() }))
        .sort((a, b) => displayCustomerName(a).localeCompare(displayCustomerName(b)));
      setCustomers(rows);
    });

    const unsubscribeJobs = onSnapshot(collection(db, "jobs"), snapshot => {
      const rows = snapshot.docs
        .map(document => ({ id: document.id, ...document.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setJobs(rows);
    });

    return () => {
      unsubscribeCustomers();
      unsubscribeJobs();
    };
  }, []);

  const pricing = useMemo(() => calculatePricing(jobForm), [jobForm]);

  const visibleCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(customer => {
      const haystack = [
        displayCustomerName(customer),
        customer.phone,
        customer.email,
        customer.address,
        customer.area,
        customer.notes
      ].join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [customers, search]);

  const visibleJobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return jobs;
    return jobs.filter(job => {
      const haystack = [
        job.customerName,
        job.phone,
        job.email,
        job.vehicle,
        job.rego,
        job.status,
        job.packageName,
        job.notes
      ].join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [jobs, search]);

  const bookedJobs = jobs.filter(job => job.bookingDate && !["Completed", "Paid", "Archived"].includes(job.status));
  const completedJobs = jobs.filter(job => ["Completed", "Paid"].includes(job.status));
  const quotedRevenue = jobs.reduce((sum, job) => sum + Number(job.total || 0), 0);
  const paidRevenue = jobs.reduce((sum, job) => sum + Number(job.paidAmount || (job.status === "Paid" ? job.total : 0) || 0), 0);
  const photoCount = jobs.reduce((sum, job) => sum + (job.photos || []).length, 0);

  function updateCustomerForm(key, value) {
    setCustomerForm(previous => ({ ...previous, [key]: value }));
  }

  function updateJobForm(key, value) {
    setJobForm(previous => ({ ...previous, [key]: value }));
  }

  function toggleAddon(addonId) {
    setJobForm(previous => ({
      ...previous,
      selectedAddons: previous.selectedAddons.includes(addonId)
        ? previous.selectedAddons.filter(id => id !== addonId)
        : [...previous.selectedAddons, addonId]
    }));
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
      setJobForm({
        ...emptyJob,
        ...job,
        mode: job.mode || "quote",
        selectedAddons: job.selectedAddons || [],
        photos: job.photos || [],
        manualTotal: job.manualTotal || "",
        paidAmount: job.paidAmount || "",
        photoCategory: "before"
      });
      setModal("editJob");
      return;
    }

    const nextJob = {
      ...emptyJob,
      mode,
      status: mode === "past" ? "Completed" : mode === "booking" ? "Booked" : "Quote Sent",
      serviceDate: mode === "past" ? new Date().toISOString().slice(0, 10) : "",
      customerId: customer?.id || "",
      customerName: customer ? displayCustomerName(customer) : "",
      phone: customer?.phone || "",
      email: customer?.email || "",
      address: customer?.address || "",
      area: customer?.area || "",
      preferredContact: customer?.preferredContact || "text",
      customerType: customer?.customerType || "standard"
    };

    setJobForm(nextJob);
    setModal("addJob");
  }

  function selectCustomerForJob(customerId) {
    const customer = customers.find(row => row.id === customerId);
    if (!customer) {
      setJobForm(previous => ({ ...previous, customerId }));
      return;
    }

    setJobForm(previous => ({
      ...previous,
      customerId,
      customerName: displayCustomerName(customer),
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      area: customer.area || "",
      preferredContact: customer.preferredContact || "text",
      customerType: customer.customerType || "standard"
    }));
  }

  function handleJobPhotos(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const newPhotos = files.map(file => ({
      file,
      name: file.name,
      category: jobForm.photoCategory,
      preview: URL.createObjectURL(file)
    }));

    setJobForm(previous => ({
      ...previous,
      photos: [...previous.photos, ...newPhotos]
    }));

    event.target.value = "";
  }

  function removePhoto(index) {
    setJobForm(previous => ({
      ...previous,
      photos: previous.photos.filter((_, currentIndex) => currentIndex !== index)
    }));
  }

  async function saveCustomer() {
    const customerName = displayCustomerName(customerForm);
    if (!customerName || customerName === "Unnamed Customer") {
      alert("Add a customer name or business name first.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...customerForm,
        updatedAt: serverTimestamp()
      };

      if (customerForm.id) {
        await updateDoc(doc(db, "customers", customerForm.id), payload);
      } else {
        await addDoc(collection(db, "customers"), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }

      setCustomerForm(emptyCustomer);
      setModal(null);
      setTab("customers");
    } catch (error) {
      console.error(error);
      alert("Customer save failed. Check Firebase config and Firestore rules.");
    }
    setSaving(false);
  }

  async function ensureCustomerForJob() {
    if (jobForm.customerId) return jobForm.customerId;

    const nameParts = splitName(jobForm.customerName);
    const customerRef = await addDoc(collection(db, "customers"), {
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      businessName: "",
      phone: jobForm.phone,
      email: jobForm.email,
      address: jobForm.address,
      area: jobForm.area,
      preferredContact: jobForm.preferredContact,
      customerType: jobForm.customerType,
      notes: "Created from job/quote entry.",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return customerRef.id;
  }

  async function saveJob() {
    if (!jobForm.customerName) {
      alert("Add or choose a customer first.");
      return;
    }

    if (!buildVehicleName(jobForm) || buildVehicleName(jobForm) === "Vehicle not added") {
      alert("Add the vehicle year/make/model first.");
      return;
    }

    setSaving(true);
    try {
      const customerId = await ensureCustomerForJob();
      const uploadedPhotos = [];

      for (const photo of jobForm.photos) {
        if (photo.url && !photo.file) {
          uploadedPhotos.push(photo);
          continue;
        }

        const safeName = String(photo.name || "photo").replace(/[^a-z0-9._-]/gi, "-");
        const storagePath = `jobs/${customerId}/${Date.now()}-${safeName}`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, photo.file);
        uploadedPhotos.push({
          name: photo.name,
          category: photo.category || jobForm.photoCategory || "before",
          url: await getDownloadURL(storageRef),
          path: storagePath
        });
      }

      const selectedAddonNames = addons
        .filter(addon => jobForm.selectedAddons.includes(addon.id))
        .map(addon => addon.name);

      const payload = {
        ...jobForm,
        customerId,
        vehicle: buildVehicleName(jobForm),
        packageName: packages[jobForm.packageId]?.name || "Custom Package",
        addonNames: selectedAddonNames,
        pricing,
        total: pricing.total,
        paidAmount: Number(jobForm.paidAmount || 0),
        photos: uploadedPhotos,
        updatedAt: serverTimestamp()
      };

      delete payload.photoCategory;

      if (jobForm.id) {
        await updateDoc(doc(db, "jobs", jobForm.id), payload);
      } else {
        await addDoc(collection(db, "jobs"), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }

      await updateDoc(doc(db, "customers", customerId), {
        phone: jobForm.phone,
        email: jobForm.email,
        address: jobForm.address,
        area: jobForm.area,
        preferredContact: jobForm.preferredContact,
        customerType: jobForm.customerType,
        lastVehicle: buildVehicleName(jobForm),
        lastJobStatus: jobForm.status,
        updatedAt: serverTimestamp()
      });

      setJobForm(emptyJob);
      setModal(null);
      setTab(jobForm.mode === "booking" ? "bookings" : "jobs");
    } catch (error) {
      console.error(error);
      alert("Job save failed. Check Firebase config, Firestore rules, and Storage rules.");
    }
    setSaving(false);
  }

  async function updateJobStatus(job, status) {
    await updateDoc(doc(db, "jobs", job.id), {
      status,
      paidAmount: status === "Paid" ? Number(job.paidAmount || job.total || 0) : Number(job.paidAmount || 0),
      updatedAt: serverTimestamp()
    });
  }

  async function deleteJob(jobId) {
    if (!confirm("Delete this job/quote?")) return;
    await deleteDoc(doc(db, "jobs", jobId));
  }

  async function deleteCustomer(customerId) {
    if (!confirm("Delete this customer? This will not delete their old jobs.")) return;
    await deleteDoc(doc(db, "customers", customerId));
  }

  function generateCustomerMessage() {
    const addonNames = addons
      .filter(addon => jobForm.selectedAddons.includes(addon.id))
      .map(addon => addon.name);

    const bookingLine = jobForm.bookingDate
      ? `\nBooking requested: ${jobForm.bookingDate}${jobForm.bookingTime ? ` at ${jobForm.bookingTime}` : ""}.`
      : "";

    setMessage(
      `Hey ${jobForm.customerName || "there"}, thanks for reaching out to Apex Detailers.\n\n` +
        `For your ${buildVehicleName(jobForm)}, I can do the ${packages[jobForm.packageId].name} package for an estimated total of ${money(pricing.total)}.` +
        `${addonNames.length ? `\nAdd-ons included: ${addonNames.join(", ")}.` : ""}` +
        bookingLine +
        `\n\nThis includes Apex launch pricing. Access to an outside tap is required.` +
        `${jobForm.condition === "heavily" ? "\nBecause the vehicle is heavily soiled, I’ll need to inspect it in person before locking in the final quote." : ""}` +
        `\n\nIf anything changes once I inspect the vehicle, I’ll let you know before going ahead.\n\nCheers,\nApex Detailers`
    );
  }

  const customerJobs = customerId => jobs.filter(job => job.customerId === customerId);

  return (
    <div className="appShell">
      <header className="appHeader">
        <div className="brandLogo" aria-hidden="true">
          <span>A</span>
        </div>
        <div>
          <h1>Apex Detailers</h1>
          <p>Customers • Quotes • Jobs • Photos</p>
        </div>
      </header>

      <main className="appMain">
        <section className="heroCard">
          <div>
            <span className="eyebrow">Apex App V2</span>
            <h2>Business database, not just a quote pad.</h2>
            <p>Add old customers, past jobs, new bookings, photos, and proper contact details from your iPhone.</p>
          </div>
          <button type="button" className="miniAdd" onClick={() => setActionOpen(true)}>＋ Add</button>
        </section>

        {tab !== "dashboard" && (
          <label className="searchBox">
            <span>Search</span>
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Name, rego, phone, vehicle..."
            />
          </label>
        )}

        {tab === "dashboard" && (
          <Dashboard
            customers={customers}
            jobs={jobs}
            bookedJobs={bookedJobs}
            completedJobs={completedJobs}
            quotedRevenue={quotedRevenue}
            paidRevenue={paidRevenue}
            photoCount={photoCount}
            openJobModal={openJobModal}
            openCustomerModal={openCustomerModal}
          />
        )}

        {tab === "customers" && (
          <CustomersTab
            customers={visibleCustomers}
            jobs={jobs}
            customerJobs={customerJobs}
            openCustomerModal={openCustomerModal}
            openJobModal={openJobModal}
            deleteCustomer={deleteCustomer}
          />
        )}

        {tab === "jobs" && (
          <JobsTab
            title="Jobs & Quotes"
            jobs={visibleJobs}
            openJobModal={openJobModal}
            updateJobStatus={updateJobStatus}
            deleteJob={deleteJob}
          />
        )}

        {tab === "bookings" && (
          <JobsTab
            title="Upcoming Bookings"
            jobs={bookedJobs.sort((a, b) => String(a.bookingDate).localeCompare(String(b.bookingDate)))}
            openJobModal={openJobModal}
            updateJobStatus={updateJobStatus}
            deleteJob={deleteJob}
          />
        )}

        {tab === "media" && (
          <MediaTab jobs={jobs} openJobModal={openJobModal} />
        )}
      </main>

      <button type="button" className="fab" aria-label="Add new item" onClick={() => setActionOpen(true)}>＋</button>

      <nav className="bottomNav">
        {[
          ["dashboard", "Home"],
          ["customers", "Customers"],
          ["jobs", "Jobs"],
          ["bookings", "Bookings"],
          ["media", "Photos"]
        ].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={tab === id ? "active" : ""}>
            {label}
          </button>
        ))}
      </nav>

      {actionOpen && (
        <ActionSheet
          close={() => setActionOpen(false)}
          openCustomerModal={openCustomerModal}
          openJobModal={openJobModal}
        />
      )}

      {modal && (
        <Modal close={() => setModal(null)}>
          {(modal === "addCustomer" || modal === "editCustomer") && (
            <CustomerForm
              form={customerForm}
              updateForm={updateCustomerForm}
              saving={saving}
              saveCustomer={saveCustomer}
              deleteCustomer={deleteCustomer}
            />
          )}

          {(modal === "addJob" || modal === "editJob") && (
            <JobForm
              form={jobForm}
              customers={customers}
              pricing={pricing}
              saving={saving}
              message={message}
              updateForm={updateJobForm}
              toggleAddon={toggleAddon}
              selectCustomerForJob={selectCustomerForJob}
              handleJobPhotos={handleJobPhotos}
              removePhoto={removePhoto}
              saveJob={saveJob}
              generateCustomerMessage={generateCustomerMessage}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

function Dashboard({ customers, jobs, bookedJobs, completedJobs, quotedRevenue, paidRevenue, photoCount, openJobModal, openCustomerModal }) {
  return (
    <section>
      <div className="statGrid">
        <Stat label="Customers" value={customers.length} />
        <Stat label="Jobs/Quotes" value={jobs.length} />
        <Stat label="Booked" value={bookedJobs.length} />
        <Stat label="Completed" value={completedJobs.length} />
        <Stat label="Quoted" value={money(quotedRevenue)} />
        <Stat label="Paid" value={money(paidRevenue)} />
        <Stat label="Photos" value={photoCount} />
      </div>

      <div className="quickGrid">
        <button type="button" onClick={() => openCustomerModal()}>＋ Add Customer</button>
        <button type="button" onClick={() => openJobModal({ mode: "quote" })}>＋ New Quote</button>
        <button type="button" onClick={() => openJobModal({ mode: "past" })}>＋ Past Job</button>
      </div>

      <div className="card">
        <h3>Recent work</h3>
        {jobs.slice(0, 4).map(job => (
          <CompactJob key={job.id} job={job} />
        ))}
        {!jobs.length && <p className="muted">No jobs yet. Tap the plus button and add your first customer or past job.</p>}
      </div>
    </section>
  );
}

function CustomersTab({ customers, jobs, customerJobs, openCustomerModal, openJobModal, deleteCustomer }) {
  return (
    <section>
      <div className="sectionTitle">
        <div>
          <h2>Customers</h2>
          <p>Add existing customers here first, then attach jobs, vehicles, and photos.</p>
        </div>
        <button type="button" className="smallButton" onClick={() => openCustomerModal()}>＋ Customer</button>
      </div>

      {customers.map(customer => {
        const rows = customerJobs(customer.id);
        const total = rows.reduce((sum, job) => sum + Number(job.total || 0), 0);
        return (
          <article className="card customerCard" key={customer.id}>
            <div className="cardHeader">
              <div>
                <h3>{displayCustomerName(customer)}</h3>
                <p className="muted">
                  {customer.phone || "No phone"} {customer.area ? `• ${customer.area}` : ""} {customer.customerType ? `• ${customer.customerType}` : ""}
                </p>
              </div>
              <span className="badge">{rows.length} job{rows.length === 1 ? "" : "s"}</span>
            </div>

            <div className="detailList">
              {customer.email && <span>Email: {customer.email}</span>}
              {customer.address && <span>Address: {customer.address}</span>}
              {customer.lastVehicle && <span>Last vehicle: {customer.lastVehicle}</span>}
              {customer.notes && <span>Notes: {customer.notes}</span>}
              <span>Total quoted: {money(total)}</span>
            </div>

            <div className="buttonRow">
              <button type="button" className="secondary" onClick={() => openJobModal({ mode: "quote", customer })}>＋ Quote</button>
              <button type="button" className="secondary" onClick={() => openJobModal({ mode: "past", customer })}>＋ Past Job</button>
              <button type="button" className="secondary" onClick={() => openCustomerModal(customer)}>Edit</button>
              <button type="button" className="dangerGhost" onClick={() => deleteCustomer(customer.id)}>Delete</button>
            </div>
          </article>
        );
      })}

      {!customers.length && (
        <div className="emptyState">
          <h3>Add your existing customers</h3>
          <p>Use this to backfill people you have already detailed for, then add their old completed jobs for testing.</p>
          <button type="button" onClick={() => openCustomerModal()}>＋ Add first customer</button>
        </div>
      )}
    </section>
  );
}

function JobsTab({ title, jobs, openJobModal, updateJobStatus, deleteJob }) {
  return (
    <section>
      <div className="sectionTitle">
        <div>
          <h2>{title}</h2>
          <p>Quotes, bookings, old completed jobs, and paid work all live here.</p>
        </div>
        <button type="button" className="smallButton" onClick={() => openJobModal({ mode: "past" })}>＋ Job</button>
      </div>

      {jobs.map(job => (
        <JobCard
          key={job.id}
          job={job}
          openJobModal={openJobModal}
          updateJobStatus={updateJobStatus}
          deleteJob={deleteJob}
        />
      ))}

      {!jobs.length && (
        <div className="emptyState">
          <h3>No jobs here yet</h3>
          <p>Tap the plus button to add a new quote, booking, or a job you already completed.</p>
          <button type="button" onClick={() => openJobModal({ mode: "past" })}>＋ Add past job</button>
        </div>
      )}
    </section>
  );
}

function MediaTab({ jobs, openJobModal }) {
  const jobsWithPhotos = jobs.filter(job => (job.photos || []).length);
  return (
    <section>
      <div className="sectionTitle">
        <div>
          <h2>Photos</h2>
          <p>Before, after, stain, damage, receipt, and customer-supplied photos.</p>
        </div>
        <button type="button" className="smallButton" onClick={() => openJobModal({ mode: "past" })}>＋ Upload</button>
      </div>

      {jobsWithPhotos.map(job => (
        <article className="card" key={job.id}>
          <h3>{job.customerName} — {job.vehicle}</h3>
          <p className="muted">{job.packageName} • {job.status}</p>
          <PhotoGrid photos={job.photos || []} />
        </article>
      ))}

      {!jobsWithPhotos.length && (
        <div className="emptyState">
          <h3>No photos uploaded yet</h3>
          <p>Create or edit a job, then use the big upload box to attach photos.</p>
          <button type="button" onClick={() => openJobModal({ mode: "past" })}>＋ Add job with photos</button>
        </div>
      )}
    </section>
  );
}

function CustomerForm({ form, updateForm, saving, saveCustomer }) {
  return (
    <section>
      <h2>{form.id ? "Edit Customer" : "Add Customer"}</h2>
      <p className="muted">Perfect for loading old customers into the system before adding their completed jobs.</p>

      <div className="formGrid">
        <Input label="First Name" value={form.firstName} onChange={value => updateForm("firstName", value)} />
        <Input label="Last Name" value={form.lastName} onChange={value => updateForm("lastName", value)} />
      </div>

      <Input label="Business Name / Fleet Name" value={form.businessName} onChange={value => updateForm("businessName", value)} />
      <Input label="Phone" value={form.phone} onChange={value => updateForm("phone", value)} inputMode="tel" />
      <Input label="Email" value={form.email} onChange={value => updateForm("email", value)} type="email" />
      <Input label="Street / Address" value={form.address} onChange={value => updateForm("address", value)} />
      <Input label="Area / Suburb" value={form.area} onChange={value => updateForm("area", value)} placeholder="Napier, Hastings, Poraiti..." />

      <div className="formGrid">
        <Select label="Preferred Contact" value={form.preferredContact} onChange={value => updateForm("preferredContact", value)} options={contactMethods} />
        <Select label="Customer Type" value={form.customerType} onChange={value => updateForm("customerType", value)} options={customerTypes} />
      </div>

      <Textarea label="Customer Notes" value={form.notes} onChange={value => updateForm("notes", value)} placeholder="Access notes, regular customer, dog hair, fleet account, anything useful..." />
      <button type="button" disabled={saving} onClick={saveCustomer}>{saving ? "Saving..." : form.id ? "Save Customer Changes" : "Save Customer"}</button>
    </section>
  );
}

function JobForm({
  form,
  customers,
  pricing,
  saving,
  message,
  updateForm,
  toggleAddon,
  selectCustomerForJob,
  handleJobPhotos,
  removePhoto,
  saveJob,
  generateCustomerMessage
}) {
  return (
    <section>
      <h2>{form.id ? "Edit Job / Quote" : form.mode === "past" ? "Add Past Job" : "Add Quote / Booking"}</h2>
      <p className="muted">Use this for new quotes, booked jobs, and old completed work you want in the system.</p>

      <div className="formPanel">
        <h3>Customer</h3>
        <Select
          label="Choose Existing Customer"
          value={form.customerId}
          onChange={selectCustomerForJob}
          options={[["", "New / not saved yet"], ...customers.map(customer => [customer.id, displayCustomerName(customer)])]}
        />

        <Input label="Customer Name" value={form.customerName} onChange={value => updateForm("customerName", value)} />
        <div className="formGrid">
          <Input label="Phone" value={form.phone} onChange={value => updateForm("phone", value)} inputMode="tel" />
          <Input label="Email" value={form.email} onChange={value => updateForm("email", value)} type="email" />
        </div>
        <Input label="Address" value={form.address} onChange={value => updateForm("address", value)} />
        <Input label="Area / Suburb" value={form.area} onChange={value => updateForm("area", value)} />
        <div className="formGrid">
          <Select label="Preferred Contact" value={form.preferredContact} onChange={value => updateForm("preferredContact", value)} options={contactMethods} />
          <Select label="Customer Type" value={form.customerType} onChange={value => updateForm("customerType", value)} options={customerTypes} />
        </div>
      </div>

      <div className="formPanel">
        <h3>Vehicle</h3>
        <div className="formGrid three">
          <Input label="Year" value={form.vehicleYear} onChange={value => updateForm("vehicleYear", value)} inputMode="numeric" placeholder="2016" />
          <Input label="Make" value={form.vehicleMake} onChange={value => updateForm("vehicleMake", value)} placeholder="Ford" />
          <Input label="Model" value={form.vehicleModel} onChange={value => updateForm("vehicleModel", value)} placeholder="Ranger" />
        </div>
        <div className="formGrid">
          <Input label="Rego" value={form.rego} onChange={value => updateForm("rego", value.toUpperCase())} />
          <Input label="Colour" value={form.colour} onChange={value => updateForm("colour", value)} />
        </div>
        <Select label="Vehicle Type" value={form.vehicleType} onChange={value => updateForm("vehicleType", value)} options={vehicleTypes} />

        <div className="switchGrid">
          <Check label="Work vehicle" checked={form.workVehicle} onChange={value => updateForm("workVehicle", value)} />
          <Check label="Fleet vehicle" checked={form.fleetVehicle} onChange={value => updateForm("fleetVehicle", value)} />
          <Check label="Black Duck covers" checked={form.blackDuckCovers} onChange={value => updateForm("blackDuckCovers", value)} />
          <Check label="Pet hair" checked={form.petHair} onChange={value => updateForm("petHair", value)} />
          <Check label="Heavy stains" checked={form.heavyStains} onChange={value => updateForm("heavyStains", value)} />
        </div>
      </div>

      <div className="formPanel">
        <h3>Job Details</h3>
        <div className="formGrid">
          <Select label="Package" value={form.packageId} onChange={value => updateForm("packageId", value)} options={Object.entries(packages).map(([id, item]) => [id, `${item.name} - ${money(item.price)}`])} />
          <Select label="Status" value={form.status} onChange={value => updateForm("status", value)} options={statuses.map(status => [status, status])} />
        </div>

        <div className="formGrid">
          <Select
            label="Condition"
            value={form.condition}
            onChange={value => updateForm("condition", value)}
            options={[
              ["normal", "Normal"],
              ["dirty", "Dirty / extra time likely"],
              ["heavily", "Heavily soiled - inspect first"]
            ]}
          />
          <Select
            label="Sand / Mud Level"
            value={form.sandMudLevel}
            onChange={value => updateForm("sandMudLevel", value)}
            options={[
              ["normal", "Normal"],
              ["moderate", "Moderate"],
              ["heavy", "Heavy"]
            ]}
          />
        </div>

        <label className="plainLabel">Add-ons</label>
        <div className="addons">
          {addons.map(addon => (
            <button
              type="button"
              className={form.selectedAddons.includes(addon.id) ? "chip active" : "chip"}
              key={addon.id}
              onClick={() => toggleAddon(addon.id)}
            >
              {addon.name} {money(addon.price)}
            </button>
          ))}
        </div>

        <div className="formGrid">
          <Input label="Booking Date" type="date" value={form.bookingDate} onChange={value => updateForm("bookingDate", value)} />
          <Input label="Booking Time" type="time" value={form.bookingTime} onChange={value => updateForm("bookingTime", value)} />
        </div>

        <div className="formGrid">
          <Input label="Service Date / Past Job Date" type="date" value={form.serviceDate} onChange={value => updateForm("serviceDate", value)} />
          <Input label="Invoice Number" value={form.invoiceNumber} onChange={value => updateForm("invoiceNumber", value)} placeholder="Optional" />
        </div>

        <div className="formGrid">
          <Input label="Travel Fee" type="number" value={form.travel} onChange={value => updateForm("travel", value)} />
          <Input label="Manual Total Override" type="number" value={form.manualTotal} onChange={value => updateForm("manualTotal", value)} placeholder="Optional" />
        </div>

        <Input label="Paid Amount" type="number" value={form.paidAmount} onChange={value => updateForm("paidAmount", value)} placeholder="For paid/completed jobs" />
      </div>

      <div className="formPanel">
        <h3>Photos</h3>
        <Select label="Photo Category" value={form.photoCategory} onChange={value => updateForm("photoCategory", value)} options={photoCategories} />
        <label className="uploadBox">
          <input type="file" accept="image/*" multiple onChange={handleJobPhotos} />
          <strong>＋ Upload photos</strong>
          <span>Before, after, damage, stains, customer-supplied photos, receipts.</span>
        </label>

        {!!form.photos.length && (
          <div className="photoReview">
            {form.photos.map((photo, index) => (
              <div className="photoTile" key={`${photo.url || photo.preview || photo.name}-${index}`}>
                <img src={photo.url || photo.preview} alt={photo.name || "Job upload"} />
                <span>{photo.category || "photo"}</span>
                <button type="button" onClick={() => removePhoto(index)}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Textarea label="Notes" value={form.notes} onChange={value => updateForm("notes", value)} placeholder="Stains, Black Duck covers, pet hair, access notes, what was done..." />

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
        {pricing.warnings.map(warning => <span key={warning}>{warning}</span>)}
      </div>

      <button type="button" disabled={saving} onClick={saveJob}>{saving ? "Saving..." : form.id ? "Save Job Changes" : "Save Job / Quote"}</button>
      <button type="button" className="secondary" onClick={generateCustomerMessage}>Generate Customer Message</button>

      {message && (
        <div className="messageBox">
          <h3>Customer Message</h3>
          <pre>{message}</pre>
        </div>
      )}
    </section>
  );
}

function ActionSheet({ close, openCustomerModal, openJobModal }) {
  return (
    <div className="sheetBackdrop" onClick={close}>
      <div className="actionSheet" onClick={event => event.stopPropagation()}>
        <div className="sheetHandle" />
        <h2>Add to Apex</h2>
        <p className="muted">Big buttons for quick iPhone entry.</p>
        <button type="button" onClick={() => openCustomerModal()}>＋ Add Customer</button>
        <button type="button" onClick={() => openJobModal({ mode: "quote" })}>＋ New Quote / Booking</button>
        <button type="button" onClick={() => openJobModal({ mode: "past" })}>＋ Completed Past Job</button>
        <button type="button" className="secondary" onClick={close}>Cancel</button>
      </div>
    </div>
  );
}

function Modal({ children, close }) {
  return (
    <div className="modalBackdrop">
      <div className="modalPanel">
        <button type="button" className="closeButton" onClick={close}>×</button>
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
            {job.packageName || "Package"} • {money(job.total)} {job.serviceDate ? `• Done ${job.serviceDate}` : ""} {job.bookingDate ? `• Booked ${job.bookingDate} ${job.bookingTime || ""}` : ""}
          </p>
        </div>
        <span className="badge">{job.status || "Quote Sent"}</span>
      </div>

      <div className="chips">
        {(job.addonNames || []).map(name => <span key={name}>{name}</span>)}
        {job.rego && <span>Rego {job.rego}</span>}
        {(job.photos || []).length > 0 && <span>{job.photos.length} photo(s)</span>}
        {job.blackDuckCovers && <span>Black Duck covers</span>}
        {job.workVehicle && <span>Work vehicle</span>}
      </div>

      <Select
        label="Update Status"
        value={job.status || "Quote Sent"}
        onChange={value => updateJobStatus(job, value)}
        options={statuses.map(status => [status, status])}
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
        <span>{job.vehicle} • {job.status}</span>
      </div>
      <b>{money(job.total)}</b>
    </div>
  );
}

function PhotoGrid({ photos }) {
  return (
    <div className="photos">
      {photos.map((photo, index) => (
        <figure key={`${photo.url}-${index}`}>
          <img src={photo.url} alt={photo.name || "Job photo"} />
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

function Input({ label, value, onChange, type = "text", placeholder = "", inputMode }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value || ""}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={event => onChange(event.target.value)}
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value || ""} onChange={event => onChange(event.target.value)}>
        {options.map(([optionValue, optionText]) => (
          <option key={optionValue} value={optionValue}>{optionText}</option>
        ))}
      </select>
    </label>
  );
}

function Textarea({ label, value, onChange, placeholder }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value || ""} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Check({ label, checked, onChange }) {
  return (
    <label className="checkRow">
      <input type="checkbox" checked={!!checked} onChange={event => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

createRoot(document.getElementById("root")).render(<App />);