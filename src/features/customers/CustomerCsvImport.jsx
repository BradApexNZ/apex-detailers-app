import React, { useMemo, useState } from "react";
import { CUSTOMER_CSV_TEMPLATE, customerIdentity, mapCustomerCsv } from "./csv";
import "./customer-csv-import.css";

function downloadTemplate() {
  const blob = new Blob([CUSTOMER_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "apex-customer-import-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function CustomerCsvImport({ existingCustomers = [], onImport, onClose }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const existingIds = useMemo(() => new Set(existingCustomers.map(customerIdentity).filter(Boolean)), [existingCustomers]);
  const newRows = useMemo(() => rows.filter(row => !existingIds.has(customerIdentity(row))), [rows, existingIds]);
  const duplicates = rows.length - newRows.length;

  async function readFile(event) {
    const file = event.target.files?.[0];
    setError("");
    setRows([]);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please choose a CSV file.");
      return;
    }
    try {
      const text = await file.text();
      setRows(mapCustomerCsv(text));
    } catch (err) {
      setError(err.message || "That CSV could not be read.");
    }
  }

  async function importRows() {
    if (!newRows.length || !onImport) return;
    setImporting(true);
    setError("");
    try {
      await onImport(newRows.map(({ sourceRow, ...customer }) => customer));
      onClose?.();
    } catch (err) {
      setError(err.message || "The customers could not be imported.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="apex-import-panel" aria-labelledby="customer-import-title">
      <div className="apex-import-heading">
        <div>
          <span className="apex-eyebrow">Customer database</span>
          <h2 id="customer-import-title">Import customers from CSV</h2>
          <p>Upload an Apex template, Hnry client CSV, or another customer spreadsheet. Nothing is saved until you confirm.</p>
        </div>
        {onClose && <button className="apex-import-close" type="button" onClick={onClose}>Close</button>}
      </div>

      <div className="apex-import-actions">
        <label className="apex-file-button">
          Choose CSV
          <input type="file" accept=".csv,text/csv" onChange={readFile} />
        </label>
        <button type="button" className="apex-secondary-action" onClick={downloadTemplate}>Download Apex template</button>
      </div>

      {error && <p className="apex-import-error" role="alert">{error}</p>}

      {!!rows.length && (
        <>
          <div className="apex-import-summary">
            <strong>{newRows.length} ready to import</strong>
            <span>{duplicates ? `${duplicates} possible duplicate${duplicates === 1 ? "" : "s"} skipped` : "No duplicates detected"}</span>
          </div>
          <div className="apex-import-table-wrap">
            <table className="apex-import-table">
              <thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Area</th><th>Status</th></tr></thead>
              <tbody>
                {rows.slice(0, 100).map(row => {
                  const duplicate = existingIds.has(customerIdentity(row));
                  const name = row.businessName || [row.firstName, row.lastName].filter(Boolean).join(" ") || "Unnamed customer";
                  return <tr key={`${row.sourceRow}-${customerIdentity(row)}`}>
                    <td>{name}</td><td>{row.email || "—"}</td><td>{row.phone || "—"}</td><td>{row.area || "—"}</td>
                    <td><span className={duplicate ? "apex-import-badge is-duplicate" : "apex-import-badge"}>{duplicate ? "Skipped" : "Ready"}</span></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          {rows.length > 100 && <p className="apex-import-note">Previewing the first 100 rows. All valid new rows will be imported.</p>}
          <button className="apex-primary-action" type="button" disabled={!newRows.length || importing} onClick={importRows}>
            {importing ? "Importing…" : `Import ${newRows.length} customer${newRows.length === 1 ? "" : "s"}`}
          </button>
        </>
      )}
    </section>
  );
}
