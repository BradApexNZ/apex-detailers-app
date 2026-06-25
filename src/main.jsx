import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
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
const statuses = ["Quote Requested", "Quote Sent", "Approved", "Booked", "In Progress", "Completed", "Paid"];
const money = v => "$" + Number(v || 0).toFixed(0);

function calculatePricing(form) {
  let base = packages[form.packageId].price;
  if (form.customerType === "friend") base = Math.round(base * 0.9);
  if (form.customerType === "family") base = familyPrices[form.packageId] || base;
  if (form.customerType === "startup") base = startupPrices[form.packageId] || base;
  let vehicleAdj = 0;
  if (form.vehicleType === "suv") vehicleAdj = 15;
  if (form.vehicleType === "doublecab") vehicleAdj = 25;
  if (form.vehicleType === "large") vehicleAdj = 40;
  if (form.vehicleType === "van") vehicleAdj = 60;
  if (form.packageId === "tradie" && form.vehicleType === "singlecab") vehicleAdj = 0;
  if (form.packageId === "tradie" && form.vehicleType === "doublecab") vehicleAdj = 30;
  if (form.packageId === "tradie" && form.vehicleType === "van") vehicleAdj = 70;
  const conditionAdj = form.condition === "dirty" ? 30 : 0;
  const addonTotal = addons.filter(a => form.selectedAddons.includes(a.id)).reduce((s, a) => s + a.price, 0);
  const travel = Number(form.travel || 0);
  const total = base + vehicleAdj + conditionAdj + addonTotal + travel;
  const warnings = ["Access to an outside tap required."];
  if (form.condition === "heavily") warnings.unshift("Inspect heavily soiled vehicle before final quote.");
  if (["large", "van"].includes(form.vehicleType)) warnings.unshift("Large/oversized vehicle: final pricing may vary.");
  if (form.packageId === "tradie") warnings.unshift("Tradie Reset starts from base pricing; larger vehicles may vary.");
  return { base, vehicleAdj, conditionAdj, addonTotal, travel, total, warnings };
}

function App() {
  const emptyForm = { customerType: "standard", customerName: "", phone: "", email: "", address: "", vehicle: "", rego: "", colour: "", vehicleType: "small", condition: "normal", packageId: "express", selectedAddons: [], travel: 0, bookingDate: "", bookingTime: "", notes: "", photos: [] };
  const [tab, setTab] = useState("dashboard");
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => onSnapshot(collection(db, "jobs"), snap => setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)))), []);
  const pricing = useMemo(() => calculatePricing(form), [form]);
  const updateForm = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const toggleAddon = id => setForm(p => ({ ...p, selectedAddons: p.selectedAddons.includes(id) ? p.selectedAddons.filter(x => x !== id) : [...p.selectedAddons, id] }));
  const handlePhotos = e => setForm(p => ({ ...p, photos: [...p.photos, ...Array.from(e.target.files || []).map(file => ({ file, name: file.name, preview: URL.createObjectURL(file) }))] }));
  async function saveJob() {
    if (!form.customerName || !form.vehicle) return alert("Add customer name and vehicle first.");
    setSaving(true);
    try {
      const uploadedPhotos = [];
      for (const photo of form.photos) {
        const path = "jobs/" + Date.now() + "-" + photo.name;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, photo.file);
        uploadedPhotos.push({ name: photo.name, url: await getDownloadURL(storageRef), path });
      }
      await addDoc(collection(db, "jobs"), { ...form, photos: uploadedPhotos, pricing, total: pricing.total, packageName: packages[form.packageId].name, addonNames: addons.filter(a => form.selectedAddons.includes(a.id)).map(a => a.name), status: form.bookingDate ? "Booked" : "Quote Sent", createdAt: serverTimestamp() });
      setForm(emptyForm); setTab("jobs");
    } catch (e) { console.error(e); alert("Save failed. Check Firebase config and rules."); }
    setSaving(false);
  }
  const updateStatus = (id, status) => updateDoc(doc(db, "jobs", id), { status });
  const deleteJob = id => confirm("Delete this job?") && deleteDoc(doc(db, "jobs", id));
  function generateCustomerMessage() {
    const names = addons.filter(a => form.selectedAddons.includes(a.id)).map(a => a.name);
    setMessage(`Hey ${form.customerName || "there"}, thanks for reaching out to Apex Detailers.\n\nFor ${form.vehicle || "your vehicle"}, I can do the ${packages[form.packageId].name} package for an estimated total of ${money(pricing.total)}.${names.length ? "\nAdd-ons included: " + names.join(", ") + "." : ""}${form.bookingDate ? "\nBooking requested: " + form.bookingDate + (form.bookingTime ? " at " + form.bookingTime : "") + "." : ""}\n\nThis includes Apex launch pricing. Access to an outside tap is required.${form.condition === "heavily" ? "\nBecause the vehicle is heavily soiled, I’ll need to inspect it in person before locking in the final quote." : ""}\n\nIf anything changes once I inspect the vehicle, I’ll let you know before going ahead.\n\nCheers,\nApex Detailers`);
  }
  const upcoming = jobs.filter(j => j.bookingDate && !["Completed", "Paid"].includes(j.status));
  const revenue = jobs.reduce((s,j)=>s+Number(j.total||0),0);
  const paid = jobs.filter(j=>j.status==="Paid").reduce((s,j)=>s+Number(j.total||0),0);
  const photoCount = jobs.reduce((s,j)=>s+(j.photos||[]).length,0);
  return <div className="app"><header><div className="logo">A</div><div><h1>Apex Detailers</h1><p>Quotes • Bookings • Photos • Jobs</p></div></header><main>
    {tab === "dashboard" && <section><h2>Dashboard</h2><div className="grid"><Stat label="Jobs/Quotes" value={jobs.length}/><Stat label="Revenue Quoted" value={money(revenue)}/><Stat label="Paid Revenue" value={money(paid)}/><Stat label="Upcoming" value={upcoming.length}/><Stat label="Photos" value={photoCount}/></div><div className="card"><h3>Recent Jobs</h3>{jobs.slice(0,3).map(j=><JobCard key={j.id} job={j} updateStatus={updateStatus} deleteJob={deleteJob}/>)}{!jobs.length && <p className="muted">No jobs yet. Create your first quote.</p>}</div></section>}
    {tab === "quote" && <section><h2>Create Quote</h2><div className="card"><FormSelect label="Customer Type" value={form.customerType} onChange={v=>updateForm("customerType",v)} options={[['standard','Standard Customer'],['friend','Friend - 10% off'],['family','Immediate Family Pricing'],['startup','Close Family / Startup Support']]}/><Input label="Customer Name" value={form.customerName} onChange={v=>updateForm('customerName',v)}/><Input label="Phone" value={form.phone} onChange={v=>updateForm('phone',v)}/><Input label="Email" value={form.email} onChange={v=>updateForm('email',v)}/><Input label="Address / Area" value={form.address} onChange={v=>updateForm('address',v)}/><Input label="Vehicle" value={form.vehicle} onChange={v=>updateForm('vehicle',v)} placeholder="2016 Ford Ranger double cab"/><Input label="Rego" value={form.rego} onChange={v=>updateForm('rego',v)}/><Input label="Colour" value={form.colour} onChange={v=>updateForm('colour',v)}/><FormSelect label="Vehicle Type" value={form.vehicleType} onChange={v=>updateForm('vehicleType',v)} options={[['small','Sedan / Hatch'],['suv','SUV / Wagon'],['singlecab','Single-Cab Ute'],['doublecab','Double-Cab Ute'],['large','7-Seater / Large SUV'],['van','Van / Oversized Vehicle']]}/><FormSelect label="Condition" value={form.condition} onChange={v=>updateForm('condition',v)} options={[['normal','Normal'],['dirty','Dirty / extra time likely'],['heavily','Heavily soiled - inspect first']]}/><FormSelect label="Package" value={form.packageId} onChange={v=>updateForm('packageId',v)} options={Object.entries(packages).map(([id,p])=>[id,p.name+' - '+money(p.price)])}/><label>Add-ons</label><div className="addons">{addons.map(a=><button type="button" className={form.selectedAddons.includes(a.id)?'chip active':'chip'} key={a.id} onClick={()=>toggleAddon(a.id)}>{a.name} {money(a.price)}</button>)}</div><Input label="Travel Fee" type="number" value={form.travel} onChange={v=>updateForm('travel',v)}/><Input label="Booking Date" type="date" value={form.bookingDate} onChange={v=>updateForm('bookingDate',v)}/><Input label="Booking Time" type="time" value={form.bookingTime} onChange={v=>updateForm('bookingTime',v)}/><label>Photos</label><input type="file" accept="image/*" multiple onChange={handlePhotos}/><div className="photos">{form.photos.map((p,i)=><img key={i} src={p.preview} alt=""/>)}</div><label>Notes</label><textarea value={form.notes} onChange={e=>updateForm('notes',e.target.value)} placeholder="Stains, Black Duck covers, pet hair, access notes..."/><div className="quoteTotal"><span>Quote Total</span><strong>{money(pricing.total)}</strong></div><div className="breakdown"><div><span>Base</span><b>{money(pricing.base)}</b></div><div><span>Vehicle adjustment</span><b>{money(pricing.vehicleAdj)}</b></div><div><span>Condition adjustment</span><b>{money(pricing.conditionAdj)}</b></div><div><span>Add-ons</span><b>{money(pricing.addonTotal)}</b></div><div><span>Travel</span><b>{money(pricing.travel)}</b></div></div><div className="warnings">{pricing.warnings.map(w=><span key={w}>{w}</span>)}</div><button disabled={saving} onClick={saveJob}>{saving?'Saving...':'Save Quote / Booking'}</button><button className="secondary" onClick={generateCustomerMessage}>Generate Message</button></div>{message && <div className="card"><h3>Customer Message</h3><pre>{message}</pre><button className="secondary" onClick={()=>navigator.clipboard.writeText(message)}>Copy Message</button></div>}</section>}
    {tab === "jobs" && <section><h2>Jobs</h2>{jobs.map(j=><JobCard key={j.id} job={j} updateStatus={updateStatus} deleteJob={deleteJob}/>)}{!jobs.length && <p className="muted">No jobs saved yet.</p>}</section>}
    {tab === "bookings" && <section><h2>Bookings</h2>{upcoming.sort((a,b)=>String(a.bookingDate).localeCompare(String(b.bookingDate))).map(j=><JobCard key={j.id} job={j} updateStatus={updateStatus} deleteJob={deleteJob}/>)}{!upcoming.length && <p className="muted">No upcoming bookings yet.</p>}</section>}
    {tab === "customers" && <section><h2>Customers</h2>{Object.entries(groupCustomers(jobs)).map(([name,rows])=><div className="card" key={name}><h3>{name}</h3><p className="muted">{rows.length} job(s) • {money(rows.reduce((s,j)=>s+Number(j.total||0),0))} quoted</p>{rows[0]?.phone && <p className="muted">Phone: {rows[0].phone}</p>}</div>)}{!jobs.length && <p className="muted">No customer records yet.</p>}</section>}
    </main><nav>{[["dashboard","Home"],["quote","Quote"],["jobs","Jobs"],["bookings","Bookings"],["customers","Customers"]].map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={tab===id?'active':''}>{label}</button>)}</nav></div>;
}
function Stat({label,value}){return <div className="stat"><strong>{value}</strong><span>{label}</span></div>}
function Input({label,value,onChange,type="text",placeholder=""}){return <label className="field"><span>{label}</span><input type={type} value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)}/></label>}
function FormSelect({label,value,onChange,options}){return <label className="field"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}>{options.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>}
function JobCard({job,updateStatus,deleteJob}){return <div className="card job"><h3>{job.customerName} — {job.vehicle}</h3><p className="muted">{job.packageName||job.package} • {money(job.total)} {job.bookingDate ? '• '+job.bookingDate+' '+(job.bookingTime||'') : ''}</p><div className="chips">{(job.addonNames||[]).map(n=><span key={n}>{n}</span>)}{(job.photos||[]).length>0 && <span>{job.photos.length} photo(s)</span>}</div><select value={job.status||'Quote Sent'} onChange={e=>updateStatus(job.id,e.target.value)}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select>{(job.photos||[]).length>0 && <div className="photos">{job.photos.map(p=><img key={p.url} src={p.url} alt={p.name||''}/>)}</div>}{job.notes && <p className="muted">Notes: {job.notes}</p>}<button className="danger" onClick={()=>deleteJob(job.id)}>Delete</button></div>}
function groupCustomers(jobs){return jobs.reduce((m,j)=>{const n=j.customerName||'Unknown';m[n]=m[n]||[];m[n].push(j);return m},{})}
createRoot(document.getElementById("root")).render(<App/>);
