import test from "node:test";
import assert from "node:assert/strict";
import { bookingRangesOverlap, hasBookingConflict, timeToMinutes } from "./booking-guards.js";

test("converts valid booking times and rejects malformed values", () => {
  assert.equal(timeToMinutes("08:30"), 510);
  assert.equal(timeToMinutes("23:59"), 1439);
  assert.equal(timeToMinutes("8:30"), null);
  assert.equal(timeToMinutes("24:00"), null);
});

test("detects overlapping ranges but allows touching boundaries", () => {
  assert.equal(bookingRangesOverlap(480, 780, 510, 810), true);
  assert.equal(bookingRangesOverlap(480, 780, 780, 840), false);
});

test("blocks a different start time that overlaps an existing lock", () => {
  assert.equal(
    hasBookingConflict({
      startTime: "08:30",
      endTime: "13:30",
      locks: [{ id: "08-00", startTime: "08:00", endTime: "13:00", serverVerified: true }]
    }),
    true
  );
});

test("ignores unverified locks and cancelled jobs", () => {
  assert.equal(
    hasBookingConflict({
      startTime: "08:30",
      endTime: "13:30",
      locks: [{ id: "fake", startTime: "08:00", endTime: "13:00", serverVerified: false }],
      jobs: [{ id: "cancelled", bookingTime: "08:00", bookingEndTime: "13:00", status: "Cancelled" }]
    }),
    false
  );
});

test("uses job duration when an explicit end time is absent", () => {
  assert.equal(
    hasBookingConflict({
      startTime: "12:00",
      endTime: "18:00",
      jobs: [{ id: "job", bookingTime: "08:00", durationMinutes: 300, status: "Booked" }]
    }),
    true
  );
});
