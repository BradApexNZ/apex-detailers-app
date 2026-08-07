from pathlib import Path
import re

p = Path("functions/index.js")
s = p.read_text()


def sub_once(pattern, replacement, label):
    global s
    updated, count = re.subn(pattern, replacement, s, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label} target count={count}")
    s = updated


if "const publicServiceIds" not in s:
    s = s.replace(
        "];\n\nconst defaults = {",
        "];\nconst publicServiceIds = new Set([\"deep\", \"full\", \"tradie\", \"seats\"]);\n\nconst defaults = {",
        1,
    )

sub_once(
    r"async function connectedGoogle\(\) \{.*?\n\}\n\nasync function calendarBusy\(start, end\) \{.*?\n\}\n\nasync function availableSlots",
    '''async function connectedGoogle() {
  const snapshot = await db.doc("integrations/google").get();
  if (!snapshot.exists || !snapshot.data().refreshToken) return null;
  const data = snapshot.data();
  const client = oauthClient();
  client.setCredentials({ refresh_token: decrypt(data.refreshToken) });
  return { client, data, email: data.email || OWNER_EMAIL.value() };
}

async function calendarRows(client) {
  const api = google.calendar({ version: "v3", auth: client });
  const rows = [];
  let pageToken;
  do {
    const response = await api.calendarList.list({ pageToken, maxResults: 250, showHidden: false });
    rows.push(...(response.data.items || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  return rows.filter(row => row.id && ["owner", "writer", "reader"].includes(row.accessRole));
}

async function calendarConfig(connected) {
  const rows = await calendarRows(connected.client);
  const allowed = new Set(rows.map(row => row.id));
  const writableIds = new Set(rows.filter(row => ["owner", "writer"].includes(row.accessRole)).map(row => row.id));
  const configured = Array.isArray(connected.data.selectedCalendarIds)
    ? connected.data.selectedCalendarIds.filter(id => allowed.has(id))
    : [];
  const fallback = rows.filter(row => row.primary).map(row => row.id);
  const selectedCalendarIds = configured.length ? configured : fallback;
  const requestedPrimary = text(connected.data.primaryCalendarId, 300);
  const primaryCalendarId = selectedCalendarIds.includes(requestedPrimary) && writableIds.has(requestedPrimary)
    ? requestedPrimary
    : selectedCalendarIds.find(id => writableIds.has(id)) || "";
  return { rows, selectedCalendarIds, primaryCalendarId };
}

async function calendarBusy(start, end) {
  const connected = await connectedGoogle();
  if (!connected) return [];
  try {
    const config = await calendarConfig(connected);
    if (!config.selectedCalendarIds.length) return [];
    const response = await google.calendar({ version: "v3", auth: connected.client }).freebusy.query({
      requestBody: {
        timeMin: start.toUTC().toISO(),
        timeMax: end.toUTC().toISO(),
        timeZone: ZONE.value(),
        items: config.selectedCalendarIds.map(id => ({ id }))
      }
    });
    const blocked = [];
    for (const id of config.selectedCalendarIds) {
      for (const row of response.data.calendars?.[id]?.busy || []) {
        blocked.push({ start: DateTime.fromISO(row.start), end: DateTime.fromISO(row.end), calendarId: id });
      }
    }
    return blocked;
  } catch (error) {
    console.error("Calendar freebusy failed", error);
    throw new HttpsError("unavailable", "Google Calendar availability could not be verified. Please try again shortly.");
  }
}

async function availableSlots''',
    "calendar helpers",
)

sub_once(
    r"async function createCalendarEvent\(data, eventId\) \{.*?\n\}\n\nasync function deleteCalendarEvent\(eventId\) \{.*?\n\}\n\nexport const getPublicBookingConfig",
    '''async function createCalendarEvent(data, eventId = "", existingCalendarId = "") {
  const connected = await connectedGoogle();
  if (!connected) return { eventId: "", calendarId: "" };
  const config = await calendarConfig(connected);
  const calendarId = existingCalendarId || data.calendarId || data.sourceCalendarId || config.primaryCalendarId;
  if (!calendarId) throw new HttpsError("failed-precondition", "No writable primary Google Calendar is selected for Apex.");
  const calendar = google.calendar({ version: "v3", auth: connected.client });
  const start = parseLocal(data.bookingDate, data.bookingTime);
  const end = data.bookingEndTime
    ? parseLocal(data.bookingDate, data.bookingEndTime)
    : start.plus({ minutes: Number(data.durationMinutes || serviceById(data.packageId || data.serviceId).durationMinutes) });
  const requestBody = {
    summary: `Apex — ${data.customerName} — ${data.packageName || data.serviceName}`,
    location: [data.address, data.area].filter(Boolean).join(", "),
    description: [
      `Vehicle: ${data.vehicle || [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" ")}`,
      `Rego: ${data.rego || ""}`,
      `Phone: ${data.phone || ""}`,
      `Email: ${data.email || ""}`,
      `Notes: ${data.notes || ""}`
    ].join("\\n"),
    start: { dateTime: start.toISO(), timeZone: ZONE.value() },
    end: { dateTime: end.toISO(), timeZone: ZONE.value() },
    extendedProperties: { private: { apexJobId: data.jobId || "", apexRequestId: data.requestId || "", apexLaunch: "true" } }
  };
  const response = eventId
    ? await calendar.events.update({ calendarId, eventId, requestBody, sendUpdates: "none" })
    : await calendar.events.insert({ calendarId, requestBody, sendUpdates: "none" });
  return { eventId: response.data.id || eventId, calendarId };
}

async function deleteCalendarEvent(eventId, calendarId = "") {
  if (!eventId) return;
  try {
    const connected = await connectedGoogle();
    if (!connected) return;
    const config = await calendarConfig(connected);
    const targetCalendar = calendarId || config.primaryCalendarId;
    if (!targetCalendar) return;
    await google.calendar({ version: "v3", auth: connected.client }).events.delete({ calendarId: targetCalendar, eventId, sendUpdates: "none" });
  } catch (error) {
    if (![404, 410].includes(error?.code)) console.error("Calendar delete failed", error);
  }
}

async function findCustomer(data) {
  if (data.email) {
    const match = await db.collection("customers").where("email", "==", data.email).limit(1).get();
    if (!match.empty) return match.docs[0].ref;
  }
  if (data.phone) {
    const match = await db.collection("customers").where("phone", "==", data.phone).limit(1).get();
    if (!match.empty) return match.docs[0].ref;
  }
  return db.collection("customers").doc();
}

export const getPublicBookingConfig''',
    "calendar CRUD",
)

s = s.replace(
    "    services\n  };\n});",
    "    services: services.filter(service => publicServiceIds.has(service.id))\n  };\n});",
    1,
)
s = s.replace(
    "  const serviceId = text(request.data?.serviceId, 30);\n  return { date, slots: await availableSlots(date, serviceId) };",
    "  const serviceId = text(request.data?.serviceId, 30);\n  if (!publicServiceIds.has(serviceId)) throw new HttpsError(\"invalid-argument\", \"Choose a publicly available Apex service.\");\n  return { date, slots: await availableSlots(date, serviceId) };",
    1,
)
s = s.replace(
    "  if (input.website) throw new HttpsError(\"invalid-argument\", \"Unable to submit.\");\n  const service = serviceById(text(input.serviceId, 30));",
    "  if (input.website) throw new HttpsError(\"invalid-argument\", \"Unable to submit.\");\n  const requestedServiceId = text(input.serviceId, 30);\n  if (!publicServiceIds.has(requestedServiceId)) throw new HttpsError(\"invalid-argument\", \"Choose a publicly available Apex service.\");\n  const service = serviceById(requestedServiceId);",
    1,
)
s = s.replace("bookingEndTime: text(input.bookingEndTime, 5),", "bookingEndTime: \"\",", 1)

required = '''  if (!data.customerName || !data.phone || !data.email || !data.address || !data.vehicleMake || !data.vehicleModel || !data.bookingDate || !data.bookingTime) {
    throw new HttpsError("invalid-argument", "Complete the required booking details.");
  }

  const options = await availableSlots(data.bookingDate, data.serviceId);'''
if required not in s:
    raise SystemExit("public booking validation target missing")
s = s.replace(
    required,
    required.replace(
        "\n\n  const options",
        "\n  const requestedStart = parseLocal(data.bookingDate, data.bookingTime);\n  data.bookingEndTime = requestedStart.plus({ minutes: service.durationMinutes }).toFormat(\"HH:mm\");\n\n  const options",
    ),
    1,
)

pending_old = '''  let eventId = null;
  try {
    eventId = await createCalendarEvent({ ...data, requestId: requestReference.id, serviceName: `PENDING — ${service.name}` });
    if (eventId) await requestReference.set({ calendarEventId: eventId }, { merge: true });'''
pending_new = '''  let eventId = "";
  try {
    const calendarResult = await createCalendarEvent({ ...data, requestId: requestReference.id, serviceName: `PENDING — ${service.name}` });
    eventId = calendarResult.eventId;
    if (eventId) await requestReference.set({ calendarEventId: eventId, calendarId: calendarResult.calendarId, calendarSyncStatus: "pending-hold-synced", calendarSyncedAt: FieldValue.serverTimestamp() }, { merge: true });'''
if pending_old not in s:
    raise SystemExit("pending calendar target missing")
s = s.replace(pending_old, pending_new, 1)

approve_old = '''  const eventId = await createCalendarEvent({ ...job, jobId: jobReference.id }, item.calendarEventId);
  if (eventId) await jobReference.set({ calendarEventId: eventId }, { merge: true });'''
approve_new = '''  const calendarResult = await createCalendarEvent({ ...job, jobId: jobReference.id }, item.calendarEventId || "", item.calendarId || "");
  const eventId = calendarResult.eventId;
  if (eventId) await jobReference.set({ calendarEventId: eventId, calendarId: calendarResult.calendarId, calendarSyncStatus: "synced", calendarSyncedAt: FieldValue.serverTimestamp() }, { merge: true });'''
if approve_old not in s:
    raise SystemExit("approval calendar target missing")
s = s.replace(approve_old, approve_new, 1)
s = s.replace("await deleteCalendarEvent(item.calendarEventId);", "await deleteCalendarEvent(item.calendarEventId, item.calendarId);", 1)

s = s.replace(
    "if (!data.customerName || !data.email || !data.phone || !data.bookingDate || !data.bookingTime)",
    "if (!data.customerName || !data.phone || !data.bookingDate || !data.bookingTime)",
    1,
)

manual_customer_old = '  const customerReference = db.collection("customers").doc();\n  const jobReference = db.collection("jobs").doc();'
manual_customer_new = '  const customerReference = await findCustomer(data);\n  const existingCustomer = await customerReference.get();\n  const jobReference = db.collection("jobs").doc();'
if manual_customer_old not in s:
    raise SystemExit("manual customer target missing")
s = s.replace(manual_customer_old, manual_customer_new, 1)

sub_once(
    r"  batch\.set\(customerReference, \{\n    firstName:.*?\n    updatedAt: FieldValue\.serverTimestamp\(\)\n  \}\);",
    '''  batch.set(customerReference, {
    ...(existingCustomer.exists ? {} : {
      firstName: parts.shift() || data.customerName,
      lastName: parts.join(" "),
      customerName: data.customerName,
      customerType: "standard",
      preferredContact: "email",
      createdAt: FieldValue.serverTimestamp()
    }),
    phone: data.phone,
    email: data.email,
    address: data.address,
    area: data.area,
    lastVehicle: vehicle,
    lastJobStatus: "Booked",
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });''',
    "manual customer upsert",
)

manual_event_old = '''  const eventId = await createCalendarEvent({ ...data, vehicle, jobId: jobReference.id });
  if (eventId) await jobReference.set({ calendarEventId: eventId }, { merge: true });'''
manual_event_new = '''  const calendarResult = await createCalendarEvent({ ...data, vehicle, jobId: jobReference.id });
  const eventId = calendarResult.eventId;
  if (eventId) await jobReference.set({ calendarEventId: eventId, calendarId: calendarResult.calendarId, calendarSyncStatus: "synced", calendarSyncedAt: FieldValue.serverTimestamp() }, { merge: true });'''
if manual_event_old not in s:
    raise SystemExit("manual Calendar target missing")
s = s.replace(manual_event_old, manual_event_new, 1)

sub_once(
    r"export const getGoogleCalendarStatus = onCall\(\{ region: REGION, secrets: GOOGLE_SECRETS \}, async request => \{.*?\n\}\);\n\nexport const startGoogleCalendarConnect",
    '''export const getGoogleCalendarStatus = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const connected = await connectedGoogle();
  if (!connected) return { connected: false, email: "", calendars: [], selectedCalendarIds: [], primaryCalendarId: "", healthy: false };
  try {
    const config = await calendarConfig(connected);
    return {
      connected: true,
      email: connected.email,
      connectedAt: connected.data.connectedAt?.toDate?.()?.toISOString?.() || null,
      calendars: config.rows.map(row => ({ id: row.id, name: row.summaryOverride || row.summary || row.id, primary: Boolean(row.primary), accessRole: row.accessRole || "reader", writable: ["owner", "writer"].includes(row.accessRole) })),
      selectedCalendarIds: config.selectedCalendarIds,
      primaryCalendarId: config.primaryCalendarId,
      healthy: Boolean(config.selectedCalendarIds.length && config.primaryCalendarId)
    };
  } catch (error) {
    return { connected: true, email: connected.email, calendars: [], selectedCalendarIds: [], primaryCalendarId: "", healthy: false, reason: "google-api-error", error: text(error?.message, 500) };
  }
});

export const startGoogleCalendarConnect''',
    "calendar status",
)

sub_once(
    r"export const syncJobToCalendar = onCall\(\{ region: REGION, secrets: GOOGLE_SECRETS \}, async request => \{.*?\n\}\);",
    '''export const syncJobToCalendar = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const reference = db.doc(`jobs/${text(request.data?.jobId, 80)}`);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Job not found.");
  const job = { jobId: snapshot.id, ...snapshot.data() };
  if (["Cancelled", "Archived"].includes(job.status)) {
    await deleteCalendarEvent(job.calendarEventId, job.calendarId || job.sourceCalendarId || "");
    await reference.set({ calendarSyncStatus: "cancelled", calendarSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { eventId: "", calendarId: job.calendarId || job.sourceCalendarId || "", cancelled: true };
  }
  try {
    const calendarResult = await createCalendarEvent(job, job.calendarEventId || "", job.calendarId || job.sourceCalendarId || "");
    await reference.set({ calendarEventId: calendarResult.eventId, calendarId: calendarResult.calendarId, calendarSyncStatus: "synced", calendarSyncedAt: FieldValue.serverTimestamp(), calendarSyncError: FieldValue.delete() }, { merge: true });
    return calendarResult;
  } catch (error) {
    await reference.set({ calendarSyncStatus: "failed", calendarSyncError: text(error?.message, 500), calendarSyncAttemptedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw new HttpsError("internal", `Calendar sync failed: ${text(error?.message, 300)}`);
  }
});''',
    "sync job",
)

p.write_text(s)
