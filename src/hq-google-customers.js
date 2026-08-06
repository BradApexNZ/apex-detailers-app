import {
  dismissGoogleCalendarProspect,
  getGoogleCalendarStatus,
  listGoogleCalendars,
  saveGoogleCalendarProspect,
  saveGoogleCalendarSelection,
  scanGoogleCalendarProspects,
  startGoogleCalendarConnect
} from "./apex-api";

let activeView = "";
let settingsLoaded = false;
let prospectsLoaded = false;
let prospectRows = [];

const clean = value => String(value ?? "").trim();
const escapeHtml = value => clean(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

function toast(message) {
  document.querySelector("[data-google-customer-toast]")?.remove();
  const node = document.createElement("div");
  node.dataset.googleCustomerToast = "true";
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 5000);
}

function currentView() {
  return clean(document.querySelector(".workspace .top h1")?.textContent).toLowerCase();
}

function hostMain() {
  return document.querySelector(".workspace > main");
}

function removeForeignPanels(view) {
  if (view !== "settings") document.querySelector("[data-google-settings-panel]")?.remove();
  if (view !== "customers") document.querySelector("[data-google-prospects-panel]")?.remove();
}

function injectStyles() {
  if (document.getElementById("apex-google-customers-styles")) return;
  const style = document.createElement("style");
  style.id = "apex-google-customers-styles";
  style.textContent = `
    .googlePanel{margin-top:16px;padding:22px;border:1px solid #3b3b40;border-radius:24px;background:linear-gradient(145deg,rgba(255,255,255,.055),transparent 42%),#111114}
    .googlePanel header{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.googlePanel h3{margin:4px 0 6px;font-size:25px}.googlePanel p{color:#aaa69e;line-height:1.5}.googleStatus{display:flex;align-items:center;gap:10px;padding:11px 13px;border:1px solid #6b383d;border-radius:14px;background:#35161a}.googleStatus.connected{border-color:#34764b;background:#173923}.googleStatus i{display:grid;place-items:center;width:29px;height:29px;border-radius:50%;background:#d65b63;color:#111;font-style:normal;font-weight:1000}.googleStatus.connected i{background:#68ca82}.googleStatus b,.googleStatus small{display:block}.googleStatus small{margin-top:3px;color:#bbb7ae}.googleActions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.googleActions button,.calendarChoice button,.prospectCard button{min-height:42px;padding:9px 13px;border:1px solid #5d501b;border-radius:12px;background:#ffd21f;color:#111;font-weight:900}.googleActions .secondary,.prospectCard .secondary{color:#fff;background:#ffffff0b;border-color:#3a3a40}.calendarChoices{display:grid;gap:8px;margin-top:14px}.calendarChoice{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:12px;border:1px solid #303035;border-radius:14px;background:#09090b}.calendarChoice input{width:20px;height:20px}.calendarChoice span small{display:block;margin-top:3px;color:#aaa69e}.primaryPick{display:flex;align-items:center;gap:5px;color:#aaa69e;font-size:11px}.primaryPick input{width:16px;height:16px}.prospectGrid{display:grid;gap:10px}.prospectCard{padding:16px;border:1px solid #303035;border-radius:18px;background:#0b0b0d}.prospectCard header{display:flex;justify-content:space-between;gap:12px}.prospectCard h4{margin:0;font-size:19px}.prospectCard .source{color:#ffd21f;font-size:10px;font-weight:900;letter-spacing:.1em}.prospectMeta{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:12px 0}.prospectMeta label{display:grid;gap:5px;color:#d8d4cb;font-size:11px}.prospectMeta input{min-height:43px;padding:10px 11px;border:1px solid #36363b;border-radius:11px;background:#060607;color:#fff}.missingFields{margin-top:5px;color:#ffca66;font-size:11px}.prospectButtons{display:flex;gap:8px;flex-wrap:wrap}.existingMatch{padding:9px 11px;border-radius:10px;background:#173923;color:#bff0cc}.googleEmpty{padding:18px;border:1px dashed #404047;border-radius:15px;color:#aaa69e;text-align:center}
    @media(max-width:700px){.googlePanel header{display:grid}.calendarChoice{grid-template-columns:auto 1fr}.primaryPick{grid-column:2}.prospectMeta{grid-template-columns:1fr}.googleActions>*{flex:1 1 150px}}
  `;
  document.head.appendChild(style);
}

async function connect(button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Opening Google…";
  try {
    const result = await startGoogleCalendarConnect();
    if (!result?.url) throw new Error("Google did not return a connection link.");
    window.location.assign(result.url);
  } catch (error) {
    button.disabled = false;
    button.textContent = original;
    toast(error.message || "Google connection failed.");
  }
}

async function mountSettings() {
  const main = hostMain();
  if (!main || document.querySelector("[data-google-settings-panel]")) return;
  const panel = document.createElement("section");
  panel.dataset.googleSettingsPanel = "true";
  panel.className = "googlePanel";
  panel.innerHTML = `<header><div><span class="eyebrow">GOOGLE INTEGRATION</span><h3>Google Calendar sync</h3><p>Choose every calendar Apex should scan. Pick one primary calendar for new Apex bookings.</p></div><div class="googleStatus"><i>…</i><span><b>Checking connection</b><small>Please wait</small></span></div></header><div class="googleActions"><button data-connect>Connect / reconnect Google</button><button class="secondary" data-refresh>Refresh status</button></div><div class="calendarChoices" data-calendar-choices><div class="googleEmpty">Loading calendars…</div></div>`;
  main.appendChild(panel);
  panel.querySelector("[data-connect]").addEventListener("click", event => connect(event.currentTarget));
  panel.querySelector("[data-refresh]").addEventListener("click", () => loadSettings(panel));
  await loadSettings(panel);
}

async function loadSettings(panel) {
  if (!panel?.isConnected) return;
  const statusBox = panel.querySelector(".googleStatus");
  const choices = panel.querySelector("[data-calendar-choices]");
  choices.innerHTML = `<div class="googleEmpty">Loading calendars…</div>`;
  try {
    const [status, data] = await Promise.all([getGoogleCalendarStatus(), listGoogleCalendars()]);
    statusBox.classList.toggle("connected", Boolean(status.connected));
    statusBox.innerHTML = `<i>${status.connected ? "✓" : "!"}</i><span><b>${status.connected ? "Connected and ready" : "Not connected"}</b><small>${escapeHtml(status.email || "Connect Google to activate sync")}</small></span>`;
    if (!data.connected) {
      choices.innerHTML = `<div class="googleEmpty">Connect Google first, then your available calendars will appear here.</div>`;
      return;
    }
    const selected = new Set(data.selectedCalendarIds || []);
    choices.innerHTML = (data.calendars || []).map(calendar => `<label class="calendarChoice"><input type="checkbox" data-calendar-id="${escapeHtml(calendar.id)}" ${selected.has(calendar.id) ? "checked" : ""}/><span><b>${escapeHtml(calendar.name)}</b><small>${calendar.primary ? "Google primary calendar" : escapeHtml(calendar.accessRole)}</small></span><span class="primaryPick"><input type="radio" name="apex-primary-calendar" value="${escapeHtml(calendar.id)}" ${data.primaryCalendarId === calendar.id ? "checked" : ""}/> Primary</span></label>`).join("") || `<div class="googleEmpty">No writable calendars were found.</div>`;
    const save = document.createElement("button");
    save.textContent = "Save calendar selection";
    save.addEventListener("click", async () => {
      const ids = [...choices.querySelectorAll("[data-calendar-id]:checked")].map(input => input.dataset.calendarId);
      const primary = choices.querySelector('input[name="apex-primary-calendar"]:checked')?.value || ids[0];
      save.disabled = true;
      try {
        await saveGoogleCalendarSelection({ selectedCalendarIds: ids, primaryCalendarId: primary });
        toast("Google Calendar selection saved.");
      } catch (error) {
        toast(error.message || "Could not save calendar selection.");
      } finally {
        save.disabled = false;
      }
    });
    choices.appendChild(save);
  } catch (error) {
    statusBox.classList.remove("connected");
    statusBox.innerHTML = `<i>!</i><span><b>Could not check Google</b><small>${escapeHtml(error.message)}</small></span>`;
    choices.innerHTML = `<div class="googleEmpty">The new calendar functions may still be deploying. Refresh again shortly.</div>`;
  }
}

async function mountProspects() {
  const main = hostMain();
  if (!main || document.querySelector("[data-google-prospects-panel]")) return;
  const panel = document.createElement("section");
  panel.dataset.googleProspectsPanel = "true";
  panel.className = "googlePanel";
  panel.innerHTML = `<header><div><span class="eyebrow">GOOGLE CALENDAR LEADS</span><h3>Potential customers</h3><p>Apex reads upcoming selected-calendar events and asks before creating any customer.</p></div><div class="googleActions"><button data-scan>Scan calendars</button></div></header><div class="prospectGrid" data-prospect-grid><div class="googleEmpty">Tap Scan calendars to look for potential customers.</div></div>`;
  main.prepend(panel);
  panel.querySelector("[data-scan]").addEventListener("click", event => scanProspects(panel, event.currentTarget));
}

async function scanProspects(panel, button) {
  const grid = panel.querySelector("[data-prospect-grid]");
  button.disabled = true;
  button.textContent = "Scanning…";
  grid.innerHTML = `<div class="googleEmpty">Reading upcoming events from your selected Google Calendars…</div>`;
  try {
    const result = await scanGoogleCalendarProspects({ days: 180 });
    prospectRows = result.suggestions || [];
    renderProspects(grid);
    toast(`Scanned ${result.scannedCalendars || 0} Google Calendar${result.scannedCalendars === 1 ? "" : "s"}.`);
  } catch (error) {
    grid.innerHTML = `<div class="googleEmpty">${escapeHtml(error.message || "Calendar scan failed.")}</div>`;
  } finally {
    button.disabled = false;
    button.textContent = "Scan calendars";
  }
}

function renderProspects(grid) {
  if (!prospectRows.length) {
    grid.innerHTML = `<div class="googleEmpty">No new customer suggestions were found.</div>`;
    return;
  }
  grid.innerHTML = prospectRows.map((row, index) => `<article class="prospectCard" data-prospect-index="${index}"><header><div><span class="source">${escapeHtml(row.calendarName)}</span><h4>${escapeHtml(row.name)}</h4><p>${escapeHtml(row.eventTitle)} · ${row.eventStart ? new Date(row.eventStart).toLocaleDateString("en-NZ") : "Upcoming event"}</p></div>${row.existingCustomerId ? `<div class="existingMatch">Matches ${escapeHtml(row.existingCustomerName)}</div>` : ""}</header>${row.missing?.length ? `<div class="missingFields">Needs ${row.missing.join(" and ")} before saving.</div>` : ""}<div class="prospectMeta"><label>Name<input data-field="name" value="${escapeHtml(row.name)}"/></label><label>Email<input data-field="email" type="email" value="${escapeHtml(row.email)}" placeholder="Add email"/></label><label>Mobile<input data-field="phone" value="${escapeHtml(row.phone)}" placeholder="Add mobile"/></label><label>Address<input data-field="address" value="${escapeHtml(row.address)}" placeholder="Optional address"/></label></div><div class="prospectButtons">${row.existingCustomerId ? "" : `<button data-save>Complete & add customer</button>`}<button class="secondary" data-dismiss>${row.existingCustomerId ? "Hide suggestion" : "Not a customer"}</button></div></article>`).join("");
  grid.querySelectorAll("[data-prospect-index]").forEach(card => {
    const row = prospectRows[Number(card.dataset.prospectIndex)];
    card.querySelector("[data-save]")?.addEventListener("click", async event => {
      const button = event.currentTarget;
      const payload = { ...row };
      card.querySelectorAll("[data-field]").forEach(input => { payload[input.dataset.field] = input.value.trim(); });
      button.disabled = true;
      try {
        await saveGoogleCalendarProspect(payload);
        prospectRows = prospectRows.filter(item => item.eventId !== row.eventId);
        renderProspects(grid);
        toast(`${payload.name} added to Apex customers.`);
      } catch (error) {
        button.disabled = false;
        toast(error.message || "Could not add customer.");
      }
    });
    card.querySelector("[data-dismiss]").addEventListener("click", async event => {
      event.currentTarget.disabled = true;
      try {
        await dismissGoogleCalendarProspect({ eventId: row.eventId });
        prospectRows = prospectRows.filter(item => item.eventId !== row.eventId);
        renderProspects(grid);
      } catch (error) {
        event.currentTarget.disabled = false;
        toast(error.message || "Could not dismiss suggestion.");
      }
    });
  });
}

function tick() {
  injectStyles();
  const view = currentView();
  if (!view) return;
  removeForeignPanels(view);
  if (view !== activeView) {
    activeView = view;
    settingsLoaded = false;
    prospectsLoaded = false;
  }
  if (view === "settings" && !settingsLoaded) {
    settingsLoaded = true;
    mountSettings().catch(error => { settingsLoaded = false; console.error(error); });
  }
  if (view === "customers" && !prospectsLoaded) {
    prospectsLoaded = true;
    mountProspects().catch(error => { prospectsLoaded = false; console.error(error); });
  }
}

setInterval(tick, 600);
tick();
