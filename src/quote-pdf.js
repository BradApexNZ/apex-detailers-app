import { jsPDF } from "jspdf";
import { money, serviceById } from "./booking-data";

const GOLD = [232, 185, 58];
const INK = [10, 10, 13];
const DIM = [110, 105, 95];

export function downloadQuotePdf(quote) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 56;
  let y = 64;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text("APEX DETAILERS", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GOLD);
  doc.text("HAWKE'S BAY · MOBILE CAR DETAILING", margin, y + 14);

  doc.setTextColor(...DIM);
  doc.setFontSize(9);
  const today = new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" });
  doc.text(`Quote date: ${today}`, pageWidth - margin, y - 4, { align: "right" });
  if (quote.id) doc.text(`Reference: ${quote.id.slice(0, 8).toUpperCase()}`, pageWidth - margin, y + 10, { align: "right" });

  y += 40;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 30;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text("Prepared for", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  y += 16;
  doc.text(quote.customerName || "", margin, y);
  const contactLine = [quote.phone, quote.email].filter(Boolean).join("  ·  ");
  if (contactLine) {
    y += 14;
    doc.setTextColor(...DIM);
    doc.text(contactLine, margin, y);
    doc.setTextColor(...INK);
  }
  if (quote.address) {
    y += 14;
    doc.setTextColor(...DIM);
    doc.text(quote.address, margin, y);
    doc.setTextColor(...INK);
  }

  const vehicle = quote.vehicle || [quote.vehicleYear, quote.vehicleMake, quote.vehicleModel].filter(Boolean).join(" ");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Vehicle", pageWidth - margin - 180, y - (contactLine ? 28 : 16));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(vehicle || "Not specified", pageWidth - margin - 180, y - (contactLine ? 14 : 2));
  if (quote.rego) doc.text(`Rego: ${quote.rego}`, pageWidth - margin - 180, y);

  y += 36;
  doc.setDrawColor(230, 226, 216);
  doc.setLineWidth(0.75);
  doc.line(margin, y, pageWidth - margin, y);
  y += 26;

  const basePrice = quote.packageId ? serviceById(quote.packageId).price : quote.total;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(quote.packageName || "Service", margin, y);
  doc.text(money(basePrice), pageWidth - margin, y, { align: "right" });
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...DIM);
  if (quote.condition) {
    doc.text(`Condition: ${quote.condition}`, margin, y);
    y += 16;
  }
  for (const name of quote.addonNames || []) {
    doc.text(`+ ${name}`, margin, y);
    y += 16;
  }
  if (Number(quote.travel)) {
    doc.text(`Travel`, margin, y);
    doc.text(money(quote.travel), pageWidth - margin, y, { align: "right" });
    y += 16;
  }
  if (Number(quote.manualAdjustment)) {
    doc.text(`Adjustment`, margin, y);
    doc.text(money(quote.manualAdjustment), pageWidth - margin, y, { align: "right" });
    y += 16;
  }
  doc.setTextColor(...INK);

  y += 12;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 28;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Total", margin, y);
  doc.text(money(quote.total), pageWidth - margin, y, { align: "right" });

  y += 40;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...DIM);
  const note =
    "Final pricing may vary if the vehicle is more heavily soiled or larger than assessed here. Access to an outside tap is required at the job address. This quote is an estimate and is confirmed once Apex reviews the vehicle in person.";
  doc.text(note, margin, y, { maxWidth: pageWidth - margin * 2, lineHeightFactor: 1.5 });

  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8.5);
  doc.setTextColor(...DIM);
  doc.text("Apex Detailers · Hawke's Bay · bookings@apexdetailers.co.nz", margin, pageHeight - 40);

  const fileName = `apex-quote-${(quote.customerName || "customer").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
  doc.save(fileName);
}
