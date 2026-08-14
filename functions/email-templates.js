// Transactional email for Apex Detailers.
//
// Two constraints shape everything here:
//   1. Mail clients strip <style> blocks, flexbox and grid, so layout is
//      tables + inline styles only. Gmail on Android is the strictest.
//   2. Most clients block remote images until the reader opts in, so the
//      branding is typographic rather than a logo file. A blocked logo would
//      leave a broken-image box at the top of every booking email, which
//      looks worse than no logo at all.

const escapeHtml = value =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const INK = "#0a0a0d";
const PANEL = "#15151a";
const PANEL_2 = "#1c1c22";
const LINE = "#2e2e36";
const GOLD = "#e8b93a";
const PAPER = "#f5f1e6";
const DIM = "#a7a397";

const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'SF Mono', Menlo, Consolas, monospace";

/**
 * Outer shell: dark ground, gold rule, typographic wordmark, footer.
 * `preheader` is the grey preview line mail clients show next to the subject.
 */
export function emailShell({ heading, eyebrow = "", preheader = "", body }) {
  return `<!doctype html>
<html lang="en-NZ">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${INK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${INK};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${PANEL};border:1px solid ${LINE};border-radius:16px;overflow:hidden;">

  <tr><td style="height:4px;background:${GOLD};font-size:0;line-height:0;">&nbsp;</td></tr>

  <tr><td style="padding:28px 30px 0 30px;">
    <div style="font-family:${SANS};font-size:17px;font-weight:800;letter-spacing:4px;color:${PAPER};">APEX DETAILERS</div>
    <div style="font-family:${MONO};font-size:10px;font-weight:600;letter-spacing:3px;color:${GOLD};padding-top:5px;">HAWKE'S BAY</div>
  </td></tr>

  ${
    eyebrow
      ? `<tr><td style="padding:26px 30px 0 30px;"><div style="font-family:${MONO};font-size:11px;font-weight:700;letter-spacing:2.5px;color:${GOLD};">${escapeHtml(eyebrow)}</div></td></tr>`
      : ""
  }

  <tr><td style="padding:${eyebrow ? "10px" : "26px"} 30px 0 30px;">
    <h1 style="margin:0;font-family:${SANS};font-size:28px;line-height:1.15;font-weight:800;color:${PAPER};letter-spacing:-0.5px;">${escapeHtml(heading)}</h1>
  </td></tr>

  <tr><td style="padding:18px 30px 30px 30px;">${body}</td></tr>

  <tr><td style="padding:0 30px 28px 30px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="border-top:1px solid ${LINE};padding-top:18px;font-family:${SANS};font-size:12px;line-height:1.6;color:${DIM};">
        <strong style="color:${PAPER};letter-spacing:1.5px;">APEX DETAILERS</strong><br>
        Mobile car detailing &middot; Napier &middot; Hastings &middot; Havelock North<br>
        <a href="mailto:bookings@apexdetailers.co.nz" style="color:${GOLD};text-decoration:none;">bookings@apexdetailers.co.nz</a>
      </td></tr>
    </table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** Paragraph in the standard body style. */
export const p = text => `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.6;color:${DIM};">${text}</p>`;

/** Key/value detail panel — the booking summary block. */
export function detailPanel(rows) {
  const cells = rows
    .filter(row => row && row[1])
    .map(
      ([label, value], index) =>
        `<tr>
          <td style="padding:${index === 0 ? "0" : "9px"} 14px 0 0;font-family:${MONO};font-size:10.5px;font-weight:700;letter-spacing:1.5px;color:${DIM};text-transform:uppercase;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:${index === 0 ? "0" : "9px"} 0 0 0;font-family:${SANS};font-size:15px;font-weight:600;line-height:1.45;color:${PAPER};vertical-align:top;">${value}</td>
        </tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PANEL_2};border:1px solid ${LINE};border-radius:10px;margin:0 0 18px;">
    <tr><td style="padding:18px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}</table></td></tr>
  </table>`;
}

/** Gold "awaiting confirmation" style status strip. */
export const statusStrip = (label, detail) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(232,185,58,0.12);border:1px solid rgba(232,185,58,0.35);border-radius:10px;margin:0 0 18px;">
    <tr><td style="padding:14px 18px;">
      <div style="font-family:${MONO};font-size:10.5px;font-weight:700;letter-spacing:2px;color:${GOLD};text-transform:uppercase;">${escapeHtml(label)}</div>
      <div style="font-family:${SANS};font-size:14px;line-height:1.5;color:${PAPER};padding-top:6px;">${escapeHtml(detail)}</div>
    </td></tr>
  </table>`;

/** Bulletproof-ish button. Gold = primary, outline = secondary. */
export function button(href, label, variant = "primary") {
  const primary = variant === "primary";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;margin:0 8px 10px 0;">
    <tr><td style="border-radius:8px;background:${primary ? GOLD : "transparent"};border:1px solid ${primary ? GOLD : LINE};">
      <a href="${href}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:14px;font-weight:800;letter-spacing:0.3px;color:${primary ? INK : PAPER};text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}

/** Quiet note block for caveats (pricing variation, access requirements). */
export const noteBlock = html =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:2px solid ${LINE};margin:0 0 16px;">
    <tr><td style="padding:2px 0 2px 14px;font-family:${SANS};font-size:13px;line-height:1.6;color:${DIM};">${html}</td></tr>
  </table>`;

export { escapeHtml, GOLD, PAPER, DIM, SANS, MONO };
