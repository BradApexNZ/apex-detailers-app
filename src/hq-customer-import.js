import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

const clean = value => String(value ?? "").trim();
const normal = value => clean(value).toLowerCase().replace(/\s+/g, " ");
const keyName = value => normal(value).replace(/[^a-z0-9]/g, "");

function parseCsv(text) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;

  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === "," && !quoted) {
      record.push(field);
      field = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      record.push(field);
      if (record.some(value => clean(value))) records.push(record);
      record = [];
      field = "";
      continue;
    }

    field += character;
  }

  record.push(field);
  if (record.some(value => clean(value))) records.push(record);
  if (records.length < 2) return [];

  const headers = records[0].map(keyName);
  return records.slice(1).map(values =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
  );
}

function first(raw, keys) {
  for (const key of keys) {
    const value = clean(raw[key]);
    if (value) return value;
  }
  return "";
}

function splitPersonName(value) {
  const parts = clean(value).split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ")
  };
}

function inferArea(address) {
  const value = normal(address);
  const areas = [
    "Havelock North", "Hastings", "Taradale", "Ahuriri", "Poraiti",
    "Whirinaki", "Clive", "Bay View", "Napier"
  ];
  return areas.find(area => value.includes(area.toLowerCase())) || "Napier";
}

function buildNotes(raw) {
  const notes = [];
  const add = (label, value) => {
    const cleaned = clean(value);
    if (cleaned) notes.push(label ? `${label}: ${cleaned}` : cleaned);
  };

  add("", first(raw, ["notes", "note"]));
  add("Primary contact", first(raw, ["contactname", "primarycontact"]));
  add("Vehicle", first(raw, ["vehiclenotes", "vehicle", "lastvehicle"]));
  add("Job notes", first(raw, ["defaultservicejobnotes", "servicejobnotes", "jobnotes"]));
  add("Source/status", first(raw, ["sourcestatus", "source", "status"]));

  return [...new Set(notes)].join(" | ");
}

function mapCustomer(raw) {
  const clientName = first(raw, [
    "customername", "clientname", "fullname", "name", "contactname"
  ]);
  const explicitBusiness = first(raw, [
    "businessname", "company", "organisation", "organization"
  ]);
  const contactName = first(raw, ["contactname", "primarycontact"]);

  let firstName = first(raw, ["firstname", "givenname"]);
  let lastName = first(raw, ["lastname", "surname", "familyname"]);
  let businessName = explicitBusiness;

  if (!firstName && !lastName && !businessName && clientName) {
    if (/\s(?:and|&)\s|\//i.test(clientName)) {
      businessName = clientName;
    } else {
      ({ firstName, lastName } = splitPersonName(clientName));
    }
  }

  if (businessName && !firstName && !lastName && contactName && contactName !== clientName) {
    const firstContact = contactName.split(/\s*\/\s*/)[0];
    ({ firstName, lastName } = splitPersonName(firstContact));
  }

  const phone = first(raw, ["phone", "mobile", "telephone", "phonenumber"]);
  const email = first(raw, ["email", "emailaddress"]).toLowerCase();
  const address = first(raw, ["address", "street", "postaladdress"]);

  return {
    firstName,
    lastName,
    businessName,
    phone,
    email,
    address,
    area: first(raw, ["area", "suburb", "city", "town"]) || inferArea(address),
    preferredContact: first(raw, ["preferredcontact", "contactmethod"]) || (phone ? "text" : "email"),
    customerType: first(raw, ["customertype", "type"]) || "standard",
    notes: buildNotes(raw)
  };
}

function customerKey(customer) {
  const displayName = customer.businessName || `${customer.firstName || ""} ${customer.lastName || ""}`;
  return [normal(customer.email), normal(customer.phone), normal(displayName)].join("|");
}

function showToast(message, isError = false) {
  document.querySelector("[data-apex-import-toast]")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.apexImportToast = "true";
  toast.textContent = message;
  if (isError) toast.style.borderColor = "rgba(215,101,109,.55)";
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 7000);
}

async function readRows(file) {
  const text = await file.text();
  if (file.name.toLowerCase().endsWith(".csv")) return parseCsv(text);

  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  return parsed.customers || parsed.collections?.customers || [];
}

async function importCustomers(file) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to Apex HQ before importing customers.");

  const rows = await readRows(file);
  if (!Array.isArray(rows) || !rows.length) throw new Error("No customer rows were found in that file.");

  const existing = await getDocs(collection(db, "customers"));
  const keys = new Set(existing.docs.map(snapshot => customerKey(snapshot.data())));

  let added = 0;
  let duplicates = 0;
  let missingNames = 0;
  let failed = 0;

  for (const raw of rows) {
    const customer = mapCustomer(raw);
    if (!customer.firstName && !customer.lastName && !customer.businessName) {
      missingNames += 1;
      continue;
    }

    const key = customerKey(customer);
    if (keys.has(key)) {
      duplicates += 1;
      continue;
    }

    try {
      await addDoc(collection(db, "customers"), {
        ...customer,
        ownerUid: user.uid,
        importedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      keys.add(key);
      added += 1;
    } catch (error) {
      console.error("Apex customer import row failed", error, raw);
      failed += 1;
    }
  }

  const details = [
    `${added} imported`,
    `${duplicates} duplicate${duplicates === 1 ? "" : "s"}`,
    `${missingNames} missing name${missingNames === 1 ? "" : "s"}`,
    `${failed} failed`
  ].join(" · ");

  showToast(details, failed > 0 || (added === 0 && missingNames > 0));
}

document.addEventListener("change", async event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.type !== "file" || !input.closest(".importButton")) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  showToast("Checking customer file...");
  try {
    await importCustomers(file);
  } catch (error) {
    console.error("Apex customer import failed", error);
    showToast(error.message || "Customer import failed.", true);
  }
}, true);
