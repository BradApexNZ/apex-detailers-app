from pathlib import Path

p = Path("src/hq-v6.jsx")
s = p.read_text()

def replace(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f"{label} target missing")
    s = s.replace(old, new, 1)

replace(
    'const blankQuote={customerId:"",customerName:"",phone:"",email:"",address:"",area:"Napier",customerType:"standard",vehicleYear:"",vehicleMake:"",vehicleModel:"",rego:"",vehicleType:"small",packageId:"deep",condition:"Average",selectedAddons:[],manualAdjustment:0,travel:0,manualTotal:"",bookingDate:"",bookingTime:"",notes:""};',
    'const blankQuote={customerId:"",customerName:"",phone:"",email:"",address:"",area:"Napier",customerType:"standard",status:"Quote Sent",vehicleYear:"",vehicleMake:"",vehicleModel:"",rego:"",vehicleType:"small",packageId:"deep",condition:"Average",selectedAddons:[],manualAdjustment:0,travel:0,manualTotal:"",bookingDate:"",bookingTime:"",notes:""};',
    "quote status default",
)

replace(
    'function CustomerModal({close,save,busy}){const[form,setForm]=useState(blankCustomer),',
    'function CustomerModal({close,save,busy,preset}){const[form,setForm]=useState({...blankCustomer,...(preset||{})}),',
    "editable customer modal",
)

# Insert quote status only inside QuoteModal so the CustomerModal's similar field cannot confuse the patch.
quote_start = s.find('function QuoteModal(')
quote_end = s.find('function VoucherModal(', quote_start)
if quote_start < 0 or quote_end < 0:
    raise SystemExit('QuoteModal bounds missing')
quote = s[quote_start:quote_end]
marker = '</select></label><label>Year<input value={form.vehicleYear}'
if marker not in quote:
    raise SystemExit('quote status selector target missing')
quote = quote.replace(
    marker,
    '</select></label><label>Quote status<select value={form.status} onChange={e=>update("status",e.target.value)}><option>Lead</option><option>Quote Requested</option><option>Quote Sent</option><option>Approved</option></select></label><label>Year<input value={form.vehicleYear}',
    1,
)
s = s[:quote_start] + quote + s[quote_end:]

replace(
    'function JobModal({job,close,save,upload,busy,notify}){const[form,setForm]=useState({...job,paidAmount:job.paidAmount||"",invoiceNumber:job.invoiceNumber||"",notes:job.notes||""}),',
    'function JobModal({job,close,save,upload,busy,notify}){const[form,setForm]=useState({...job,paidAmount:job.paidAmount||"",invoiceNumber:job.invoiceNumber||"",followUpDueDate:job.followUpDueDate||"",maintenanceDueDate:job.maintenanceDueDate||"",notes:job.notes||""}),',
    "job due-date state",
)

replace(
    '<label>Total<input type="number" value={form.total||0} onChange={e=>update("total",Number(e.target.value))}/></label><label className="wide">Notes>',
    '<label>Total<input type="number" value={form.total||0} onChange={e=>update("total",Number(e.target.value))}/></label><label>Booking date<input type="date" value={form.bookingDate||""} onChange={e=>update("bookingDate",e.target.value)}/></label><label>Booking time<input type="time" value={form.bookingTime||""} onChange={e=>update("bookingTime",e.target.value)}/></label><label>Follow-up due<input type="date" value={form.followUpDueDate} onChange={e=>update("followUpDueDate",e.target.value)}/></label><label>Maintenance due<input type="date" value={form.maintenanceDueDate} onChange={e=>update("maintenanceDueDate",e.target.value)}/></label><label className="wide">Notes>',
    "job scheduling fields",
)

replace(
    '[customerModal,setCustomerModal]=useState(false),[quoteModal,setQuoteModal]=useState(false),',
    '[customerModal,setCustomerModal]=useState(false),[selectedCustomer,setSelectedCustomer]=useState(null),[mobileMenu,setMobileMenu]=useState(false),[quoteModal,setQuoteModal]=useState(false),',
    "app customer/mobile state",
)

old_save_customer = 'async function saveCustomer(form){if(!clean(form.firstName)&&!clean(form.lastName)&&!clean(form.businessName))return notify("Add a customer or business name.");setBusy(true);try{await addDoc(collection(db,"customers"),{...form,email:clean(form.email).toLowerCase(),ownerUid:user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});setCustomerModal(false);setTab("customers");notify("Customer added.")}catch(err){notify(err.message||"Could not save customer.")}setBusy(false)}'
new_save_customer = 'async function saveCustomer(form){if(!clean(form.firstName)&&!clean(form.lastName)&&!clean(form.businessName))return notify("Add a customer or business name.");setBusy(true);try{const{id,...data}=form,payload={...data,email:clean(data.email).toLowerCase(),ownerUid:user.uid,updatedAt:serverTimestamp()};if(id)await setDoc(doc(db,"customers",id),payload,{merge:true});else await addDoc(collection(db,"customers"),{...payload,createdAt:serverTimestamp()});setCustomerModal(false);setSelectedCustomer(null);setTab("customers");notify(id?"Customer updated.":"Customer added.")}catch(err){notify(err.message||"Could not save customer.")}setBusy(false)}'
replace(old_save_customer, new_save_customer, "customer upsert")

replace('status:"Quote Sent",mode:"quote",source:"hq-v6"', 'status:form.status||"Quote Sent",mode:"quote",source:"hq-v6"', "quote status save")

old_save_job = 'async function saveJob(form){setBusy(true);try{await setDoc(doc(db,"jobs",form.id),{status:form.status,total:Number(form.total||0),paidAmount:Number(form.paidAmount||0),invoiceNumber:clean(form.invoiceNumber),notes:form.notes||"",updatedAt:serverTimestamp()},{merge:true});if(["Booked","Confirmed","Cancelled"].includes(form.status)){await syncJobToCalendar({jobId:form.id}).catch(()=>{})}notify("Job updated.")}catch(err){notify(err.message||"Could not update job.")}setBusy(false)}'
new_save_job = 'async function saveJob(form){setBusy(true);try{await setDoc(doc(db,"jobs",form.id),{status:form.status,total:Number(form.total||0),paidAmount:Number(form.paidAmount||0),invoiceNumber:clean(form.invoiceNumber),bookingDate:form.bookingDate||"",bookingTime:form.bookingTime||"",bookingEndTime:"",followUpDueDate:form.followUpDueDate||"",maintenanceDueDate:form.maintenanceDueDate||"",notes:form.notes||"",updatedAt:serverTimestamp()},{merge:true});if(form.bookingDate&&form.bookingTime&&!["Lead","Quote Requested","Quote Sent","Approved"].includes(form.status)){await syncJobToCalendar({jobId:form.id}).catch(()=>{})}notify("Job updated.")}catch(err){notify(err.message||"Could not update job.")}setBusy(false)}'
replace(old_save_job, new_save_job, "job save/sync")

replace(
    'followups=jobs.filter(j=>j.status==="Paid")',
    'followups=jobs.filter(j=>j.status==="Paid"||(j.followUpDueDate&&j.followUpDueDate<=today)||(j.maintenanceDueDate&&j.maintenanceDueDate<=today))',
    "due followups",
)

replace('return <div className="shell"><aside>', 'return <div className={`shell ${mobileMenu?"show-mobile-menu":""}`}><aside>', "mobile shell")
replace('onClick={()=>setTab(id)}><i>{icon}</i>{label}', 'onClick={()=>{setTab(id);setMobileMenu(false)}}><i>{icon}</i>{label}', "desktop/mobile drawer nav close")
replace('</button>)}</nav><footer><button onClick={()=>{lockSession();setUnlocked(false)}}>', '</button>)}</nav><button className="v6MobileClose" onClick={()=>setMobileMenu(false)}>Close menu</button><footer><button onClick={()=>{lockSession();setUnlocked(false)}}>', "drawer close button")

replace(
    '<article key={c.id}><header><i>{nameOf(c).slice(0,1)}</i>',
    '<article key={c.id} onClick={()=>setSelectedCustomer(c)} style={{cursor:"pointer"}}><header><i>{nameOf(c).slice(0,1)}</i>',
    "customer edit card",
)
replace(
    '<Intro title="Customers" text="Contact details, fleet context, vehicles and repeat-work history."/>',
    '<Intro title="Customers" text="Contact details, fleet context, vehicles and repeat-work history. Tap a customer card to edit it."/>',
    "customer edit hint",
)

old_mobile = '<nav className="mobile">{nav.slice(0,6).map(([id,label,icon])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}><i>{icon}</i><small>{label}</small></button>)}</nav>'
new_mobile = '<nav className="mobile">{nav.slice(0,6).map(([id,label,icon])=><button key={id} className={tab===id?"active":""} onClick={()=>{setTab(id);setMobileMenu(false)}}><i>{icon}</i><small>{label}</small></button>)}<button className={mobileMenu?"active":""} onClick={()=>setMobileMenu(true)}><i>•••</i><small>More</small></button></nav>'
replace(old_mobile, new_mobile, "mobile More menu")

replace(
    '{customerModal&&<CustomerModal close={()=>setCustomerModal(false)} save={saveCustomer} busy={busy}/>} {quoteModal&&',
    '{customerModal&&<CustomerModal close={()=>setCustomerModal(false)} save={saveCustomer} busy={busy}/>} {selectedCustomer&&<CustomerModal preset={selectedCustomer} close={()=>setSelectedCustomer(null)} save={saveCustomer} busy={busy}/>} {quoteModal&&',
    "edit customer modal render",
)

p.write_text(s)
