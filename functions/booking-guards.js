const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function timeToMinutes(value) {
  const input = String(value || "");
  if (!timePattern.test(input)) return null;
  const [hours, minutes] = input.split(":").map(Number);
  return hours * 60 + minutes;
}

export function bookingRangesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  return firstStart < secondEnd && firstEnd > secondStart;
}

function rowRange(row) {
  const start = timeToMinutes(row.startTime || row.bookingTime);
  if (start == null) return null;
  const explicitEnd = timeToMinutes(row.endTime || row.bookingEndTime);
  const duration = Number(row.durationMinutes || 0);
  const end = explicitEnd != null && explicitEnd > start ? explicitEnd : start + duration;
  return end > start ? { start, end } : null;
}

export function hasBookingConflict({ startTime, endTime, locks = [], jobs = [], ignoreLockId = "", ignoreJobId = "" }) {
  const requestedStart = timeToMinutes(startTime);
  const requestedEnd = timeToMinutes(endTime);
  if (requestedStart == null || requestedEnd == null || requestedEnd <= requestedStart) return true;

  const activeLocks = locks.filter(row => row.id !== ignoreLockId && row.serverVerified === true);
  const activeJobs = jobs.filter(row => row.id !== ignoreJobId && !["Archived", "Cancelled"].includes(row.status));
  return [...activeLocks, ...activeJobs].some(row => {
    const range = rowRange(row);
    return range ? bookingRangesOverlap(requestedStart, requestedEnd, range.start, range.end) : false;
  });
}
