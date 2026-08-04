import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { apexCloudEnabled } from "./apex-api";
import { auth, db } from "./firebase";

const ownerUids = (import.meta.env.VITE_APEX_OWNER_UIDS || "fnc4G85CtmQVy0OooOzfOoSC9u22,FqDrn1aPFHXUB5ogb2rN9D7mRG42")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

if (apexCloudEnabled) {
  onAuthStateChanged(auth, async user => {
    if (!user || !ownerUids.includes(user.uid)) return;

    const bookingRef = doc(db, "settings", "booking");

    try {
      const snapshot = await getDoc(bookingRef);
      const current = snapshot.exists() ? snapshot.data() : {};

      // One-time migration from the previous free/showcase configuration.
      if (current.paidProductionActivated === true) return;

      await setDoc(bookingRef, {
        enabled: true,
        customerEmails: true,
        ownerEmails: true,
        paidProductionActivated: true,
        paidProductionActivatedAt: serverTimestamp(),
        note: "Your selected time is submitted as a booking request until Apex confirms the vehicle details and final price."
      }, { merge: true });
    } catch (error) {
      console.error("Could not activate Apex paid production settings.", error);
    }
  });
}
