const DEFAULT_HNRY_URL = "https://app.hnry.io/";

function money(value) {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(Number(value || 0));
}

export function buildHnryInvoiceBrief(job) {
  const customer = job.customerName || job.businessName || [job.firstName, job.lastName].filter(Boolean).join(" ") || "Customer";
  const vehicle = [job.vehicleYear, job.vehicleMake, job.vehicleModel].filter(Boolean).join(" ") || job.vehicle || "Vehicle";
  const service = job.packageName || job.serviceName || job.service || "Vehicle detailing";
  const total = job.total ?? job.quotedTotal ?? job.manualTotal ?? 0;

  return [
    "HNRY INVOICE HANDOFF — APEX DETAILERS",
    "",
    `Customer: ${customer}`,
    job.email ? `Email: ${job.email}` : "",
    job.phone ? `Phone: ${job.phone}` : "",
    job.address ? `Address: ${job.address}${job.area ? `, ${job.area}` : ""}` : "",
    `Vehicle: ${vehicle}`,
    `Service: ${service}`,
    `Amount: ${money(total)}`,
    job.serviceDate || job.bookingDate ? `Job date: ${job.serviceDate || job.bookingDate}` : "",
    job.invoiceNumber ? `Reference: ${job.invoiceNumber}` : "",
    job.notes ? `Notes: ${job.notes}` : "",
    "",
    "Create and send the official invoice in Hnry."
  ].filter(Boolean).join("\n");
}

export async function copyHnryInvoiceBrief(job) {
  const brief = buildHnryInvoiceBrief(job);
  await navigator.clipboard.writeText(brief);
  return brief;
}

export function openHnryInvoices() {
  const url = import.meta.env.VITE_HNRY_INVOICES_URL || DEFAULT_HNRY_URL;
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function handoffJobToHnry(job, { onStatusChange } = {}) {
  const brief = await copyHnryInvoiceBrief(job);
  await onStatusChange?.("Prepare Hnry Invoice");
  openHnryInvoices();
  return brief;
}
