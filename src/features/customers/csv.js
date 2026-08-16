const HEADER_ALIASES = {
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  businessName: ["business name", "business", "company", "organisation", "organization"],
  email: ["email", "email address", "e-mail"],
  phone: ["phone", "phone number", "mobile", "mobile number", "telephone"],
  address: ["address", "street address", "billing address"],
  area: ["area", "suburb", "city", "town", "region"],
  notes: ["notes", "note", "description"]
};

function normaliseHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function mapCustomerCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("The CSV needs a header row and at least one customer.");

  const headers = rows[0].map(normaliseHeader);
  const fieldIndexes = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([field, aliases]) => [
      field,
      headers.findIndex(header => aliases.includes(header))
    ])
  );

  if (fieldIndexes.email < 0 && fieldIndexes.phone < 0 && fieldIndexes.businessName < 0 && fieldIndexes.firstName < 0) {
    throw new Error("Could not recognise customer columns. Use the Apex template or rename your CSV headers.");
  }

  const customers = rows.slice(1).map((cells, index) => {
    const read = field => fieldIndexes[field] >= 0 ? String(cells[fieldIndexes[field]] || "").trim() : "";
    const customer = {
      firstName: read("firstName"),
      lastName: read("lastName"),
      businessName: read("businessName"),
      email: read("email").toLowerCase(),
      phone: read("phone"),
      address: read("address"),
      area: read("area"),
      notes: read("notes"),
      preferredContact: read("email") ? "email" : "text",
      customerType: "standard",
      importSource: "csv"
    };

    return { ...customer, sourceRow: index + 2 };
  }).filter(customer => customer.firstName || customer.businessName || customer.email || customer.phone);

  return customers;
}

export function customerIdentity(customer) {
  const email = String(customer.email || "").trim().toLowerCase();
  const phone = String(customer.phone || "").replace(/\D/g, "");
  const name = [customer.businessName, customer.firstName, customer.lastName]
    .filter(Boolean).join(" ").trim().toLowerCase();
  return email || phone || name;
}

export const CUSTOMER_CSV_TEMPLATE = [
  "First Name,Last Name,Business Name,Email,Phone,Address,Area,Notes",
  "Jamie,Taylor,,jamie@example.co.nz,0210000000,12 Sample Street,Napier,Imported customer"
].join("\n");
