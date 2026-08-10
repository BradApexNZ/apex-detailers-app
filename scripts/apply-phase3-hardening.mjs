import fs from "node:fs";

const path = "functions/index.js";
let source = fs.readFileSync(path, "utf8");
const replace = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Missing Phase 3 target: ${label}`);
  source = source.replace(from, to);
};

replace(
`  const data = {
    customerName: text(input.customerName, 160),`,
`  const bookingConfig = await getSettings();
  const data = {
    customerName: text(input.customerName, 160),`,
"booking config before public submit"
);

replace(
`  if (!data.customerName || !data.phone || !data.email || !data.address || !data.vehicleMake || !data.vehicleModel || !data.bookingDate || !data.bookingTime) {
    throw new HttpsError("invalid-argument", "Complete the required booking details.");
  }
  const requestedStart = parseLocal(data.bookingDate, data.bookingTime);`,
`  if (!data.customerName || !data.phone || !data.email || !data.address || !data.vehicleMake || !data.vehicleModel || !data.bookingDate || !data.bookingTime) {
    throw new HttpsError("invalid-argument", "Complete the required booking details.");
  }
  if (!Boolean(input.acceptedTerms)) throw new HttpsError("invalid-argument", "Accept the booking and pricing conditions before submitting.");
  if (!/^\\S+@\\S+\\.\\S+$/.test(data.email)) throw new HttpsError("invalid-argument", "Enter a valid email address.");
  if (data.phone.replace(/\\D/g, "").length < 7) throw new HttpsError("invalid-argument", "Enter a valid phone number.");
  if (!(bookingConfig.serviceAreas || []).map(value => String(value).toLowerCase()).includes(data.area.toLowerCase())) {
    throw new HttpsError("invalid-argument", "Choose an Apex service area from the booking form.");
  }
  const requestedStart = parseLocal(data.bookingDate, data.bookingTime);`,
"public submit validation"
);

replace(
`  let eventId = "";
  try {
    const calendarResult = await createCalendarEvent({ ...data, requestId: requestReference.id, serviceName: \`PENDING — \${service.name}\` });
    eventId = calendarResult.eventId;
    if (eventId) await requestReference.set({ calendarEventId: eventId, calendarId: calendarResult.calendarId, calendarSyncStatus: "pending-hold-synced", calendarSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error("Pending calendar hold failed", error);
  }
  const config = await getSettings();
  const emails = await notifyRequest(data, config);`,
`  let eventId = "";
  let calendarId = "";
  let calendarError = "";
  try {
    const calendarResult = await createCalendarEvent({ ...data, requestId: requestReference.id, serviceName: \`PENDING — \${service.name}\` });
    eventId = calendarResult.eventId;
    calendarId = calendarResult.calendarId;
    await requestReference.set({
      calendarEventId: eventId,
      calendarId,
      calendarSyncStatus: eventId ? "pending-hold-synced" : "not-connected",
      calendarSyncedAt: eventId ? FieldValue.serverTimestamp() : null,
      calendarSyncError: FieldValue.delete()
    }, { merge: true });
  } catch (error) {
    console.error("Pending calendar hold failed", error);
    calendarError = text(error?.message, 500) || "Calendar hold failed.";
    await requestReference.set({
      calendarSyncStatus: "failed",
      calendarSyncError: calendarError,
      calendarSyncAttemptedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  const config = bookingConfig;
  const emails = await notifyRequest(data, config);`,
"public Calendar hold status"
);

replace(
`    emailSent: emails.customer
  };`,
`    emailSent: emails.customer,
    calendarStatus: calendarError ? "needs-retry" : (eventId ? "held" : "not-connected")
  };`,
"public response Calendar state"
);

replace(
`  const calendarResult = await createCalendarEvent({ ...job, jobId: jobReference.id }, item.calendarEventId || "", item.calendarId || "");
  const eventId = calendarResult.eventId;
  if (eventId) await jobReference.set({ calendarEventId: eventId, calendarId: calendarResult.calendarId, calendarSyncStatus: "synced", calendarSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
  const config = await getSettings();
  const emails = await notifyConfirmed(job, config);
  await reference.set({ confirmationEmailStatus: emails }, { merge: true });
  return { jobId: jobReference.id, calendarEventId: eventId, emails };`,
`  let eventId = "";
  let calendarId = item.calendarId || "";
  let calendarError = "";
  try {
    const calendarResult = await createCalendarEvent({ ...job, jobId: jobReference.id }, item.calendarEventId || "", item.calendarId || "");
    eventId = calendarResult.eventId;
    calendarId = calendarResult.calendarId;
    await jobReference.set({
      calendarEventId: eventId,
      calendarId,
      calendarSyncStatus: eventId ? "synced" : "not-connected",
      calendarSyncedAt: eventId ? FieldValue.serverTimestamp() : null,
      calendarSyncError: FieldValue.delete()
    }, { merge: true });
  } catch (error) {
    console.error("Approved booking Calendar sync failed after commit", error);
    calendarError = text(error?.message, 500) || "Calendar sync failed.";
    await jobReference.set({
      calendarSyncStatus: "failed",
      calendarSyncError: calendarError,
      calendarSyncAttemptedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  const config = await getSettings();
  const emails = await notifyConfirmed(job, config);
  await reference.set({ confirmationEmailStatus: emails, calendarSyncStatus: calendarError ? "failed" : (eventId ? "synced" : "not-connected"), calendarSyncError: calendarError || FieldValue.delete() }, { merge: true });
  return { jobId: jobReference.id, calendarEventId: eventId, calendarId, calendarError, emails };`,
"approval Calendar repair"
);

const marker = `export const syncJobToCalendar = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {`;
if (!source.includes("export const importGoogleCalendarEvents =")) {
  const importer = `export const importGoogleCalendarEvents = onCall({ region: REGION, secrets: GOOGLE_SECRETS }, async request => {
  requireOwner(request);
  const connected = await connectedGoogle();
  if (!connected) throw new HttpsError("failed-precondition", "Connect Google Calendar before importing events.");
  const config = await calendarConfig(connected);
  if (!config.selectedCalendarIds.length) throw new HttpsError("failed-precondition", "Select at least one Google Calendar first.");

  const daysBack = Math.max(0, Math.min(365, Number(request.data?.daysBack ?? 30)));
  const daysForward = Math.max(1, Math.min(730, Number(request.data?.daysForward ?? 365)));
  const timeMin = DateTime.now().setZone(ZONE.value()).minus({ days: daysBack }).startOf("day");
  const timeMax = DateTime.now().setZone(ZONE.value()).plus({ days: daysForward }).endOf("day");
  const calendar = google.calendar({ version: "v3", auth: connected.client });
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const calendarId of config.selectedCalendarIds) {
    let pageToken;
    do {
      const response = await calendar.events.list({
        calendarId,
        timeMin: timeMin.toUTC().toISO(),
        timeMax: timeMax.toUTC().toISO(),
        singleEvents: true,
        orderBy: "startTime",
        showDeleted: false,
        maxResults: 2500,
        pageToken
      });
      for (const event of response.data.items || []) {
        if (!event.id || event.status === "cancelled") continue;
        if (event.extendedProperties?.private?.apexLaunch === "true" || event.extendedProperties?.private?.apexJobId) {
          skipped += 1;
          continue;
        }
        const rawStart = event.start?.dateTime || event.start?.date;
        const rawEnd = event.end?.dateTime || event.end?.date;
        if (!rawStart || !rawEnd) continue;
        const start = DateTime.fromISO(rawStart, { zone: ZONE.value() }).setZone(ZONE.value());
        const end = DateTime.fromISO(rawEnd, { zone: ZONE.value() }).setZone(ZONE.value());
        if (!start.isValid || !end.isValid) continue;
        const externalId = crypto.createHash("sha256").update(calendarId + ":" + event.id).digest("hex").slice(0, 40);
        const reference = db.doc("jobs/google_" + externalId);
        const existing = await reference.get();
        const allDay = !event.start?.dateTime;
        const payload = {
          customerName: text(event.summary || "Google Calendar event", 160),
          vehicle: "External calendar event",
          packageName: "Google Calendar",
          bookingDate: start.toFormat("yyyy-MM-dd"),
          bookingTime: allDay ? "00:00" : start.toFormat("HH:mm"),
          bookingEndTime: allDay ? "23:59" : end.toFormat("HH:mm"),
          durationMinutes: Math.max(1, Math.round(end.diff(start, "minutes").minutes)),
          status: "Confirmed",
          mode: "calendar-block",
          source: "google-calendar",
          sourceCalendarId: calendarId,
          sourceCalendarEventId: event.id,
          calendarEventId: event.id,
          calendarId,
          calendarSyncStatus: "imported",
          notes: text(event.description || "", 1500),
          address: text(event.location || "", 220),
          googleHtmlLink: text(event.htmlLink || "", 500),
          updatedAt: FieldValue.serverTimestamp(),
          ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() })
        };
        await reference.set(payload, { merge: true });
        if (existing.exists) updated += 1;
        else imported += 1;
      }
      pageToken = response.data.nextPageToken;
    } while (pageToken);
  }

  return { imported, updated, skipped };
});

`;
  source = source.replace(marker, importer + marker);
}

fs.writeFileSync(path, source);
console.log("Phase 3 hardening applied.");
