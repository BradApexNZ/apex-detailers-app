import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, db } from "./firebase";

const BRAD_UID = "FqDrn1aPFHXUB5ogb2rN9D7mRG42";

function nameOf(customer) {
  return customer.businessName || [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
}

function keyOf(customer) {
  return `${nameOf(customer).toLowerCase()}|${String(customer.email || "").trim().toLowerCase()}`;
}

function addImportButton() {
  if (document.querySelector("[data-customer-import]")) return;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.hidden = true;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.customerImport = "true";
  button.textContent = "Import customers";
  button.style.cssText = "position:fixed;right:18px;bottom:88px;z-index:9999;border:1px solid #f3c400;border-radius:999px;padding:11px 16px;background:#111214;color:#f3c400;font:600 14px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.35)";
  button.onclick = () => input.click();

  input.onchange = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    button.disabled = true;
    button.textContent = "Importing…";

    try {
      const rows = JSON.parse(await file.text());
      if (!Array.isArray(rows)) throw new Error("The import file must contain a customer list.");

      const existing = await getDocs(collection(db, "customers"));
      const keys = new Set(existing.docs.map(item => keyOf(item.data())));
      const batch = writeBatch(db);
      let added = 0;
      let skipped = 0;

      rows.forEach(source => {
        const customer = {
          firstName: String(source.firstName || "").trim(),
          lastName: String(source.lastName || "").trim(),
          businessName: String(source.businessName || "").trim(),
          phone: String(source.phone || "").trim(),
          email: String(source.email || "").trim(),
          address: String(source.address || "").trim(),
          area: String(source.area || "").trim(),
          preferredContact: source.preferredContact || (source.email ? "email" : "text"),
          customerType: source.customerType || "standard",
          notes: String(source.notes || "").trim()
        };

        if (!nameOf(customer)) return;
        const key = keyOf(customer);
        if (keys.has(key)) {
          skipped += 1;
          return;
        }

        batch.set(doc(collection(db, "customers")), {
          ...customer,
          ownerUid: BRAD_UID,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        keys.add(key);
        added += 1;
      });

      if (added) await batch.commit();
      alert(`Customer import complete. Added ${added}; skipped ${skipped} existing record(s).`);
    } catch (error) {
      console.error(error);
      alert(`Customer import failed: ${error.message || "Unknown error"}`);
    } finally {
      button.disabled = false;
      button.textContent = "Import customers";
    }
  };

  document.body.append(input, button);
}

onAuthStateChanged(auth, user => {
  if (user?.uid === BRAD_UID) addImportButton();
});
