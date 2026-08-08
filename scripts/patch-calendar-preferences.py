from pathlib import Path

p = Path("functions/index.js")
s = p.read_text()
old = '''  const configured = Array.isArray(connected.data.selectedCalendarIds)
    ? connected.data.selectedCalendarIds.filter(id => allowed.has(id))
    : [];
  const fallback = rows.filter(row => row.primary).map(row => row.id);
  const selectedCalendarIds = configured.length ? configured : fallback;
  const requestedPrimary = text(connected.data.primaryCalendarId, 300);'''
new = '''  const preferenceSnapshot = await db.doc("settings/googleCalendar").get();
  const preferences = preferenceSnapshot.exists ? preferenceSnapshot.data() : {};
  const configured = Array.isArray(preferences.selectedCalendarIds)
    ? preferences.selectedCalendarIds.filter(id => allowed.has(id))
    : [];
  const fallback = rows.filter(row => row.primary).map(row => row.id);
  const selectedCalendarIds = configured.length ? configured : fallback;
  const requestedPrimary = text(preferences.primaryCalendarId, 300);'''
if old not in s:
    raise SystemExit("Calendar preference target missing")
p.write_text(s.replace(old, new, 1))
