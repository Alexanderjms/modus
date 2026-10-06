export function parseCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = makeDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3])
    && Number(match[1]) > 0
    ? date
    : null;
}

export function formatCalendarDate(date) {
  const year = date.getUTCFullYear();
  return year < 1 || year > 9999
    ? ""
    : `${String(year).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function addCalendarDays(date, amount) {
  return makeDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + amount);
}

export function calendarGrid(year, month) {
  const first = makeDate(year, month, 1);
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) =>
    formatCalendarDate(makeDate(year, month, index - mondayOffset + 1)),
  );
}

function makeDate(year, month, day) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month, day);
  return date;
}
