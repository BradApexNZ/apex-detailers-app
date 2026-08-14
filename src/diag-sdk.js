import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { getPublicBookingConfig, lastConfigError } from "./apex-api";

const root = document.getElementById("root");

function row(label, value, cls) {
  const div = document.createElement("div");
  div.style.cssText = "display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #262630;font-size:14px;";
  div.innerHTML = `<span style="color:#9a9aa6;">${label}</span><span class="${cls || ""}" style="color:${cls === "ok" ? "#4ade80" : cls === "bad" ? "#f87171" : "#facc15"};">${value}</span>`;
  return div;
}

function pre(obj) {
  const el = document.createElement("pre");
  el.style.cssText = "white-space:pre-wrap;word-break:break-word;background:#16161c;padding:12px;border-radius:8px;font-size:12px;margin-top:16px;";
  el.textContent = JSON.stringify(obj, null, 2);
  return el;
}

root.textContent = "";
let seconds = 0;
const clockRow = row("Clock (proves JS keeps running)", "0s", "pending");
root.appendChild(clockRow);
setInterval(() => {
  seconds += 1;
  clockRow.querySelector("span:last-child").textContent = seconds + "s";
}, 1000);

const rawFetchRow = row("Raw fetch() (bypasses SDK)", "running…", "pending");
const sdkCallableRow = row("httpsCallable() direct (real SDK, no fallback)", "running…", "pending");
const apexApiRow = row("apex-api.js getPublicBookingConfig (what booking.jsx actually calls)", "running…", "pending");
root.appendChild(rawFetchRow);
root.appendChild(sdkCallableRow);
root.appendChild(apexApiRow);

const detailsBox = pre({ status: "waiting for results…" });
root.appendChild(detailsBox);
const details = {};
function updateDetails() {
  detailsBox.textContent = JSON.stringify(details, null, 2);
}

function setRow(rowEl, text, cls) {
  const span = rowEl.querySelector("span:last-child");
  span.textContent = text;
  span.style.color = cls === "ok" ? "#4ade80" : cls === "bad" ? "#f87171" : "#facc15";
}

function withTimeout(promise, ms, label) {
  let timedOut = false;
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      timedOut = true;
      reject(new Error(`client-timeout-${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).then(
    result => ({ ok: true, result, timedOut }),
    error => ({ ok: false, error: error?.message || String(error), timedOut })
  );
}

const t0 = Date.now();
withTimeout(
  fetch("https://australia-southeast1-apex-detailers.cloudfunctions.net/getPublicBookingConfig", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: {} })
  }).then(r => r.json()),
  20000,
  "rawFetch"
).then(res => {
  const elapsed = Date.now() - t0;
  setRow(rawFetchRow, res.ok ? `SUCCESS ${elapsed}ms` : `FAILED (${res.error}) ${elapsed}ms`, res.ok ? "ok" : "bad");
  details.rawFetch = { ...res, elapsedMs: elapsed };
  updateDetails();
});

const t1 = Date.now();
withTimeout(httpsCallable(functions, "getPublicBookingConfig")({}), 20000, "sdkCallable").then(res => {
  const elapsed = Date.now() - t1;
  setRow(sdkCallableRow, res.ok ? `SUCCESS ${elapsed}ms` : `FAILED (${res.error}) ${elapsed}ms`, res.ok ? "ok" : "bad");
  details.sdkCallable = { ...res, elapsedMs: elapsed };
  updateDetails();
});

const t2 = Date.now();
withTimeout(getPublicBookingConfig({}), 20000, "apexApi").then(res => {
  const elapsed = Date.now() - t2;
  setRow(apexApiRow, res.ok ? `RESOLVED ${elapsed}ms (fallback swallows real errors)` : `FAILED (${res.error}) ${elapsed}ms`, res.ok ? "ok" : "bad");
  details.apexApi = { ...res, elapsedMs: elapsed, lastConfigErrorAtResolve: lastConfigError };
  updateDetails();
});

const copyBtn = document.createElement("button");
copyBtn.textContent = "Copy this report to send to Brad's dev";
copyBtn.style.cssText = "margin-top:16px;width:100%;padding:14px;border-radius:8px;border:none;background:#f5f5f5;color:#0a0a0d;font-size:15px;font-weight:600;";
copyBtn.addEventListener("click", () => {
  const text = JSON.stringify({ userAgent: navigator.userAgent, url: window.location.href, at: new Date().toISOString(), ...details }, null, 2);
  navigator.clipboard.writeText(text).then(
    () => alert("Copied. Paste it to Brad."),
    () => alert(text)
  );
});
root.appendChild(copyBtn);
