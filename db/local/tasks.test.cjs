"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const {
  ensureProjectLists,
  getProjectTasks,
  getProjectTaskById,
  moveProjectTask,
  updateProjectTask,
  getProjectCatalogs,
  createProjectTask,
  isValidIsoDateString,
  getWeeklyActivity,
  ensureTaskCompletionsTable,
} = require("./tasks.cjs");
const { applySchema } = require("./migrate.cjs");

function runAllTests() {
  console.log("Iniciando suite de pruebas de tareas backend...");

  // -------------------------------------------------------------
  // Test 1: Migración desde esquema preexistente sin 'posicion'
  // -------------------------------------------------------------
  {
    const dbOld = new DatabaseSync(":memory:");
    dbOld.exec("PRAGMA foreign_keys = ON;");

    // Crear esquema preexistente "viejo" sin columna 'posicion'
    dbOld.exec(`
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
      CREATE TABLE proyectos (id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id), nombre TEXT NOT NULL, icono TEXT NOT NULL);
      CREATE TABLE listas_tareas (id INTEGER PRIMARY KEY, proyecto_id INTEGER NOT NULL REFERENCES proyectos(id), nombre TEXT NOT NULL, descripcion TEXT, estado TEXT);
      CREATE TABLE prioridades (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, color TEXT, descripcion TEXT);
      CREATE TABLE estados (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, descripcion TEXT);
      CREATE TABLE etiquetas (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, descripcion TEXT);
      CREATE TABLE tareas (
        id INTEGER PRIMARY KEY,
        lista_id INTEGER NOT NULL REFERENCES listas_tareas(id),
        nombre TEXT NOT NULL,
        descripcion TEXT,
        prioridad_id INTEGER REFERENCES prioridades(id),
        estado_id INTEGER REFERENCES estados(id),
        fecha_inicio TEXT,
        fecha_fin TEXT,
        archivos_enlaces TEXT
      );
      CREATE TABLE subtareas (id INTEGER PRIMARY KEY, tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE, nombre TEXT NOT NULL, descripcion TEXT, estado_id INTEGER REFERENCES estados(id));
      CREATE TABLE tarea_etiquetas (tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE, etiqueta_id INTEGER NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE, PRIMARY KEY (tarea_id, etiqueta_id));
    `);

    // Insertar datos previos
    dbOld.exec("INSERT INTO usuarios (id, nombre) VALUES (1, 'User Previo')");
    dbOld.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (1, 1, 'Proyecto Previo', 'folder')");
    dbOld.exec("INSERT INTO listas_tareas (id, proyecto_id, nombre, estado) VALUES (1, 1, 'Por hacer', 'Pendiente')");
    dbOld.exec("INSERT INTO tareas (id, lista_id, nombre) VALUES (100, 1, 'Tarea Vieja 1'), (101, 1, 'Tarea Vieja 2')");

    // Ejecutar applySchema sobre la base existente
    applySchema(dbOld);

    // Verificar que la columna posicion existe y las tareas viejas tienen posicion = 0
    const cols = dbOld.prepare("SELECT name FROM pragma_table_info('tareas')").all().map((c) => c.name);
    assert(cols.includes("posicion"), "La columna 'posicion' debió crearse");

    const etiquetaCols = dbOld.prepare("SELECT name FROM pragma_table_info('etiquetas')").all().map((c) => c.name);
    assert(etiquetaCols.includes("color"), "La columna 'color' en etiquetas debió crearse de forma aditiva");

    const rows = dbOld.prepare("SELECT id, posicion FROM tareas ORDER BY id ASC").all();
    assert.strictEqual(rows[0].posicion, 0);
    assert.strictEqual(rows[1].posicion, 0);

    // Idempotencia: ejecutar applySchema una segunda vez no debe fallar
    applySchema(dbOld);

    dbOld.close();
    console.log("✓ Test 1 pasado: Migración preexistente e idempotencia");
  }

  // -------------------------------------------------------------
  // Test 2: Helper de validación de fechas ISO YYYY-MM-DD
  // -------------------------------------------------------------
  {
    assert.strictEqual(isValidIsoDateString("2026-10-05"), true);
    assert.strictEqual(isValidIsoDateString("2024-02-29"), true); // bisiesto
    assert.strictEqual(isValidIsoDateString("2023-02-29"), false); // no bisiesto
    assert.strictEqual(isValidIsoDateString("2026-13-01"), false); // mes inválido
    assert.strictEqual(isValidIsoDateString("2026-04-31"), false); // abril tiene 30
    assert.strictEqual(isValidIsoDateString("not-a-date"), false);
    assert.strictEqual(isValidIsoDateString(""), false);
    console.log("✓ Test 2 pasado: Validación rigurosa de fechas ISO");
  }

  // -------------------------------------------------------------
  // Base de datos limpia para pruebas funcionales y de integridad
  // -------------------------------------------------------------
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  applySchema(db);

  db.exec("INSERT INTO usuarios (id, nombre) VALUES (1, 'Test User')");
  db.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (10, 1, 'Proyecto A', 'folder')");
  db.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (20, 1, 'Proyecto B', 'folder')");

  // -------------------------------------------------------------
  // Test 3: Creación de tareas y orden secuencial
  // -------------------------------------------------------------
  const t1 = createProjectTask(db, { projectId: 10, column: 0, title: "T1" });
  const t2 = createProjectTask(db, { projectId: 10, column: 0, title: "T2" });
  const t3 = createProjectTask(db, { projectId: 10, column: 0, title: "T3" });

  assert.strictEqual(t1.order, 0);
  assert.strictEqual(t2.order, 1);
  assert.strictEqual(t3.order, 2);
  console.log("✓ Test 3 pasado: Creación y orden secuencial");

  // -------------------------------------------------------------
  // Test 4: Reordenamiento same-column y preservación de estado
  // -------------------------------------------------------------
  {
    // Cambiar estado de t3 a 'Bloqueada'
    const bloqueadaId = db.prepare("SELECT id FROM estados WHERE nombre = 'Bloqueada'").get().id;
    db.prepare("UPDATE tareas SET estado_id = ? WHERE id = ?").run(bloqueadaId, t3.id);

    // Mover t3 antes de t1 en col 0
    const moved = moveProjectTask(db, { projectId: 10, taskId: t3.id, column: 0, beforeTaskId: t1.id });
    assert.strictEqual(moved.status, "Bloqueada", "El estado Bloqueada debió preservarse en same-column");

    const listCols = getProjectTasks(db, 10).filter((t) => t.column === 0);
    assert.deepStrictEqual(listCols.map((t) => t.id), [t3.id, t1.id, t2.id]);
    assert.deepStrictEqual(listCols.map((t) => t.order), [0, 1, 2]);

    // Self-target en same-column debe ser no-op sin desordenar
    const selfTarget = moveProjectTask(db, { projectId: 10, taskId: t3.id, column: 0, beforeTaskId: t3.id });
    assert.strictEqual(selfTarget.id, t3.id);
    const listAfterSelf = getProjectTasks(db, 10).filter((t) => t.column === 0);
    assert.deepStrictEqual(listAfterSelf.map((t) => t.id), [t3.id, t1.id, t2.id]);
    console.log("✓ Test 4 pasado: Same-column reorder, estado preservado y self-target no-op");
  }

  // -------------------------------------------------------------
  // Test 5: Movimiento cross-column y sincronización de estado
  // -------------------------------------------------------------
  {
    // Mover t1 a columna 1 (En progreso) con beforeTaskId = null (al final)
    const movedCross = moveProjectTask(db, { projectId: 10, taskId: t1.id, column: 1, beforeTaskId: null });
    assert.strictEqual(movedCross.status, "En curso");
    assert.strictEqual(movedCross.column, 1);

    const col0 = getProjectTasks(db, 10).filter((t) => t.column === 0);
    const col1 = getProjectTasks(db, 10).filter((t) => t.column === 1);
    assert.deepStrictEqual(col0.map((t) => t.id), [t3.id, t2.id]);
    assert.deepStrictEqual(col0.map((t) => t.order), [0, 1]);
    assert.deepStrictEqual(col1.map((t) => t.id), [t1.id]);
    assert.deepStrictEqual(col1.map((t) => t.order), [0]);
    console.log("✓ Test 5 pasado: Cross-column move y reindexación");
  }

  // -------------------------------------------------------------
  // Test 6: Rechazo de objetivos no autorizados o mismatch
  // -------------------------------------------------------------
  {
    const tAjena = createProjectTask(db, { projectId: 20, column: 0, title: "Ajena" });
    assert.throws(
      () => moveProjectTask(db, { projectId: 10, taskId: t2.id, column: 0, beforeTaskId: tAjena.id }),
      (err) => err.code === "TARGET_TASK_NOT_FOUND"
    );
    assert.throws(
      () => moveProjectTask(db, { projectId: 10, taskId: t2.id, column: 0, beforeTaskId: t1.id }),
      (err) => err.code === "TARGET_COLUMN_MISMATCH" // t1 está en col 1, target es col 0
    );
    console.log("✓ Test 6 pasado: Rechazo de target no autorizado y mismatch");
  }

  // -------------------------------------------------------------
  // Test 7: Validación estricta de fechas y rollback
  // -------------------------------------------------------------
  {
    // Fecha mal formateada
    assert.throws(
      () => updateProjectTask(db, { projectId: 10, taskId: t2.id, startDate: "05-10-2026" }),
      (err) => err.code === "INVALID_DATE_FORMAT"
    );

    // Rango start > end
    assert.throws(
      () => updateProjectTask(db, { projectId: 10, taskId: t2.id, startDate: "2026-10-15", endDate: "2026-10-10" }),
      (err) => err.code === "INVALID_DATE_RANGE"
    );

    // Patch parcial donde end existente es menor que new start
    updateProjectTask(db, { projectId: 10, taskId: t2.id, endDate: "2026-10-10" });
    assert.throws(
      () => updateProjectTask(db, { projectId: 10, taskId: t2.id, startDate: "2026-10-15" }),
      (err) => err.code === "INVALID_DATE_RANGE"
    );

    // Verificar que los datos no se corrompieron
    const taskCurrent = getProjectTaskById(db, t2.id, 10);
    assert.strictEqual(taskCurrent.startDate, null);
    assert.strictEqual(taskCurrent.endDate, "2026-10-10");
    console.log("✓ Test 7 pasado: Validación de fechas y orden temporal");
  }

  // -------------------------------------------------------------
  // Test 8: Validación de tags, prevención de pérdida y rollback
  // -------------------------------------------------------------
  {
    // Asignar tags válidos iniciales con color y formatos mixtos
    updateProjectTask(db, {
      projectId: 10,
      taskId: t2.id,
      tags: [
        { name: "Frontend", color: "#3B82F6" },
        "Backend",
        { name: "Seguridad", color: null },
      ],
    });

    let taskDetail = getProjectTaskById(db, t2.id, 10);
    let taskTags = taskDetail.tags;
    assert.strictEqual(taskTags.length, 3);
    const frontendTag = taskTags.find((tg) => tg.name === "Frontend");
    const backendTag = taskTags.find((tg) => tg.name === "Backend");
    const segTag = taskTags.find((tg) => tg.name === "Seguridad");
    assert.strictEqual(frontendTag.color, "#3B82F6");
    assert.strictEqual(backendTag.color, null);
    assert.strictEqual(segTag.color, null);

    // Releer a través de getProjectTasks (listado)
    const listTasks = getProjectTasks(db, 10);
    const listTask2 = listTasks.find((t) => t.id === t2.id);
    const listFrontendTag = listTask2.tags.find((tg) => tg.name === "Frontend");
    assert.strictEqual(listFrontendTag.color, "#3B82F6");

    // Releer a través de getProjectCatalogs (catálogo)
    const catalogs = getProjectCatalogs(db, 10);
    const catalogFrontendTag = catalogs.tags.find((tg) => tg.name === "Frontend");
    assert.strictEqual(catalogFrontendTag.color, "#3B82F6");

    // Conservar color de etiqueta existente si se vuelve a referenciar por nombre (incluso con otro color o sin él)
    updateProjectTask(db, {
      projectId: 10,
      taskId: t2.id,
      tags: [
        { name: "Frontend", color: "#EF4444" }, // No debe sobrescribir el color existente
        "Backend",
      ],
    });
    taskTags = getProjectTaskById(db, t2.id, 10).tags;
    assert.strictEqual(taskTags.length, 2);
    const retainedFrontend = taskTags.find((tg) => tg.name === "Frontend");
    assert.strictEqual(retainedFrontend.color, "#3B82F6", "Etiqueta existente debe conservar su color");

    // Soporte de formato previo por ID conservando color existente
    updateProjectTask(db, {
      projectId: 10,
      taskId: t2.id,
      tags: [retainedFrontend.id],
    });
    taskTags = getProjectTaskById(db, t2.id, 10).tags;
    assert.strictEqual(taskTags.length, 1);
    assert.strictEqual(taskTags[0].color, "#3B82F6");

    // Rechazo de color HEX inválido sin mutación ni pérdida de tags previos
    assert.throws(
      () =>
        updateProjectTask(db, {
          projectId: 10,
          taskId: t2.id,
          tags: [{ name: "Invalido", color: "blue" }],
        }),
      (err) => err.code === "INVALID_TAG_COLOR"
    );
    assert.throws(
      () =>
        updateProjectTask(db, {
          projectId: 10,
          taskId: t2.id,
          tags: [{ name: "Invalido2", color: "#FFF" }],
        }),
      (err) => err.code === "INVALID_TAG_COLOR"
    );
    taskTags = getProjectTaskById(db, t2.id, 10).tags;
    assert.strictEqual(taskTags.length, 1, "Rollback: los tags deben mantenerse intactos ante color inválido");
    assert.strictEqual(taskTags[0].name, "Frontend");

    // Intentar pasar un ID de tag inexistente: debe fallar y conservar los tags previos
    assert.throws(
      () => updateProjectTask(db, { projectId: 10, taskId: t2.id, tags: ["Backend", 999999] }),
      (err) => err.code === "TAG_NOT_FOUND"
    );
    taskTags = getProjectTaskById(db, t2.id, 10).tags;
    assert.strictEqual(taskTags.length, 1, "Los tags previos debieron mantenerse intactos por rollback");

    // Tag con nombre vacío
    assert.throws(
      () => updateProjectTask(db, { projectId: 10, taskId: t2.id, tags: ["   "] }),
      (err) => err.code === "INVALID_TAG_NAME"
    );
    console.log("✓ Test 8 pasado: Validación estricta de tags y no pérdida de datos");
  }

  // -------------------------------------------------------------
  // Test 9: Validación de subtareas (checklist completed bool), rechazo de campos retirados y tipos inválidos
  // -------------------------------------------------------------
  {
    // Crear subtareas iniciales válidas con completed
    const updated = updateProjectTask(db, {
      projectId: 10,
      taskId: t2.id,
      subtasks: [
        { title: "Sub 1", completed: true },
        { title: "Sub 2", completed: false },
        { title: "Sub 3" }, // omitted default false
      ],
    });
    assert.strictEqual(updated.subtasks.length, 3);
    assert.deepStrictEqual(Object.keys(updated.subtasks[0]).sort(), ["completed", "id", "title"].sort());
    assert.strictEqual(updated.subtasks[0].completed, true);
    assert.strictEqual(updated.subtasks[1].completed, false);
    assert.strictEqual(updated.subtasks[2].completed, false);
    const sub1 = updated.subtasks[0];
    const sub2 = updated.subtasks[1];
    const sub3 = updated.subtasks[2];

    // Toggle: desmarcar sub1 y marcar sub2
    const toggled = updateProjectTask(db, {
      projectId: 10,
      taskId: t2.id,
      subtasks: [
        { id: sub1.id, title: "Sub 1", completed: false },
        { id: sub2.id, title: "Sub 2", completed: true },
        { id: sub3.id, title: "Sub 3" }, // omitted en persistida debe conservar su valor actual (false)
      ],
    });
    assert.strictEqual(toggled.subtasks[0].completed, false);
    assert.strictEqual(toggled.subtasks[1].completed, true);
    assert.strictEqual(toggled.subtasks[2].completed, false);

    // Omitted en persistida completada conserva true
    const preserved = updateProjectTask(db, {
      projectId: 10,
      taskId: t2.id,
      subtasks: [
        { id: sub1.id, title: "Sub 1" }, // omitido: conserva false
        { id: sub2.id, title: "Sub 2" }, // omitido: conserva true
      ],
    });
    assert.strictEqual(preserved.subtasks[0].completed, false);
    assert.strictEqual(preserved.subtasks[1].completed, true);

    // Rechazo estricto de completed no booleano (null, string, number)
    assert.throws(
      () => updateProjectTask(db, { projectId: 10, taskId: t2.id, subtasks: [{ id: sub1.id, title: "Sub 1", completed: null }] }),
      (err) => err.code === "INVALID_SUBTASK_COMPLETED"
    );
    assert.throws(
      () => updateProjectTask(db, { projectId: 10, taskId: t2.id, subtasks: [{ id: sub1.id, title: "Sub 1", completed: 1 }] }),
      (err) => err.code === "INVALID_SUBTASK_COMPLETED"
    );
    assert.throws(
      () => updateProjectTask(db, { projectId: 10, taskId: t2.id, subtasks: [{ id: sub1.id, title: "Sub 1", completed: "true" }] }),
      (err) => err.code === "INVALID_SUBTASK_COMPLETED"
    );

    // Intentar referenciar ID de subtarea inexistente o de otra tarea
    assert.throws(
      () => updateProjectTask(db, { projectId: 10, taskId: t2.id, subtasks: [{ id: 88888, title: "Inexistente" }] }),
      (err) => err.code === "SUBTASK_NOT_FOUND"
    );

    // Intentar enviar campos retirados description/status/statusId: deben ser rechazados sin fingir guardado
    assert.throws(
      () => updateProjectTask(db, { projectId: 10, taskId: t2.id, subtasks: [{ id: sub1.id, title: "Sub 1", description: "desc" }] }),
      (err) => err.code === "INVALID_SUBTASK_FIELD"
    );

    assert.throws(
      () => updateProjectTask(db, { projectId: 10, taskId: t2.id, subtasks: [{ id: sub1.id, title: "Sub 1", status: "Pendiente" }] }),
      (err) => err.code === "INVALID_SUBTASK_FIELD"
    );

    assert.throws(
      () => updateProjectTask(db, { projectId: 10, taskId: t2.id, subtasks: [{ id: sub1.id, title: "Sub 1", statusId: 1 }] }),
      (err) => err.code === "INVALID_SUBTASK_FIELD"
    );

    // Comprobar que tras fallos las subtareas originales siguen intactas
    const taskSubtasks = getProjectTaskById(db, t2.id, 10).subtasks;
    assert.strictEqual(taskSubtasks.length, 2);
    assert.strictEqual(taskSubtasks[0].title, "Sub 1");
    assert.strictEqual(taskSubtasks[0].completed, false);
    assert.strictEqual(taskSubtasks[1].completed, true);
    assert.strictEqual(taskSubtasks[0].description, undefined);
    assert.strictEqual(taskSubtasks[0].status, undefined);
    console.log("✓ Test 9 pasado: Validación de subtareas, toggle checklist y rechazo de tipos/campos inválidos");
  }

  // -------------------------------------------------------------
  // Test 10: Compatibilidad con BD legado (columnas descripcion/estado_id presentes)
  // -------------------------------------------------------------
  {
    const legacyDb = new DatabaseSync(":memory:");
    legacyDb.exec("PRAGMA foreign_keys = ON;");
    legacyDb.exec(`
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
      CREATE TABLE proyectos (id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id), nombre TEXT NOT NULL, icono TEXT NOT NULL);
      CREATE TABLE listas_tareas (id INTEGER PRIMARY KEY, proyecto_id INTEGER NOT NULL REFERENCES proyectos(id), nombre TEXT NOT NULL, descripcion TEXT, estado TEXT);
      CREATE TABLE prioridades (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, color TEXT, descripcion TEXT);
      CREATE TABLE estados (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, descripcion TEXT);
      CREATE TABLE etiquetas (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, descripcion TEXT);
      CREATE TABLE tareas (
        id INTEGER PRIMARY KEY,
        lista_id INTEGER NOT NULL REFERENCES listas_tareas(id),
        nombre TEXT NOT NULL,
        descripcion TEXT,
        prioridad_id INTEGER REFERENCES prioridades(id),
        estado_id INTEGER REFERENCES estados(id),
        fecha_inicio TEXT,
        fecha_fin TEXT,
        archivos_enlaces TEXT,
        posicion INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE subtareas (
        id INTEGER PRIMARY KEY,
        tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        estado_id INTEGER REFERENCES estados(id)
      );
      CREATE TABLE tarea_etiquetas (tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE, etiqueta_id INTEGER NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE, PRIMARY KEY (tarea_id, etiqueta_id));
    `);

    legacyDb.exec("INSERT INTO usuarios (id, nombre) VALUES (1, 'Legacy User');");
    legacyDb.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (1, 1, 'Legacy Proj', 'folder');");
    legacyDb.exec("INSERT INTO listas_tareas (id, proyecto_id, nombre) VALUES (1, 1, 'Por hacer');");
    legacyDb.exec("INSERT INTO tareas (id, lista_id, nombre) VALUES (10, 1, 'Tarea Legacy');");
    legacyDb.exec("INSERT INTO subtareas (id, tarea_id, nombre, descripcion, estado_id) VALUES (100, 10, 'Sub Legacy', 'Desc Antigua', NULL);");

    // Lectura debe funcionar sin usar descripcion/estado_id y devolver { id, title, completed: false }
    const task = getProjectTaskById(legacyDb, 10, 1);
    assert.strictEqual(task.subtasks.length, 1);
    assert.strictEqual(task.subtasks[0].id, 100);
    assert.strictEqual(task.subtasks[0].title, "Sub Legacy");
    assert.strictEqual(task.subtasks[0].completed, false);
    assert.strictEqual(task.subtasks[0].description, undefined);
    assert.strictEqual(task.subtasks[0].status, undefined);

    // Actualización sobre BD legado debe funcionar insertando/actualizando sin tocar columnas obsoletas
    const upd = updateProjectTask(legacyDb, {
      projectId: 1,
      taskId: 10,
      subtasks: [
        { id: 100, title: "Sub Legacy Actualizada" },
        { title: "Sub Nueva En Legacy" },
      ],
    });
    assert.strictEqual(upd.subtasks.length, 2);
    assert.strictEqual(upd.subtasks[0].title, "Sub Legacy Actualizada");
    assert.strictEqual(upd.subtasks[0].completed, false);
    assert.strictEqual(upd.subtasks[1].title, "Sub Nueva En Legacy");
    assert.strictEqual(upd.subtasks[1].completed, false);

    // Migración aditiva sobre legacyDb con applySchema: debe añadir 'completada' sin destruir datos
    applySchema(legacyDb);
    const colsAfterApply = legacyDb.prepare("SELECT name FROM pragma_table_info('subtareas')").all().map((c) => c.name);
    assert(colsAfterApply.includes("completada"), "applySchema debió añadir columna completada aditivamente");
    const subAfterApply = getProjectTaskById(legacyDb, 10, 1).subtasks;
    assert.strictEqual(subAfterApply[0].completed, false);

    // Ahora que tiene columna completada, persistir toggle debe guardarse en BD
    const toggledLegacy = updateProjectTask(legacyDb, {
      projectId: 1,
      taskId: 10,
      subtasks: [
        { id: 100, title: "Sub Legacy Actualizada", completed: true },
        { id: subAfterApply[1].id, title: "Sub Nueva En Legacy", completed: false },
      ],
    });
    assert.strictEqual(toggledLegacy.subtasks[0].completed, true);
    assert.strictEqual(toggledLegacy.subtasks[1].completed, false);

    legacyDb.close();
    console.log("✓ Test 10 pasado: Compatibilidad y migración aditiva con BD legado");
  }

  // -------------------------------------------------------------
  // Test 11: Migración opt-in de subtareas (transaccional, preservando completada y legacy estado)
  // -------------------------------------------------------------
  {
    const { migrateSubtasksSchema, getTableColumns } = require("./migrate.cjs");
    const migDb = new DatabaseSync(":memory:");
    migDb.exec("PRAGMA foreign_keys = ON;");
    migDb.exec(`
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
      CREATE TABLE proyectos (id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id), nombre TEXT NOT NULL, icono TEXT NOT NULL);
      CREATE TABLE listas_tareas (id INTEGER PRIMARY KEY, proyecto_id INTEGER NOT NULL REFERENCES proyectos(id), nombre TEXT NOT NULL);
      CREATE TABLE estados (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE);
      CREATE TABLE tareas (id INTEGER PRIMARY KEY, lista_id INTEGER NOT NULL REFERENCES listas_tareas(id), nombre TEXT NOT NULL);
      CREATE TABLE subtareas (
        id INTEGER PRIMARY KEY,
        tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        estado_id INTEGER REFERENCES estados(id)
      );
      CREATE INDEX idx_subtareas_tarea ON subtareas(tarea_id);
    `);

    migDb.exec("INSERT INTO estados (id, nombre) VALUES (1, 'Pendiente'), (2, 'Completada');");
    migDb.exec("INSERT INTO usuarios (id, nombre) VALUES (1, 'User Mig');");
    migDb.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (1, 1, 'Proj Mig', 'folder');");
    migDb.exec("INSERT INTO listas_tareas (id, proyecto_id, nombre) VALUES (1, 1, 'Lista Mig');");
    migDb.exec("INSERT INTO tareas (id, lista_id, nombre) VALUES (50, 1, 'Tarea Mig');");
    migDb.exec("INSERT INTO subtareas (id, tarea_id, nombre, descripcion, estado_id) VALUES (501, 50, 'Subtarea 1', 'Texto que se omitirá', 2);"); // estado Completada -> completed: 1
    migDb.exec("INSERT INTO subtareas (id, tarea_id, nombre, descripcion, estado_id) VALUES (502, 50, 'Subtarea 2', NULL, 1);"); // estado Pendiente -> completed: 0

    // Ejecutar migración explícita opt-in
    const changed = migrateSubtasksSchema(migDb);
    assert.strictEqual(changed, true);

    const cols = getTableColumns(migDb, "subtareas").map((c) => c.name);
    assert.deepStrictEqual(cols.sort(), ["completada", "id", "nombre", "tarea_id"].sort());

    const rows = migDb.prepare("SELECT id, tarea_id, nombre, completada FROM subtareas ORDER BY id ASC").all();
    assert.strictEqual(rows.length, 2);
    assert.deepStrictEqual(
      rows.map((r) => ({ id: r.id, tarea_id: r.tarea_id, nombre: r.nombre, completada: r.completada })),
      [
        { id: 501, tarea_id: 50, nombre: "Subtarea 1", completada: 1 },
        { id: 502, tarea_id: 50, nombre: "Subtarea 2", completada: 0 },
      ]
    );

    // Verificar FK ON DELETE CASCADE
    migDb.exec("DELETE FROM tareas WHERE id = 50;");
    const countAfterCascade = migDb.prepare("SELECT COUNT(*) AS count FROM subtareas").get().count;
    assert.strictEqual(Number(countAfterCascade), 0, "FK CASCADE debe seguir funcionando");

    // Idempotencia: una segunda llamada no debe fallar ni hacer nada
    const secondPass = migrateSubtasksSchema(migDb);
    assert.strictEqual(secondPass, false);

    migDb.close();
    console.log("✓ Test 11 pasado: Migración opt-in de subtareas preservando completed y FKs");
  }

  // -------------------------------------------------------------
  // Test 12: Regresión applySchema real: inicialización legacy completada=1, desmarcar a 0 y preservación en re-apply y opt-in rebuild
  // -------------------------------------------------------------
  {
    const realFlowDb = new DatabaseSync(":memory:");
    realFlowDb.exec("PRAGMA foreign_keys = ON;");
    realFlowDb.exec(`
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
      CREATE TABLE proyectos (id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id), nombre TEXT NOT NULL, icono TEXT NOT NULL);
      CREATE TABLE listas_tareas (id INTEGER PRIMARY KEY, proyecto_id INTEGER NOT NULL REFERENCES proyectos(id), nombre TEXT NOT NULL);
      CREATE TABLE estados (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE);
      CREATE TABLE prioridades (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, color TEXT, descripcion TEXT);
      CREATE TABLE etiquetas (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, descripcion TEXT);
      CREATE TABLE tareas (
        id INTEGER PRIMARY KEY,
        lista_id INTEGER NOT NULL REFERENCES listas_tareas(id),
        nombre TEXT NOT NULL,
        descripcion TEXT,
        prioridad_id INTEGER REFERENCES prioridades(id),
        estado_id INTEGER REFERENCES estados(id),
        fecha_inicio TEXT,
        fecha_fin TEXT,
        archivos_enlaces TEXT,
        posicion INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE tarea_etiquetas (tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE, etiqueta_id INTEGER NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE, PRIMARY KEY (tarea_id, etiqueta_id));
      CREATE TABLE subtareas (
        id INTEGER PRIMARY KEY,
        tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        estado_id INTEGER REFERENCES estados(id)
      );
    `);

    realFlowDb.exec("INSERT INTO estados (id, nombre) VALUES (1, 'Pendiente'), (2, 'Completada');");
    realFlowDb.exec("INSERT INTO usuarios (id, nombre) VALUES (1, 'User Reg');");
    realFlowDb.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (1, 1, 'Proj Reg', 'folder');");
    realFlowDb.exec("INSERT INTO listas_tareas (id, proyecto_id, nombre) VALUES (1, 1, 'Lista Reg');");
    realFlowDb.exec("INSERT INTO tareas (id, lista_id, nombre) VALUES (60, 1, 'Tarea Reg');");
    realFlowDb.exec("INSERT INTO subtareas (id, tarea_id, nombre, descripcion, estado_id) VALUES (601, 60, 'Sub Legacy Hecha', 'desc', 2);"); // estado 'Completada'
    realFlowDb.exec("INSERT INTO subtareas (id, tarea_id, nombre, descripcion, estado_id) VALUES (602, 60, 'Sub Legacy Pendiente', NULL, 1);"); // estado 'Pendiente'

    // 1. Ejecutar applySchema real normal (primera apertura de BD)
    applySchema(realFlowDb);

    const taskAfterInit = getProjectTaskById(realFlowDb, 60, 1);
    assert.strictEqual(taskAfterInit.subtasks[0].completed, true, "Subtarea con estado_id 'Completada' debió inicializarse en true");
    assert.strictEqual(taskAfterInit.subtasks[1].completed, false, "Subtarea con estado_id 'Pendiente' debió inicializarse en false");

    // 2. El usuario desmarca la subtarea (ahora completed: false)
    updateProjectTask(realFlowDb, {
      projectId: 1,
      taskId: 60,
      subtasks: [
        { id: 601, title: "Sub Legacy Hecha", completed: false },
        { id: 602, title: "Sub Legacy Pendiente", completed: false },
      ],
    });
    const taskAfterUncheck = getProjectTaskById(realFlowDb, 60, 1);
    assert.strictEqual(taskAfterUncheck.subtasks[0].completed, false, "Debe quedar desmarcada a false");

    // 3. Ejecutar applySchema de nuevo: NO debe sobreescribir el valor desmarcado aunque el viejo estado_id siga siendo 2
    applySchema(realFlowDb);
    const taskAfterReapply = getProjectTaskById(realFlowDb, 60, 1);
    assert.strictEqual(taskAfterReapply.subtasks[0].completed, false, "Re-ejecutar applySchema no debe sobreescribir el booleano desmarcado");

    // 4. Ejecutar applySchema con opt-in { migrateSubtasks: true } real: debe reconstruir la tabla preservando completed: false
    applySchema(realFlowDb, { migrateSubtasks: true });
    const taskAfterOptIn = getProjectTaskById(realFlowDb, 60, 1);
    assert.strictEqual(taskAfterOptIn.subtasks[0].completed, false, "Opt-in rebuild real debe conservar el booleano actual (false)");

    // Verificar que columnas legacy fueron eliminadas tras opt-in rebuild
    const { getTableColumns } = require("./migrate.cjs");
    const colsAfterOptIn = getTableColumns(realFlowDb, "subtareas").map((c) => c.name);
    assert.deepStrictEqual(colsAfterOptIn.sort(), ["completada", "id", "nombre", "tarea_id"].sort());

    realFlowDb.close();
    console.log("✓ Test 12 pasado: applySchema real inicializa legacy estado completada, preserva desmarcado en re-apply y en opt-in rebuild");
  }

  // -------------------------------------------------------------
  // Test 13: Actividad semanal de completaciones y registro seguro
  // -------------------------------------------------------------
  {
    const actDb = new DatabaseSync(":memory:");
    actDb.exec("PRAGMA foreign_keys = ON;");
    applySchema(actDb);

    actDb.exec("INSERT INTO usuarios (id, nombre) VALUES (1, 'Usuario 1'), (2, 'Usuario 2')");
    actDb.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (100, 1, 'Proyecto User1', 'folder')");
    actDb.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (200, 2, 'Proyecto User2', 'folder')");

    // 1. Base limpia: 7 días exactamente con ceros y historyNotice
    const baseActivity = getWeeklyActivity(actDb, 1);
    assert.strictEqual(baseActivity.days.length, 7);
    assert.strictEqual(typeof baseActivity.historyNotice, "string");
    assert(baseActivity.historyNotice.includes("actualización"));
    for (const d of baseActivity.days) {
      assert.strictEqual(d.completed, 0);
      assert.strictEqual(/^\d{4}-\d{2}-\d{2}$/.test(d.date), true);
    }

    // 2. Crear tarea directamente en columna 2 (Terminado) -> debe registrar evento
    const taskDone = createProjectTask(actDb, { projectId: 100, column: 2, title: "Completada de inicio" });
    let actAfterCreate = getWeeklyActivity(actDb, 1);
    const todayStr = actAfterCreate.days[6].date;
    assert.strictEqual(actAfterCreate.days[6].completed, 1);

    // 3. Reordenar dentro de columna 2 (same-column move) -> NO debe duplicar
    moveProjectTask(actDb, { projectId: 100, taskId: taskDone.id, column: 2 });
    let actAfterReorder = getWeeklyActivity(actDb, 1);
    assert.strictEqual(actAfterReorder.days[6].completed, 1);

    // 4. Mover a columna 0 (reabrir) -> no incrementa
    moveProjectTask(actDb, { projectId: 100, taskId: taskDone.id, column: 0 });
    let actAfterReopen = getWeeklyActivity(actDb, 1);
    assert.strictEqual(actAfterReopen.days[6].completed, 1);

    // 5. Mover de nuevo a columna 2 (recompletar en el mismo día) -> DISTINCT task por día cuenta solo 1
    moveProjectTask(actDb, { projectId: 100, taskId: taskDone.id, column: 2 });
    let actAfterRecomplete = getWeeklyActivity(actDb, 1);
    assert.strictEqual(actAfterRecomplete.days[6].completed, 1);

    // 6. Transición vía updateProjectTask con statusId de "Completada"
    const taskTodo = createProjectTask(actDb, { projectId: 100, column: 0, title: "Tarea por hacer" });
    const compStatus = actDb.prepare("SELECT id FROM estados WHERE nombre = 'Completada'").get();
    updateProjectTask(actDb, { projectId: 100, taskId: taskTodo.id, statusId: compStatus.id });
    let actAfterStatusUpdate = getWeeklyActivity(actDb, 1);
    assert.strictEqual(actAfterStatusUpdate.days[6].completed, 2);

    // 7. Aislamiento por usuario: usuario 2 no ve completaciones de usuario 1
    const actUser2 = getWeeklyActivity(actDb, 2);
    assert.strictEqual(actUser2.days[6].completed, 0);

    // 8. Borrado de tareas / proyecto y cascada en tarea_completaciones
    // Primero probar borrado directo de una tarea (debe borrar sus registros en tarea_completaciones vía ON DELETE CASCADE de tarea_id)
    const taskCountBefore = actDb.prepare("SELECT COUNT(*) AS c FROM tarea_completaciones WHERE tarea_id = ?").get(taskTodo.id);
    assert.strictEqual(Number(taskCountBefore.c) >= 1, true);
    actDb.prepare("DELETE FROM tareas WHERE id = ?").run(taskTodo.id);
    const taskCountAfter = actDb.prepare("SELECT COUNT(*) AS c FROM tarea_completaciones WHERE tarea_id = ?").get(taskTodo.id);
    assert.strictEqual(Number(taskCountAfter.c), 0);

    // Luego probar borrado completo de proyecto (borrando tareas y listas como en DELETE /api/projects/:id)
    actDb.prepare("DELETE FROM tareas WHERE lista_id IN (SELECT id FROM listas_tareas WHERE proyecto_id = 100)").run();
    actDb.prepare("DELETE FROM listas_tareas WHERE proyecto_id = 100").run();
    actDb.exec("DELETE FROM proyectos WHERE id = 100");
    const countRemaining = actDb.prepare("SELECT COUNT(*) AS c FROM tarea_completaciones").get();
    assert.strictEqual(Number(countRemaining.c), 0);
    const actAfterDelete = getWeeklyActivity(actDb, 1);
    assert.strictEqual(actAfterDelete.days[6].completed, 0);

    actDb.close();
    console.log("✓ Test 13 pasado: Actividad semanal, transiciones seguras, deduplicación diaria y aislamiento de usuario");
  }

  // -------------------------------------------------------------
  // Test 14: Atomicidad en createProjectTask (rollback ante fallo en completion)
  // -------------------------------------------------------------
  {
    const rollbackDb = new DatabaseSync(":memory:");
    rollbackDb.exec("PRAGMA foreign_keys = ON;");
    applySchema(rollbackDb);

    rollbackDb.exec("INSERT INTO usuarios (id, nombre) VALUES (1, 'User Test')");
    rollbackDb.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (500, 1, 'Proyecto Rollback', 'folder')");

    // Instalar un trigger que fuerce un fallo deliberado en INSERT a tarea_completaciones
    rollbackDb.exec(`
      CREATE TRIGGER fail_completion_insert
      BEFORE INSERT ON tarea_completaciones
      BEGIN
        SELECT RAISE(ABORT, 'Simulated completion failure');
      END;
    `);

    // Intentar crear tarea en columna 2 (done) que invoca recordTaskCompletion
    assert.throws(
      () => {
        createProjectTask(rollbackDb, { projectId: 500, column: 2, title: "Tarea que debe hacer rollback" });
      },
      (err) => {
        return err instanceof Error && err.message.includes("Simulated completion failure");
      },
      "Debe lanzar el error del fallo de completion"
    );

    // Verificar que la tarea NO fue persistida (rollback atómico exitoso)
    const tareasPersistidas = rollbackDb
      .prepare("SELECT * FROM tareas WHERE nombre = 'Tarea que debe hacer rollback'")
      .all();
    assert.strictEqual(tareasPersistidas.length, 0, "La tarea no debe existir en la BD tras el fallo en completion");

    // Verificar que ante creación normal en columna 0 (sin completion trigger), sí se crea
    const normalTask = createProjectTask(rollbackDb, { projectId: 500, column: 0, title: "Tarea normal 0" });
    assert.strictEqual(normalTask.title, "Tarea normal 0");
    const countNormal = rollbackDb.prepare("SELECT COUNT(*) AS c FROM tareas WHERE id = ?").get(normalTask.id);
    assert.strictEqual(Number(countNormal.c), 1);

    rollbackDb.close();
    console.log("✓ Test 14 pasado: Atomicidad transaccional y rollback de tarea al fallar completion");
  }

  db.close();
  console.log("\nTodos los tests pasaron exitosamente sin errores.");
}

runAllTests();
