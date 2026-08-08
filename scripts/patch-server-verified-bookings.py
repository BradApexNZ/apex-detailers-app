from pathlib import Path

p = Path("functions/index.js")
s = p.read_text()

old = '''  lockSnapshot.forEach(document => {
    const data = document.data();
    blocked.push({ start: parseLocal(date, data.startTime), end: parseLocal(date, data.endTime) });
  });'''
new = '''  lockSnapshot.forEach(document => {
    const data = document.data();
    if (data.serverVerified !== true) return;
    blocked.push({ start: parseLocal(date, data.startTime), end: parseLocal(date, data.endTime) });
  });'''
if old not in s:
    raise SystemExit("lock filter target missing")
s = s.replace(old, new, 1)

old = '''    transaction.create(lockReference, {
      date: data.bookingDate,
      startTime: data.bookingTime,
      endTime: data.bookingEndTime,
      requestId: requestReference.id,
      status: "pending",
      createdAt: FieldValue.serverTimestamp()
    });'''
new = '''    transaction.create(lockReference, {
      date: data.bookingDate,
      startTime: data.bookingTime,
      endTime: data.bookingEndTime,
      requestId: requestReference.id,
      status: "pending",
      serverVerified: true,
      createdAt: FieldValue.serverTimestamp()
    });'''
if old not in s:
    raise SystemExit("public lock creation target missing")
s = s.replace(old, new, 1)

old = '''    transaction.create(requestReference, {
      ...data,
      lockId: lockReference.id,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });'''
new = '''    transaction.create(requestReference, {
      ...data,
      lockId: lockReference.id,
      serverVerified: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });'''
if old not in s:
    raise SystemExit("public request creation target missing")
s = s.replace(old, new, 1)

old = '''    source: "hq-manual",
    createdAt: FieldValue.serverTimestamp()'''
new = '''    source: "hq-manual",
    serverVerified: true,
    createdAt: FieldValue.serverTimestamp()'''
if old not in s:
    raise SystemExit("manual lock target missing")
s = s.replace(old, new, 1)

p.write_text(s)
