"use strict";

const assert = require("node:assert");
const { DatabaseSync } = require("node:sqlite");
const { applySchema } = require("../../../../db/local/migrate.cjs");
const {
  getWeeklyActivity,
  createProjectTask,
  moveProjectTask,
  updateProjectTask,
  ensureTaskCompletionsTable,
} = require("../../../../db/local/tasks.cjs");

function runActivityTests() {
  console.log("Iniciando pruebas unitarias de API y servicio de actividad semanal...");

  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  applySchema(db);

  // Setup usuarios y proyectos
  db.exec("INSERT INTO usuarios (id, nombre) VALUES (1, 'Usuario Propio'), (2, 'Usuario Ajeno')");
  db.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (10, 1, 'Proyecto Propio', 'folder')");
  db.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (20, 2, 'Proyecto Ajeno', 'folder')");

  // 1. Exactamente 7 días con formato YYYY-MM-DD orden ascendente y ceros iniciales
  const fixedNow = new Date("2026-10-06T12:00:00.000Z");
  const initial = getWeeklyActivity(db, 1, fixedNow);

  assert.strictEqual(initial.days.length, 7, "Debe retornar exactamente 7 días");
  assert.strictEqual(initial.historyNotice, "La actividad se registra desde esta actualización.");
  assert.deepStrictEqual(
    initial.days.map((d) => d.date),
    ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"],
    "Ventana de 7 días debe ser estrictamente ascendente finalizando en la fecha actual"
  );
  for (const d of initial.days) {
    assert.strictEqual(d.completed, 0, "Días sin completaciones deben tener valor 0");
  }

  // 2. Transición crear en column=2 (Terminado)
  const taskCreatedDone = createProjectTask(db, { projectId: 10, column: 2, title: "Completada al nacer" });
  let currentActivity = getWeeklyActivity(db, 1, fixedNow);
  const todayEntry = currentActivity.days.find((d) => d.date === "2026-10-06");
  assert(todayEntry);
  assert.strictEqual(todayEntry.completed, 1, "Debe contar 1 tarea completada");

  // 3. Reordenar dentro de columna 2 (same-column move) no debe registrar duplicados
  moveProjectTask(db, { projectId: 10, taskId: taskCreatedDone.id, column: 2 });
  currentActivity = getWeeklyActivity(db, 1, fixedNow);
  assert.strictEqual(currentActivity.days.find((d) => d.date === "2026-10-06").completed, 1);

  // 4. Reabrir a columna 0 y recompletar en el mismo día: contar DISTINCT task por día (solo 1)
  moveProjectTask(db, { projectId: 10, taskId: taskCreatedDone.id, column: 0 });
  moveProjectTask(db, { projectId: 10, taskId: taskCreatedDone.id, column: 2 });
  currentActivity = getWeeklyActivity(db, 1, fixedNow);
  assert.strictEqual(currentActivity.days.find((d) => d.date === "2026-10-06").completed, 1);

  // 5. Segunda tarea completada vía updateProjectTask con statusId = 'Completada'
  const taskTodo = createProjectTask(db, { projectId: 10, column: 0, title: "Tarea normal" });
  const compStatus = db.prepare("SELECT id FROM estados WHERE nombre = 'Completada'").get();
  updateProjectTask(db, { projectId: 10, taskId: taskTodo.id, statusId: compStatus.id });

  currentActivity = getWeeklyActivity(db, 1, fixedNow);
  assert.strictEqual(currentActivity.days.find((d) => d.date === "2026-10-06").completed, 2);

  // 6. Tarea en proyecto ajeno (usuario 2) no afecta al usuario 1
  const taskUser2 = createProjectTask(db, { projectId: 20, column: 2, title: "Tarea ajena" });
  const user1Activity = getWeeklyActivity(db, 1, fixedNow);
  const user2Activity = getWeeklyActivity(db, 2, fixedNow);
  assert.strictEqual(user1Activity.days.find((d) => d.date === "2026-10-06").completed, 2);
  assert.strictEqual(user2Activity.days.find((d) => d.date === "2026-10-06").completed, 1);

  // 7. Simular evento en día anterior dentro de la ventana de 7 días (válido y contabilizado)
  db.prepare(
    "INSERT INTO tarea_completaciones (tarea_id, proyecto_id, completada_en) VALUES (?, ?, ?)"
  ).run(taskTodo.id, 10, "2026-10-03T10:00:00.000Z");

  currentActivity = getWeeklyActivity(db, 1, fixedNow);
  assert.strictEqual(currentActivity.days.find((d) => d.date === "2026-10-03").completed, 1);

  // 8. Evento fuera de la ventana de 7 días (no se cuenta)
  db.prepare(
    "INSERT INTO tarea_completaciones (tarea_id, proyecto_id, completada_en) VALUES (?, ?, ?)"
  ).run(taskTodo.id, 10, "2026-09-01T10:00:00.000Z");

  currentActivity = getWeeklyActivity(db, 1, fixedNow);
  const totalCompletedInWindow = currentActivity.days.reduce((acc, d) => acc + d.completed, 0);
  assert.strictEqual(totalCompletedInWindow, 3, "2 hoy + 1 el día 2026-10-03");

  db.close();
  console.log("✓ Todas las pruebas de actividad semanal pasaron correctamente.");
}

runActivityTests();
