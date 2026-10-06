import assert from "node:assert/strict";
import test from "node:test";
import { addCalendarDays, calendarGrid, formatCalendarDate, parseCalendarDate } from "./date-picker-date.mjs";

test("calendar date math preserves ISO dates and leap days without local timezone parsing", () => {
  const leapDay = parseCalendarDate("2024-02-29");
  assert.ok(leapDay);
  assert.equal(formatCalendarDate(addCalendarDays(leapDay, 1)), "2024-03-01");
  assert.equal(parseCalendarDate("2023-02-29"), null);
  assert.equal(parseCalendarDate("2024-13-01"), null);
});

test("calendar grid contains six Monday-first weeks around the requested month", () => {
  const dates = calendarGrid(2024, 1);
  assert.equal(dates.length, 42);
  assert.equal(dates[0], "2024-01-29");
  assert.equal(dates[31], "2024-02-29");
  assert.equal(parseCalendarDate(dates[0]).getUTCDay(), 1);
  assert.ok(calendarGrid(9999, 11).includes(""));
});
