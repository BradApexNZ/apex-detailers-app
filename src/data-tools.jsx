import React,{useEffect,useState}from"react";
import{addDoc,collection,doc,getDocs,serverTimestamp,writeBatch}from"firebase/firestore";
import{onAuthStateChanged,signInWithEmailAndPassword,signOut}from"firebase/auth";
import{createRoot}from"react-dom/client";
import{auth,db}from"./firebase";
import"./data-tools.css";

const ownerUids=(import.meta.env.VITE_APEX_OWNER_UIDS||"fnc4G85CtmQVy0OooOzfOoSC9u22,FqDrn1aPFHXUB5ogb2rN9D7mRG42,maefd5cQ9qcIKSeU4b3yZKUL8UW2").split(",").map(value=>value.trim());
const clean=value=>String(value??"").trim();
const normal=value=>clean(value).toLowerCase().replace(/\s+/g," ");
const phoneKey=value=>{const digits=clean(value).replace(/\D/g,"");return digits.startsWith("64")?`0${digits.slice(2)}`:digits};
const customerName=customer=>clean(customer.businessName||[customer.firstName,customer.lastName].filter(Boolean).join(" ")||customer.customerName);
const customerKey=customer=>[normal(customer.email),phoneKey(customer.phone),normal(customerName(customer))].join("|");
const jobCompositeKey=job=>[normal(job.bookingDate),normal(job.bookingTime),normal(job.customerName),normal(job.vehicle||job.rego)].join("|");
const jobKeys=job=>{
 const keys=[`details|${jobCompositeKey(job)}`];
 const calendarId=normal(job.calendarEventId||job.googleCalendarEventId||job.sourceCalendarEventId);
 if(calendarId)keys.unshift(`calendar|${calendarId}`);
 return keys;
};
const download=(name,data)=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();URL.revokeObjectURL(url)};
const serialise=value=>{if(value?.toDate)return value.toDate().toISOString();if(Array.isArray(value))return value.map(serialise);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,serialise(item)]));return value};

function App(){
 const[user,setUser]=useState(null),[ready,setReady]=useState(false),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[customerFile,setCustomerFile]=useState(null),[jobFile,setJobFile]=useState(null);
 const owner=Boolean(user&&ownerUids.includes(user.uid));

 useEffect(()=>onAuthStateChanged(auth,next=>{
  if(next&&!ownerUids.includes(next.uid)){
   signOut(auth);
   setMessage("That account is not authorised for Apex HQ.");
   setUser(null);
  }else setUser(next);
  setReady(true);
 }),[]);

 async function login(event){
  event.preventDefault();setBusy(true);setMessage("");
  try{await signInWithEmailAndPassword(auth,email.trim(),password)}catch{setMessage("Login failed. Check your Firebase email and password.")}
  setBusy(false);
 }

 async function backup(){
  setBusy(true);setMessage("Building backup…");
  try{
   const names=["customers","jobs","vouchers","bookingRequests","inquiries"];
   const data={exportedAt:new Date().toISOString(),version:1,collections:{}};
   for(const name of names){const snapshot=await getDocs(collection(db,name));data.collections[name]=snapshot.docs.map(item=>({id:item.id,...serialise(item.data())}))}
   download(`apex-hq-backup-${new Date().toISOString().slice(0,10)}.json`,data);
   setMessage("Full Apex HQ backup downloaded.");
  }catch(error){setMessage(error.message||"Backup failed.")}
  setBusy(false);
 }

 async function exportCustomers(){
  setBusy(true);
  try{
   const snapshot=await getDocs(collection(db,"customers"));
   download(`apex-customers-${new Date().toISOString().slice(0,10)}.json`,snapshot.docs.map(item=>({id:item.id,...serialise(item.data())})));
   setMessage("Customer export downloaded.");
  }catch(error){setMessage(error.message||"Export failed.")}
  setBusy(false);
 }

 async function importCustomers(){
  if(!customerFile)return setMessage("Choose a JSON customer file first.");
  setBusy(true);setMessage("Checking customer file…");
  try{
   const parsed=JSON.parse(await customerFile.text());
   const rows=Array.isArray(parsed)?parsed:(parsed.customers||parsed.collections?.customers||[]);
   if(!Array.isArray(rows)||!rows.length)throw new Error("No customers were found in that JSON file.");
   const existingSnapshot=await getDocs(collection(db,"customers"));
   const keys=new Set(existingSnapshot.docs.map(item=>customerKey(item.data())));
   let added=0,skipped=0;
   for(const raw of rows){
    const row={firstName:clean(raw.firstName),lastName:clean(raw.lastName),businessName:clean(raw.businessName),phone:clean(raw.phone),email:clean(raw.email).toLowerCase(),address:clean(raw.address),area:clean(raw.area),preferredContact:clean(raw.preferredContact)||"text",customerType:clean(raw.customerType)||"standard",notes:clean(raw.notes)};
    if(!row.firstName&&!row.lastName&&!row.businessName){skipped++;continue}
    const key=customerKey(row);
    if(keys.has(key)){skipped++;continue}
    await addDoc(collection(db,"customers"),{...row,ownerUid:user.uid,importedAt:serverTimestamp(),createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    keys.add(key);added++;
   }
   setMessage(`Customer import complete: ${added} added, ${skipped} skipped as duplicate or incomplete.`);
  }catch(error){setMessage(error.message||"Customer import failed.")}
  setBusy(false);
 }

 async function importJobs(){
  if(!jobFile)return setMessage("Choose an Apex booking JSON file first.");
  setBusy(true);setMessage("Checking booking history and matching customers…");
  try{
   const parsed=JSON.parse(await jobFile.text());
   const rows=Array.isArray(parsed)?parsed:(parsed.jobs||parsed.collections?.jobs||[]);
   if(!Array.isArray(rows)||!rows.length)throw new Error("No jobs were found in that JSON file.");

   const[customerSnapshot,jobSnapshot]=await Promise.all([getDocs(collection(db,"customers")),getDocs(collection(db,"jobs"))]);
   const customerByEmail=new Map(),customerByPhone=new Map(),customerByName=new Map();
   customerSnapshot.docs.forEach(item=>{
    const data=item.data();
    if(normal(data.email))customerByEmail.set(normal(data.email),item.id);
    if(phoneKey(data.phone))customerByPhone.set(phoneKey(data.phone),item.id);
    if(normal(customerName(data)))customerByName.set(normal(customerName(data)),item.id);
   });

   const existingKeys=new Set();
   jobSnapshot.docs.forEach(item=>jobKeys(item.data()).forEach(key=>existingKeys.add(key)));

   let batch=writeBatch(db),batchSize=0,added=0,duplicates=0,incomplete=0,linked=0;
   const flush=async()=>{if(!batchSize)return;await batch.commit();batch=writeBatch(db);batchSize=0};

   for(const raw of rows){
    const row={
     customerName:clean(raw.customerName||raw.name),
     phone:clean(raw.phone),
     email:clean(raw.email).toLowerCase(),
     address:clean(raw.address||raw.location),
     area:clean(raw.area),
     vehicle:clean(raw.vehicle),
     rego:clean(raw.rego||raw.registration).toUpperCase(),
     packageName:clean(raw.packageName||raw.serviceName||raw.service)||"Calendar booking",
     bookingDate:clean(raw.bookingDate||raw.date),
     bookingTime:clean(raw.bookingTime||raw.startTime)||"09:00",
     bookingEndTime:clean(raw.bookingEndTime||raw.endTime),
     total:Number(raw.total||raw.price||0)||0,
     status:clean(raw.status)||"Booked",
     notes:clean(raw.notes||raw.description),
     calendarEventId:clean(raw.calendarEventId||raw.googleCalendarEventId||raw.sourceCalendarEventId),
     calendarUrl:clean(raw.calendarUrl),
     source:clean(raw.source)||"Imported booking history"
    };
    if(!row.customerName||!row.bookingDate){incomplete++;continue}
    const keys=jobKeys(row);
    if(keys.some(key=>existingKeys.has(key))){duplicates++;continue}

    const matchedCustomerId=customerByEmail.get(normal(row.email))||customerByPhone.get(phoneKey(row.phone))||customerByName.get(normal(row.customerName))||"";
    const reference=doc(collection(db,"jobs"));
    batch.set(reference,{
     ...row,
     ...(matchedCustomerId?{customerId:matchedCustomerId}:{}),
     ownerUid:user.uid,
     importedAt:serverTimestamp(),
     createdAt:serverTimestamp(),
     updatedAt:serverTimestamp()
    });
    keys.forEach(key=>existingKeys.add(key));
    if(matchedCustomerId)linked++;
    added++;batchSize++;
    if(batchSize>=400)await flush();
   }
   await flush();
   setMessage(`Booking import complete: ${added} added, ${duplicates} duplicates skipped, ${incomplete} incomplete skipped, ${linked} linked to existing customers.`);
  }catch(error){setMessage(error.message||"Booking import failed.")}
  setBusy(false);
 }

 if(!ready)return <main className="page"><section><h1>Apex HQ Data Tools</h1><p>Loading…</p></section></main>;
 if(!owner)return <main className="page"><form onSubmit={login}><span>PRIVATE OWNER TOOL</span><h1>Apex HQ Data Tools</h1><p>Export backups and safely import customer or booking-history JSON files.</p><label>Email<input type="email" required value={email} onChange={event=>setEmail(event.target.value)}/></label><label>Password<input type="password" required value={password} onChange={event=>setPassword(event.target.value)}/></label><button disabled={busy}>{busy?"Signing in…":"Sign in"}</button>{message&&<div className="notice">{message}</div>}</form></main>;

 return <main className="page"><header><div><span>APEX HQ</span><h1>Data Tools</h1></div><div><a href="/hq">← Back to HQ</a><button className="secondary" onClick={()=>signOut(auth)}>Sign out</button></div></header><section className="grid"><article><h2>Full business backup</h2><p>Downloads customers, jobs, vouchers, booking requests and inquiries into one dated JSON file.</p><button disabled={busy} onClick={backup}>Download full backup</button></article><article><h2>Customer export</h2><p>Downloads only the customer database for a lighter contact backup.</p><button disabled={busy} onClick={exportCustomers}>Download customers</button></article><article><h2>Import customers</h2><p>Accepts a customer array, a <code>customers</code> array, or an Apex backup. Existing email, phone and name matches are skipped.</p><input type="file" accept="application/json,.json" onChange={event=>setCustomerFile(event.target.files?.[0]||null)}/><button disabled={busy||!customerFile} onClick={importCustomers}>Import customer file</button></article><article><h2>Import booking history</h2><p>Imports past and future jobs from an Apex booking JSON file. Calendar IDs and job details prevent duplicates; existing customers are linked automatically where possible.</p><input type="file" accept="application/json,.json" onChange={event=>setJobFile(event.target.files?.[0]||null)}/><button disabled={busy||!jobFile} onClick={importJobs}>Import booking file</button></article></section>{message&&<div className="notice fixed">{message}</div>}<footer>Download a full backup before every large import. Unknown prices remain $0 until you confirm them.</footer></main>;
}

createRoot(document.getElementById("root")).render(<App/>);
