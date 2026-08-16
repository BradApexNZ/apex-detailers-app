import React, { useState } from "react";
import { prepareHnryInvoice } from "./hnryActions";

export default function HnryInvoiceButton({ job, onStatusChange }) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function handleClick() {
    setWorking(true);
    setMessage("");
    try {
      await prepareHnryInvoice({ job, onStatusChange });
      setMessage("Invoice details copied. Hnry has opened in a new tab.");
    } catch (error) {
      setMessage(error.message || "The Hnry handoff could not be prepared.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="apex-hnry-action">
      <button type="button" className="apex-primary-action" disabled={working} onClick={handleClick}>
        {working ? "Preparing…" : "Create Hnry Invoice"}
      </button>
      {message && <small role="status">{message}</small>}
    </div>
  );
}
