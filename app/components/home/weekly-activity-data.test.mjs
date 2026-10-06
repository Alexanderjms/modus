import assert from "node:assert/strict";
import test from "node:test";
import { parseWeeklyActivity } from "./weekly-activity-data.mjs";

const dates = [
  "2025-03-28",
  "2025-03-29",
  "2025-03-30",
  "2025-03-31",
  "2025-04-01",
  "2025-04-02",
  "2025-04-03",
];

function response(counts = [0, 1, 2, 0, 3, 0, 1]) {
  return {
    days: dates.map((date, index) => ({ date, completed: counts[index] })),
    historyNotice: "La actividad se registra desde esta actualización.",
  };
}

test("valida siete fechas consecutivas, prepara fecha local al mediodía y suma actividad", () => {
  const activity = parseWeeklyActivity(response());

  assert.equal(activity.days.length, 7);
  assert.equal(activity.total, 7);
  assert.equal(activity.days[0].localDate.getHours(), 12);
  assert.equal(activity.days[6].localDate.getDate(), 3);
});

test("rechaza cantidades inválidas, días fuera de secuencia y contratos incompletos", () => {
  assert.throws(() => parseWeeklyActivity(response([-1, 0, 0, 0, 0, 0, 0])));
  assert.throws(() => parseWeeklyActivity(response([0, 1.5, 0, 0, 0, 0, 0])));

  const skippedDay = response();
  skippedDay.days[2].date = "2025-03-31";
  assert.throws(() => parseWeeklyActivity(skippedDay));

  assert.throws(() => parseWeeklyActivity({ ...response(), days: [] }));
  assert.throws(() => parseWeeklyActivity({ ...response(), historyNotice: " " }));
});
