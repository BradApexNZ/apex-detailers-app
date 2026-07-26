import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";

const MAX_BATCH_SIZE = 450;

function cleanCustomer(customer = {}, ownerUid) {
  const allowed = {
    firstName: String(customer.firstName || "").trim(),
    lastName: String(customer.lastName || "").trim(),
    businessName: String(customer.businessName || "").trim(),
    email: String(customer.email || "").trim().toLowerCase(),
    phone: String(customer.phone || "").trim(),
    address: String(customer.address || "").trim(),
    area: String(customer.area || "").trim(),
    notes: String(customer.notes || "").trim(),
    preferredContact: customer.preferredContact || "any",
    customerType: customer.customerType || "standard",
    importSource: customer.importSource || "csv",
    ownerUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const hasName = allowed.businessName || allowed.firstName || allowed.lastName;
  if (!hasName) throw new Error("Every imported row needs a customer or business name.");
  return allowed;
}

export async function importCustomersToFirestore({ db, customers, ownerUid }) {
  if (!db) throw new Error("Firestore is not available.");
  if (!ownerUid) throw new Error("You must be signed in before importing customers.");
  if (!Array.isArray(customers) || customers.length === 0) return { imported: 0 };

  let imported = 0;
  for (let start = 0; start < customers.length; start += MAX_BATCH_SIZE) {
    const chunk = customers.slice(start, start + MAX_BATCH_SIZE);
    const batch = writeBatch(db);

    chunk.forEach(customer => {
      const ref = doc(collection(db, "customers"));
      batch.set(ref, cleanCustomer(customer, ownerUid));
    });

    await batch.commit();
    imported += chunk.length;
  }

  return { imported };
}
