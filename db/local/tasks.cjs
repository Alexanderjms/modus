"use strict";

const {
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
} = require("./projects.cjs");

const MAX_TASK_TITLE_LENGTH = 255;
const MAX_TASK_JSON_BODY_BYTES = 65536;
const MAX_TASK_DESCRIPTION_LENGTH = 5000;
const MAX_TASK_ATTACHMENTS_LENGTH = 10000;
const MAX_TAG_NAME_LENGTH = 255;
const MAX_SUBTASK_TITLE_LENGTH = 255;
const MAX_SUBTASK_DESCRIPTION_LENGTH = 5000;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

function isValidHexColor(val) {
  return typeof val === "string" && HEX_COLOR_REGEX.test(val);
}

function isValidIsoDateString(val) {
  if (typeof val !== "string" || !ISO_DATE_REGEX.test(val)) return false;
  const [yStr, mStr, dStr] = val.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

const KANBAN_COLUMNS = [
  { column: 0, listName: "Por hacer", statusName: "Pendiente" },
  { column: 1, listName: "En progreso", statusName: "En curso" },
  { column: 2, listName: "Terminado", statusName: "Completada" },
];

function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function withNoStore(response) {
  if (!response) {
    return jsonResponse({ error: "Error en la solicitud" }, 400);
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function parsePositiveSafeInt(val) {
  if (typeof val === "number") {
    if (Number.isSafeInteger(val) && val > 0) return val;
    return null;
  }
  if (typeof val !== "string" || !/^\d+$/.test(val)) return null;
  const num = Number(val);
  if (!Number.isSafeInteger(num) || num <= 0) return null;
  return num;
}

function isValidColumn(col) {
  return col === 0 || col === 1 || col === 2;
}

function normalizeColumnName(name) {
  return (name || "").trim().toLowerCase();
}

function columnFromListNameOrStatus(listName, statusName) {
  const normList = normalizeColumnName(listName);
  if (normList === "por hacer" || normList === "pendiente" || normList === "to do") return 0;
  if (normList === "en progreso" || normList === "en curso" || normList === "in progress") return 1;
  if (normList === "terminado" || normList === "completada" || normList === "hecho" || normList === "done") return 2;

  const normStatus = normalizeColumnName(statusName);
  if (normStatus === "pendiente") return 0;
  if (normStatus === "en curso") return 1;
  if (normStatus === "completada") return 2;

  return 0;
}

function ensureTaskCompletionsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tarea_completaciones (
      id INTEGER PRIMARY KEY,
      tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
      proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
      completada_en TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tarea_completaciones_proyecto_fecha ON tarea_completaciones(proyecto_id, completada_en);
    CREATE INDEX IF NOT EXISTS idx_tarea_completaciones_tarea ON tarea_completaciones(tarea_id);
  `);
}

function isTaskCompleted(db, { listId, statusId }) {
  if (statusId !== undefined && statusId !== null) {
    const s = db.prepare("SELECT nombre FROM estados WHERE id = ?").get(statusId);
    if (s && normalizeColumnName(s.nombre) === "completada") return true;
  }
  if (listId !== undefined && listId !== null) {
    const l = db.prepare("SELECT nombre, estado FROM listas_tareas WHERE id = ?").get(listId);
    if (l && columnFromListNameOrStatus(l.nombre, l.estado) === 2) return true;
  }
  return false;
}

function recordTaskCompletion(db, taskId, projectId, completedAtIso) {
  ensureTaskCompletionsTable(db);
  const timestamp = completedAtIso || new Date().toISOString();
  db.prepare(
    "INSERT INTO tarea_completaciones (tarea_id, proyecto_id, completada_en) VALUES (?, ?, ?)"
  ).run(taskId, projectId, timestamp);
}

function ensureProjectLists(db, projectId) {
  const existingRows = db
    .prepare("SELECT id, nombre FROM listas_tareas WHERE proyecto_id = ?")
    .all(projectId);

  const existingByName = new Map();
  for (const row of existingRows) {
    existingByName.set(normalizeColumnName(row.nombre), row.id);
  }

  const resultLists = [];
  const insertStmt = db.prepare(
    "INSERT INTO listas_tareas (proyecto_id, nombre, descripcion, estado) VALUES (?, ?, ?, ?)"
  );

  for (const colDef of KANBAN_COLUMNS) {
    const key = normalizeColumnName(colDef.listName);
    let listId = existingByName.get(key);

    if (!listId) {
      const info = insertStmt.run(projectId, colDef.listName, null, colDef.statusName);
      listId = Number(info.lastInsertRowid);
      existingByName.set(key, listId);
    }

    resultLists.push({
      column: colDef.column,
      listId,
      name: colDef.listName,
      statusName: colDef.statusName,
    });
  }

  return resultLists;
}

function getProjectTasks(db, projectId) {
  ensureProjectLists(db, projectId);

  const query = `
    SELECT 
      t.id,
      t.lista_id,
      t.nombre AS title,
      t.descripcion AS description,
      t.fecha_inicio AS startDate,
      t.fecha_fin AS endDate,
      t.archivos_enlaces AS attachments,
      COALESCE(p.nombre, 'Sin prioridad') AS priority,
      p.color AS priorityColor,
      COALESCE(e.nombre, 'Pendiente') AS status,
      lt.nombre AS list_nombre,
      COALESCE(t.posicion, 0) AS posicion
    FROM tareas t
    INNER JOIN listas_tareas lt ON lt.id = t.lista_id
    LEFT JOIN prioridades p ON p.id = t.prioridad_id
    LEFT JOIN estados e ON e.id = t.estado_id
    WHERE lt.proyecto_id = ?
    ORDER BY COALESCE(t.posicion, 0) ASC, t.id ASC
  `;

  const rows = db.prepare(query).all(projectId);
  if (rows.length === 0) {
    return [];
  }

  const taskIds = rows.map((r) => Number(r.id));
  const placeholders = taskIds.map(() => "?").join(",");

  const tagsCols = db
    .prepare("SELECT name FROM pragma_table_info('etiquetas')")
    .all()
    .map((c) => c.name);
  const hasTagColorCol = tagsCols.includes("color");

  const tagsQuery = `
    SELECT 
      te.tarea_id,
      et.id,
      et.nombre AS name,
      et.descripcion AS description
      ${hasTagColorCol ? ", et.color" : ""}
    FROM tarea_etiquetas te
    INNER JOIN etiquetas et ON et.id = te.etiqueta_id
    WHERE te.tarea_id IN (${placeholders})
    ORDER BY et.id ASC
  `;
  const tagRows = db.prepare(tagsQuery).all(...taskIds);
  const tagsByTaskId = new Map();
  for (const tr of tagRows) {
    const tid = Number(tr.tarea_id);
    let list = tagsByTaskId.get(tid);
    if (!list) {
      list = [];
      tagsByTaskId.set(tid, list);
    }
    list.push({
      id: Number(tr.id),
      name: tr.name,
      color: hasTagColorCol && tr.color !== null && tr.color !== undefined ? String(tr.color) : null,
      description: tr.description !== null && tr.description !== undefined ? String(tr.description) : null,
    });
  }

  const subtasksCols = db
    .prepare("SELECT name FROM pragma_table_info('subtareas')")
    .all()
    .map((c) => c.name);
  const hasCompletadaCol = subtasksCols.includes("completada");

  const subtasksQuery = `
    SELECT 
      st.id,
      st.tarea_id,
      st.nombre AS title
      ${hasCompletadaCol ? ", st.completada" : ""}
    FROM subtareas st
    WHERE st.tarea_id IN (${placeholders})
    ORDER BY st.id ASC
  `;
  const subtaskRows = db.prepare(subtasksQuery).all(...taskIds);
  const subtasksByTaskId = new Map();
  for (const sr of subtaskRows) {
    const tid = Number(sr.tarea_id);
    let list = subtasksByTaskId.get(tid);
    if (!list) {
      list = [];
      subtasksByTaskId.set(tid, list);
    }
    list.push({
      id: Number(sr.id),
      title: sr.title,
      completed: hasCompletadaCol ? Number(sr.completada) === 1 : false,
    });
  }

  return rows.map((r) => {
    const taskId = Number(r.id);
    return {
      id: taskId,
      listId: Number(r.lista_id),
      column: columnFromListNameOrStatus(r.list_nombre, r.status),
      order: Number(r.posicion ?? 0),
      title: r.title,
      description: r.description !== null && r.description !== undefined ? String(r.description) : null,
      startDate: r.startDate !== null && r.startDate !== undefined ? String(r.startDate) : null,
      endDate: r.endDate !== null && r.endDate !== undefined ? String(r.endDate) : null,
      attachments: r.attachments !== null && r.attachments !== undefined ? String(r.attachments) : null,
      priority: r.priority,
      priorityColor: r.priorityColor !== null && r.priorityColor !== undefined ? String(r.priorityColor) : null,
      status: r.status,
      tags: tagsByTaskId.get(taskId) || [],
      subtasks: subtasksByTaskId.get(taskId) || [],
    };
  });
}

function createProjectTask(db, { projectId, column, title }) {
  const lists = ensureProjectLists(db, projectId);
  const targetColDef = lists.find((l) => l.column === column) || lists[0];

  const statusRow = db
    .prepare("SELECT id, nombre FROM estados WHERE nombre = ?")
    .get(targetColDef.statusName);

  const priorityRow = db
    .prepare("SELECT id, nombre, color FROM prioridades WHERE nombre = 'Sin prioridad'")
    .get();

  const statusId = statusRow ? statusRow.id : null;
  const statusName = statusRow ? statusRow.nombre : targetColDef.statusName;
  const priorityId = priorityRow ? priorityRow.id : null;
  const priorityName = priorityRow ? priorityRow.nombre : "Sin prioridad";
  const priorityColor = priorityRow && priorityRow.color ? priorityRow.color : null;

  const maxPosRow = db
    .prepare("SELECT COALESCE(MAX(posicion), -1) AS maxPos FROM tareas WHERE lista_id = ?")
    .get(targetColDef.listId);
  const nextPos = (maxPosRow ? Number(maxPosRow.maxPos) : -1) + 1;

  const isOuterTx = Boolean(db.isTransaction);
  if (isOuterTx) {
    db.exec("SAVEPOINT create_task_sp");
  } else {
    db.exec("BEGIN");
  }

  let createdId;
  try {
    const info = db
      .prepare(
        "INSERT INTO tareas (lista_id, nombre, descripcion, prioridad_id, estado_id, posicion) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(targetColDef.listId, title, null, priorityId, statusId, nextPos);

    createdId = Number(info.lastInsertRowid);

    if (targetColDef.column === 2 || normalizeColumnName(statusName) === "completada") {
      recordTaskCompletion(db, createdId, projectId);
    }

    if (isOuterTx) {
      db.exec("RELEASE create_task_sp");
    } else {
      db.exec("COMMIT");
    }
  } catch (err) {
    try {
      if (isOuterTx) {
        db.exec("ROLLBACK TO create_task_sp");
        db.exec("RELEASE create_task_sp");
      } else {
        db.exec("ROLLBACK");
      }
    } catch {}
    throw err;
  }

  return {
    id: createdId,
    listId: targetColDef.listId,
    column,
    order: nextPos,
    title,
    description: null,
    startDate: null,
    endDate: null,
    attachments: null,
    priority: priorityName,
    priorityColor,
    status: statusName,
    tags: [],
    subtasks: [],
  };
}

function getProjectTaskById(db, taskId, projectId) {
  const query = `
    SELECT 
      t.id,
      t.lista_id,
      t.nombre AS title,
      t.descripcion AS description,
      t.fecha_inicio AS startDate,
      t.fecha_fin AS endDate,
      t.archivos_enlaces AS attachments,
      COALESCE(p.nombre, 'Sin prioridad') AS priority,
      p.color AS priorityColor,
      COALESCE(e.nombre, 'Pendiente') AS status,
      lt.nombre AS list_nombre,
      COALESCE(t.posicion, 0) AS posicion
    FROM tareas t
    INNER JOIN listas_tareas lt ON lt.id = t.lista_id
    LEFT JOIN prioridades p ON p.id = t.prioridad_id
    LEFT JOIN estados e ON e.id = t.estado_id
    WHERE t.id = ? AND lt.proyecto_id = ?
    LIMIT 1
  `;

  const r = db.prepare(query).get(taskId, projectId);
  if (!r) {
    return null;
  }

  const tagsCols = db
    .prepare("SELECT name FROM pragma_table_info('etiquetas')")
    .all()
    .map((c) => c.name);
  const hasTagColorCol = tagsCols.includes("color");

  const tagRows = db
    .prepare(
      `
    SELECT 
      et.id,
      et.nombre AS name,
      et.descripcion AS description
      ${hasTagColorCol ? ", et.color" : ""}
    FROM tarea_etiquetas te
    INNER JOIN etiquetas et ON et.id = te.etiqueta_id
    WHERE te.tarea_id = ?
    ORDER BY et.id ASC
  `
    )
    .all(taskId);

  const subtasksCols = db
    .prepare("SELECT name FROM pragma_table_info('subtareas')")
    .all()
    .map((c) => c.name);
  const hasCompletadaCol = subtasksCols.includes("completada");

  const subtaskRows = db
    .prepare(
      `
    SELECT 
      st.id,
      st.nombre AS title
      ${hasCompletadaCol ? ", st.completada" : ""}
    FROM subtareas st
    WHERE st.tarea_id = ?
    ORDER BY st.id ASC
  `
    )
    .all(taskId);

  return {
    id: Number(r.id),
    listId: Number(r.lista_id),
    column: columnFromListNameOrStatus(r.list_nombre, r.status),
    order: Number(r.posicion ?? 0),
    title: r.title,
    description: r.description !== null && r.description !== undefined ? String(r.description) : null,
    startDate: r.startDate !== null && r.startDate !== undefined ? String(r.startDate) : null,
    endDate: r.endDate !== null && r.endDate !== undefined ? String(r.endDate) : null,
    attachments: r.attachments !== null && r.attachments !== undefined ? String(r.attachments) : null,
    priority: r.priority,
    priorityColor: r.priorityColor !== null && r.priorityColor !== undefined ? String(r.priorityColor) : null,
    status: r.status,
    tags: tagRows.map((tr) => ({
      id: Number(tr.id),
      name: tr.name,
      color: hasTagColorCol && tr.color !== null && tr.color !== undefined ? String(tr.color) : null,
      description: tr.description !== null && tr.description !== undefined ? String(tr.description) : null,
    })),
    subtasks: subtaskRows.map((sr) => ({
      id: Number(sr.id),
      title: sr.title,
      completed: hasCompletadaCol ? Number(sr.completada) === 1 : false,
    })),
  };
}

function moveProjectTask(db, { projectId, taskId, column, beforeTaskId }) {
  const lists = ensureProjectLists(db, projectId);
  const targetColDef = lists.find((l) => l.column === column) || lists[0];

  const taskRow = db
    .prepare(
      `SELECT t.id, t.lista_id, t.estado_id, COALESCE(t.posicion, 0) AS posicion 
       FROM tareas t 
       INNER JOIN listas_tareas lt ON lt.id = t.lista_id 
       WHERE t.id = ? AND lt.proyecto_id = ?`
    )
    .get(taskId, projectId);

  if (!taskRow) {
    return null;
  }

  let beforeTask = null;
  if (beforeTaskId !== undefined && beforeTaskId !== null) {
    beforeTask = db
      .prepare(
        `SELECT t.id, t.lista_id, COALESCE(t.posicion, 0) AS posicion
         FROM tareas t
         INNER JOIN listas_tareas lt ON lt.id = t.lista_id
         WHERE t.id = ? AND lt.proyecto_id = ?`
      )
      .get(beforeTaskId, projectId);

    if (!beforeTask) {
      const err = new Error("beforeTaskId no encontrado en este proyecto");
      err.code = "TARGET_TASK_NOT_FOUND";
      throw err;
    }

    if (Number(beforeTask.lista_id) !== Number(targetColDef.listId)) {
      const err = new Error("beforeTaskId debe pertenecer a la columna de destino");
      err.code = "TARGET_COLUMN_MISMATCH";
      throw err;
    }
  }

  const statusRow = db
    .prepare("SELECT id FROM estados WHERE nombre = ?")
    .get(targetColDef.statusName);

  const defaultStatusId = statusRow ? statusRow.id : null;

  const isOuterTx = Boolean(db.isTransaction);
  db.exec(isOuterTx ? "SAVEPOINT move_task_sp" : "BEGIN");
  const commit = () => db.exec(isOuterTx ? "RELEASE move_task_sp" : "COMMIT");
  try {
    const isSameList = Number(taskRow.lista_id) === Number(targetColDef.listId);
    const targetStatusId = isSameList ? taskRow.estado_id : defaultStatusId;

    const destTasks = db
      .prepare(
        `SELECT id, COALESCE(posicion, 0) AS posicion 
         FROM tareas 
         WHERE lista_id = ? AND id != ?
         ORDER BY COALESCE(posicion, 0) ASC, id ASC`
      )
      .all(targetColDef.listId, taskId);

    if (beforeTask && Number(beforeTask.id) === taskId && isSameList) {
      commit();
      return getProjectTaskById(db, taskId, projectId);
    }

    const destIds = destTasks.map((t) => Number(t.id));

    if (beforeTask && Number(beforeTask.id) !== taskId) {
      const idx = destIds.indexOf(Number(beforeTask.id));
      if (idx !== -1) {
        destIds.splice(idx, 0, taskId);
      } else {
        destIds.push(taskId);
      }
    } else {
      destIds.push(taskId);
    }

    const updateTaskStmt = db.prepare(
      "UPDATE tareas SET lista_id = ?, estado_id = ?, posicion = ? WHERE id = ?"
    );

    for (let pos = 0; pos < destIds.length; pos++) {
      const id = destIds[pos];
      if (id === taskId) {
        updateTaskStmt.run(targetColDef.listId, targetStatusId, pos, id);
      } else {
        db.prepare("UPDATE tareas SET posicion = ? WHERE id = ?").run(pos, id);
      }
    }

    if (!isSameList) {
      const sourceTasks = db
        .prepare(
          `SELECT id FROM tareas WHERE lista_id = ? ORDER BY COALESCE(posicion, 0) ASC, id ASC`
        )
        .all(taskRow.lista_id);
      const updateSourcePos = db.prepare("UPDATE tareas SET posicion = ? WHERE id = ?");
      for (let sPos = 0; sPos < sourceTasks.length; sPos++) {
        updateSourcePos.run(sPos, sourceTasks[sPos].id);
      }
    }

    const wasCompleted = isTaskCompleted(db, { listId: taskRow.lista_id, statusId: taskRow.estado_id });
    const nowCompleted = isTaskCompleted(db, { listId: targetColDef.listId, statusId: targetStatusId });
    if (!wasCompleted && nowCompleted) {
      recordTaskCompletion(db, taskId, projectId);
    }

    commit();
  } catch (err) {
    try {
      if (isOuterTx) {
        db.exec("ROLLBACK TO move_task_sp");
        db.exec("RELEASE move_task_sp");
      } else {
        db.exec("ROLLBACK");
      }
    } catch {}
    throw err;
  }

  return getProjectTaskById(db, taskId, projectId);
}

function getProjectCatalogs(db, projectId) {
  const lists = ensureProjectLists(db, projectId);

  const priorities = db
    .prepare("SELECT id, nombre AS name, color, descripcion AS description FROM prioridades ORDER BY id ASC")
    .all();

  const statuses = db
    .prepare("SELECT id, nombre AS name, descripcion AS description FROM estados ORDER BY id ASC")
    .all();

  const tagsCols = db
    .prepare("SELECT name FROM pragma_table_info('etiquetas')")
    .all()
    .map((c) => c.name);
  const hasTagColorCol = tagsCols.includes("color");
  const hasTagProjectCol = tagsCols.includes("proyecto_id");

  const tagsQuery = hasTagProjectCol
    ? `SELECT id, nombre AS name${hasTagColorCol ? ", color" : ""}, descripcion AS description FROM etiquetas WHERE proyecto_id = ? ORDER BY nombre ASC`
    : `SELECT id, nombre AS name${hasTagColorCol ? ", color" : ""}, descripcion AS description FROM etiquetas ORDER BY nombre ASC`;

  const tags = (hasTagProjectCol ? db.prepare(tagsQuery).all(projectId) : db.prepare(tagsQuery).all())
    .map((t) => ({
      id: Number(t.id),
      name: t.name,
      color: hasTagColorCol && t.color !== null && t.color !== undefined ? String(t.color) : null,
      description: t.description !== null && t.description !== undefined ? String(t.description) : null,
    }));

  return {
    lists,
    priorities,
    statuses,
    tags,
  };
}

function updateProjectTask(db, {
  projectId,
  taskId,
  title,
  description,
  startDate,
  endDate,
  attachments,
  priorityId,
  statusId,
  tags,
  subtasks,
}) {
  const taskRow = db
    .prepare(
      `SELECT t.id, t.lista_id, t.estado_id, t.fecha_inicio, t.fecha_fin 
       FROM tareas t 
       INNER JOIN listas_tareas lt ON lt.id = t.lista_id 
       WHERE t.id = ? AND lt.proyecto_id = ?`
    )
    .get(taskId, projectId);

  if (!taskRow) {
    return null;
  }

  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) {
      const err = new Error("title no puede estar vacío");
      err.code = "INVALID_TITLE";
      throw err;
    }
    if (title.trim().length > MAX_TASK_TITLE_LENGTH) {
      const err = new Error(`title no puede superar ${MAX_TASK_TITLE_LENGTH} caracteres`);
      err.code = "INVALID_TITLE";
      throw err;
    }
  }

  if (description !== undefined && description !== null) {
    if (typeof description !== "string") {
      const err = new Error("description debe ser texto o null");
      err.code = "INVALID_DESCRIPTION";
      throw err;
    }
    if (description.length > MAX_TASK_DESCRIPTION_LENGTH) {
      const err = new Error(`description no puede superar ${MAX_TASK_DESCRIPTION_LENGTH} caracteres`);
      err.code = "INVALID_DESCRIPTION";
      throw err;
    }
  }

  if (attachments !== undefined && attachments !== null) {
    if (typeof attachments !== "string") {
      const err = new Error("attachments debe ser texto o null");
      err.code = "INVALID_ATTACHMENTS";
      throw err;
    }
    if (attachments.length > MAX_TASK_ATTACHMENTS_LENGTH) {
      const err = new Error(`attachments no puede superar ${MAX_TASK_ATTACHMENTS_LENGTH} caracteres`);
      err.code = "INVALID_ATTACHMENTS";
      throw err;
    }
  }

  const effectiveStart = startDate !== undefined ? startDate : taskRow.fecha_inicio;
  const effectiveEnd = endDate !== undefined ? endDate : taskRow.fecha_fin;

  if (startDate !== undefined && startDate !== null) {
    if (!isValidIsoDateString(startDate)) {
      const err = new Error("startDate debe tener formato YYYY-MM-DD y ser una fecha válida");
      err.code = "INVALID_DATE_FORMAT";
      throw err;
    }
  }
  if (endDate !== undefined && endDate !== null) {
    if (!isValidIsoDateString(endDate)) {
      const err = new Error("endDate debe tener formato YYYY-MM-DD y ser una fecha válida");
      err.code = "INVALID_DATE_FORMAT";
      throw err;
    }
  }
  if (effectiveStart && effectiveEnd && effectiveStart > effectiveEnd) {
    const err = new Error("startDate no puede ser posterior a endDate");
    err.code = "INVALID_DATE_RANGE";
    throw err;
  }

  if (priorityId !== undefined && priorityId !== null) {
    const pRow = db.prepare("SELECT id FROM prioridades WHERE id = ?").get(priorityId);
    if (!pRow) {
      const err = new Error("priorityId no existe en catálogo de prioridades");
      err.code = "INVALID_PRIORITY_ID";
      throw err;
    }
  }

  if (statusId !== undefined && statusId !== null) {
    const sRow = db.prepare("SELECT id FROM estados WHERE id = ?").get(statusId);
    if (!sRow) {
      const err = new Error("statusId no existe en catálogo de estados");
      err.code = "INVALID_STATUS_ID";
      throw err;
    }
  }

  const validatedTagIds = [];
  const validatedNewTags = [];
  if (tags !== undefined) {
    if (!Array.isArray(tags)) {
      const err = new Error("tags debe ser un array");
      err.code = "INVALID_TAGS";
      throw err;
    }

    const seenTagIds = new Set();
    const seenTagNames = new Set();

    const etiquetasCols = db
      .prepare("SELECT name FROM pragma_table_info('etiquetas')")
      .all()
      .map((c) => c.name);
    const hasTagProjectCol = etiquetasCols.includes("proyecto_id");

    const findTagByIdStmt = hasTagProjectCol
      ? db.prepare("SELECT id FROM etiquetas WHERE id = ? AND proyecto_id = ?")
      : db.prepare("SELECT id FROM etiquetas WHERE id = ?");

    for (const item of tags) {
      if (typeof item === "number") {
        if (!Number.isSafeInteger(item) || item <= 0) {
          const err = new Error("ID de tag inválido");
          err.code = "INVALID_TAG_ID";
          throw err;
        }
        const tRow = hasTagProjectCol
          ? findTagByIdStmt.get(item, projectId)
          : findTagByIdStmt.get(item);
        if (!tRow) {
          const err = new Error(`Etiqueta con ID ${item} no encontrada`);
          err.code = "TAG_NOT_FOUND";
          throw err;
        }
        if (!seenTagIds.has(item)) {
          seenTagIds.add(item);
          validatedTagIds.push(item);
        }
      } else if (typeof item === "string") {
        const trimmed = item.trim();
        if (!trimmed) {
          const err = new Error("El nombre de etiqueta no puede estar vacío");
          err.code = "INVALID_TAG_NAME";
          throw err;
        }
        if (trimmed.length > MAX_TAG_NAME_LENGTH) {
          const err = new Error(`El nombre de etiqueta no puede superar ${MAX_TAG_NAME_LENGTH} caracteres`);
          err.code = "INVALID_TAG_NAME";
          throw err;
        }
        const lower = trimmed.toLowerCase();
        if (!seenTagNames.has(lower)) {
          seenTagNames.add(lower);
          validatedNewTags.push({ name: trimmed, color: null });
        }
      } else if (item && typeof item === "object" && !Array.isArray(item)) {
        if (item.id !== undefined && item.id !== null) {
          const tagId = parsePositiveSafeInt(item.id);
          if (tagId === null) {
            const err = new Error("ID de tag inválido en objeto");
            err.code = "INVALID_TAG_ID";
            throw err;
          }
          const tRow = hasTagProjectCol
            ? findTagByIdStmt.get(tagId, projectId)
            : findTagByIdStmt.get(tagId);
          if (!tRow) {
            const err = new Error(`Etiqueta con ID ${tagId} no encontrada`);
            err.code = "TAG_NOT_FOUND";
            throw err;
          }
          if (!seenTagIds.has(tagId)) {
            seenTagIds.add(tagId);
            validatedTagIds.push(tagId);
          }
        } else if (typeof item.name === "string") {
          const trimmed = item.name.trim();
          if (!trimmed) {
            const err = new Error("El nombre de etiqueta no puede estar vacío");
            err.code = "INVALID_TAG_NAME";
            throw err;
          }
          if (trimmed.length > MAX_TAG_NAME_LENGTH) {
            const err = new Error(`El nombre de etiqueta no puede superar ${MAX_TAG_NAME_LENGTH} caracteres`);
            err.code = "INVALID_TAG_NAME";
            throw err;
          }
          let tagColor = null;
          if (item.color !== undefined && item.color !== null) {
            if (!isValidHexColor(item.color)) {
              const err = new Error("Color de etiqueta inválido (debe ser formato HEX #RRGGBB o null)");
              err.code = "INVALID_TAG_COLOR";
              throw err;
            }
            tagColor = item.color;
          }
          const lower = trimmed.toLowerCase();
          if (!seenTagNames.has(lower)) {
            seenTagNames.add(lower);
            validatedNewTags.push({ name: trimmed, color: tagColor });
          }
        } else {
          const err = new Error("Formato de etiqueta no válido (debe tener id o name)");
          err.code = "INVALID_TAG_FORMAT";
          throw err;
        }
      } else {
        const err = new Error("Formato de elemento en tags inválido");
        err.code = "INVALID_TAG_FORMAT";
        throw err;
      }
    }
  }

  let validatedSubtasks = [];
  if (subtasks !== undefined) {
    if (!Array.isArray(subtasks)) {
      const err = new Error("subtasks debe ser un array");
      err.code = "INVALID_SUBTASKS";
      throw err;
    }

    const currentSubtasks = db.prepare("SELECT id FROM subtareas WHERE tarea_id = ?").all(taskId);
    const validTaskSubtaskIds = new Set(currentSubtasks.map((s) => Number(s.id)));
    const seenIncomingIds = new Set();

    validatedSubtasks = subtasks.map((st) => {
      if (!st || typeof st !== "object" || Array.isArray(st)) {
        const err = new Error("Cada subtarea debe ser un objeto");
        err.code = "INVALID_SUBTASK_FORMAT";
        throw err;
      }

      let subId = null;
      if (st.id !== undefined && st.id !== null) {
        subId = parsePositiveSafeInt(st.id);
        if (subId === null) {
          const err = new Error("ID de subtarea inválido");
          err.code = "INVALID_SUBTASK_ID";
          throw err;
        }
        if (!validTaskSubtaskIds.has(subId)) {
          const err = new Error(`Subtarea ${subId} no pertenece a esta tarea o no existe`);
          err.code = "SUBTASK_NOT_FOUND";
          throw err;
        }
        if (seenIncomingIds.has(subId)) {
          const err = new Error(`ID de subtarea ${subId} duplicado en payload`);
          err.code = "DUPLICATE_SUBTASK_ID";
          throw err;
        }
        seenIncomingIds.add(subId);
      }

      if (typeof st.title !== "string" || !st.title.trim()) {
        const err = new Error("El título de la subtarea no puede estar vacío");
        err.code = "INVALID_SUBTASK_TITLE";
        throw err;
      }
      const trimmedTitle = st.title.trim();
      if (trimmedTitle.length > MAX_SUBTASK_TITLE_LENGTH) {
        const err = new Error(`El título de subtarea no puede superar ${MAX_SUBTASK_TITLE_LENGTH} caracteres`);
        err.code = "INVALID_SUBTASK_TITLE";
        throw err;
      }

      if (st.description !== undefined) {
        const err = new Error("El campo 'description' en subtareas ya no está soportado");
        err.code = "INVALID_SUBTASK_FIELD";
        throw err;
      }
      if (st.status !== undefined || st.statusId !== undefined) {
        const err = new Error("El campo 'status'/'statusId' en subtareas ya no está soportado");
        err.code = "INVALID_SUBTASK_FIELD";
        throw err;
      }

      if (st.completed !== undefined) {
        if (typeof st.completed !== "boolean") {
          const err = new Error("El campo 'completed' en subtarea debe ser un booleano");
          err.code = "INVALID_SUBTASK_COMPLETED";
          throw err;
        }
      }

      return {
        id: subId,
        title: trimmedTitle,
        completed: st.completed,
      };
    });
  }

  const isOuterTx = Boolean(db.isTransaction);
  if (isOuterTx) {
    db.exec("SAVEPOINT update_task_sp");
  } else {
    db.exec("BEGIN");
  }
  try {
    const scalarUpdates = [];
    const scalarArgs = [];

    if (title !== undefined) {
      scalarUpdates.push("nombre = ?");
      scalarArgs.push(title.trim());
    }
    if (description !== undefined) {
      scalarUpdates.push("descripcion = ?");
      scalarArgs.push(description !== null ? description.trim() || null : null);
    }
    if (startDate !== undefined) {
      scalarUpdates.push("fecha_inicio = ?");
      scalarArgs.push(startDate);
    }
    if (endDate !== undefined) {
      scalarUpdates.push("fecha_fin = ?");
      scalarArgs.push(endDate);
    }
    if (attachments !== undefined) {
      scalarUpdates.push("archivos_enlaces = ?");
      scalarArgs.push(attachments !== null ? attachments.trim() || null : null);
    }
    if (priorityId !== undefined) {
      scalarUpdates.push("prioridad_id = ?");
      scalarArgs.push(priorityId);
    }
    if (statusId !== undefined) {
      scalarUpdates.push("estado_id = ?");
      scalarArgs.push(statusId);
    }

    if (scalarUpdates.length > 0) {
      scalarArgs.push(taskId);
      db.prepare(`UPDATE tareas SET ${scalarUpdates.join(", ")} WHERE id = ?`).run(...scalarArgs);
    }

    if (tags !== undefined) {
      db.prepare("DELETE FROM tarea_etiquetas WHERE tarea_id = ?").run(taskId);

      const etiquetasCols = db
        .prepare("SELECT name FROM pragma_table_info('etiquetas')")
        .all()
        .map((c) => c.name);
      const hasTagColorCol = etiquetasCols.includes("color");
      const hasTagProjectCol = etiquetasCols.includes("proyecto_id");

      const findTagByName = hasTagProjectCol
        ? db.prepare("SELECT id FROM etiquetas WHERE proyecto_id = ? AND LOWER(nombre) = LOWER(?)")
        : db.prepare("SELECT id FROM etiquetas WHERE LOWER(nombre) = LOWER(?)");
      const insertTag = hasTagProjectCol
        ? (hasTagColorCol
            ? db.prepare("INSERT INTO etiquetas (proyecto_id, nombre, color) VALUES (?, ?, ?)")
            : db.prepare("INSERT INTO etiquetas (proyecto_id, nombre) VALUES (?, ?)"))
        : (hasTagColorCol
            ? db.prepare("INSERT INTO etiquetas (nombre, color) VALUES (?, ?)")
            : db.prepare("INSERT INTO etiquetas (nombre) VALUES (?)"));
      const linkTag = db.prepare("INSERT OR IGNORE INTO tarea_etiquetas (tarea_id, etiqueta_id) VALUES (?, ?)");

      for (const tagId of validatedTagIds) {
        linkTag.run(taskId, tagId);
      }

      for (const tagItem of validatedNewTags) {
        const existing = hasTagProjectCol
          ? findTagByName.get(projectId, tagItem.name)
          : findTagByName.get(tagItem.name);
        let tagId;
        if (existing) {
          tagId = Number(existing.id);
        } else {
          const info = hasTagProjectCol
            ? (hasTagColorCol
                ? insertTag.run(projectId, tagItem.name, tagItem.color)
                : insertTag.run(projectId, tagItem.name))
            : (hasTagColorCol
                ? insertTag.run(tagItem.name, tagItem.color)
                : insertTag.run(tagItem.name));
          tagId = Number(info.lastInsertRowid);
        }
        linkTag.run(taskId, tagId);
      }
    }

    if (subtasks !== undefined) {
      const existingSubtasks = db
        .prepare("SELECT * FROM subtareas WHERE tarea_id = ?")
        .all(taskId);
      const existingMap = new Map();
      for (const es of existingSubtasks) {
        existingMap.set(Number(es.id), es);
      }

      const subtareasCols = db
        .prepare("SELECT name FROM pragma_table_info('subtareas')")
        .all()
        .map((c) => c.name);
      const hasCompletadaCol = subtareasCols.includes("completada");

      const incomingIds = new Set();
      const insertSubtaskStmt = hasCompletadaCol
        ? db.prepare("INSERT INTO subtareas (tarea_id, nombre, completada) VALUES (?, ?, ?)")
        : db.prepare("INSERT INTO subtareas (tarea_id, nombre) VALUES (?, ?)");

      const updateSubtaskStmtWithCompleted = hasCompletadaCol
        ? db.prepare("UPDATE subtareas SET nombre = ?, completada = ? WHERE id = ? AND tarea_id = ?")
        : null;
      const updateSubtaskStmtTitleOnly = db.prepare(
        "UPDATE subtareas SET nombre = ? WHERE id = ? AND tarea_id = ?"
      );

      for (const st of validatedSubtasks) {
        if (st.id && existingMap.has(st.id)) {
          incomingIds.add(st.id);
          const existingRecord = existingMap.get(st.id);

          if (hasCompletadaCol) {
            const nextCompletedInt =
              st.completed !== undefined
                ? (st.completed ? 1 : 0)
                : (Number(existingRecord.completada ?? 0) === 1 ? 1 : 0);
            updateSubtaskStmtWithCompleted.run(st.title, nextCompletedInt, st.id, taskId);
          } else {
            updateSubtaskStmtTitleOnly.run(st.title, st.id, taskId);
          }
        } else if (!st.id) {
          if (hasCompletadaCol) {
            const initialCompletedInt = st.completed ? 1 : 0;
            const info = insertSubtaskStmt.run(taskId, st.title, initialCompletedInt);
            incomingIds.add(Number(info.lastInsertRowid));
          } else {
            const info = insertSubtaskStmt.run(taskId, st.title);
            incomingIds.add(Number(info.lastInsertRowid));
          }
        }
      }

      for (const oldId of existingMap.keys()) {
        if (!incomingIds.has(oldId)) {
          db.prepare("DELETE FROM subtareas WHERE id = ? AND tarea_id = ?").run(oldId, taskId);
        }
      }
    }

    if (statusId !== undefined) {
      const wasCompleted = isTaskCompleted(db, { listId: taskRow.lista_id, statusId: taskRow.estado_id });
      const nowCompleted = isTaskCompleted(db, { listId: taskRow.lista_id, statusId });
      if (!wasCompleted && nowCompleted) {
        recordTaskCompletion(db, taskId, projectId);
      }
    }

    if (isOuterTx) {
      db.exec("RELEASE update_task_sp");
    } else {
      db.exec("COMMIT");
    }
  } catch (err) {
    try {
      if (isOuterTx) {
        db.exec("ROLLBACK TO update_task_sp");
        db.exec("RELEASE update_task_sp");
      } else {
        db.exec("ROLLBACK");
      }
    } catch {}
    throw err;
  }

  return getProjectTaskById(db, taskId, projectId);
}

function deleteProjectTask(db, { projectId, taskId }) {
  const taskRow = db
    .prepare(
      `SELECT t.id, t.lista_id, COALESCE(t.posicion, 0) AS posicion
       FROM tareas t
       INNER JOIN listas_tareas lt ON lt.id = t.lista_id
       WHERE t.id = ? AND lt.proyecto_id = ?`
    )
    .get(taskId, projectId);

  if (!taskRow) {
    return false;
  }

  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM tareas WHERE id = ?").run(taskId);

    const remaining = db
      .prepare("SELECT id FROM tareas WHERE lista_id = ? ORDER BY COALESCE(posicion, 0) ASC, id ASC")
      .all(taskRow.lista_id);
    const updatePos = db.prepare("UPDATE tareas SET posicion = ? WHERE id = ?");
    for (let pos = 0; pos < remaining.length; pos++) {
      updatePos.run(pos, remaining[pos].id);
    }

    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw err;
  }

  return true;
}

function duplicateProjectTask(db, { projectId, taskId }) {
  const source = db
    .prepare(
      `SELECT t.lista_id, t.nombre, t.descripcion, t.prioridad_id, t.estado_id,
              t.fecha_inicio, t.fecha_fin, t.archivos_enlaces, COALESCE(t.posicion, 0) AS posicion
       FROM tareas t
       INNER JOIN listas_tareas lt ON lt.id = t.lista_id
       WHERE t.id = ? AND lt.proyecto_id = ?`
    )
    .get(taskId, projectId);

  if (!source) {
    return null;
  }

  const subtareasCols = db
    .prepare("SELECT name FROM pragma_table_info('subtareas')")
    .all()
    .map((c) => c.name);
  const hasCompletadaCol = subtareasCols.includes("completada");

  db.exec("BEGIN");
  try {
    db.prepare("UPDATE tareas SET posicion = posicion + 1 WHERE lista_id = ? AND posicion > ?")
      .run(source.lista_id, source.posicion);

    const info = db
      .prepare(
        `INSERT INTO tareas (lista_id, nombre, descripcion, prioridad_id, estado_id, fecha_inicio, fecha_fin, archivos_enlaces, posicion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        source.lista_id,
        source.nombre,
        source.descripcion,
        source.prioridad_id,
        source.estado_id,
        source.fecha_inicio,
        source.fecha_fin,
        source.archivos_enlaces,
        source.posicion + 1
      );
    const newId = Number(info.lastInsertRowid);

    // Duplicar enlaces de etiquetas respetando el ámbito de proyecto
    const etiquetasCols = db
      .prepare("SELECT name FROM pragma_table_info('etiquetas')")
      .all()
      .map((c) => c.name);
    const hasTagProjectCol = etiquetasCols.includes("proyecto_id");

    if (hasTagProjectCol) {
      db.prepare(
        `INSERT INTO tarea_etiquetas (tarea_id, etiqueta_id)
         SELECT ?, te.etiqueta_id
         FROM tarea_etiquetas te
         JOIN etiquetas e ON e.id = te.etiqueta_id
         WHERE te.tarea_id = ? AND e.proyecto_id = ?`
      ).run(newId, taskId, projectId);
    } else {
      db.prepare(
        `INSERT INTO tarea_etiquetas (tarea_id, etiqueta_id)
         SELECT ?, etiqueta_id FROM tarea_etiquetas WHERE tarea_id = ?`
      ).run(newId, taskId);
    }

    if (hasCompletadaCol) {
      db.prepare(
        `INSERT INTO subtareas (tarea_id, nombre, completada)
         SELECT ?, nombre, completada FROM subtareas WHERE tarea_id = ? ORDER BY id ASC`
      ).run(newId, taskId);
    } else {
      db.prepare(
        `INSERT INTO subtareas (tarea_id, nombre)
         SELECT ?, nombre FROM subtareas WHERE tarea_id = ? ORDER BY id ASC`
      ).run(newId, taskId);
    }

    db.exec("COMMIT");
    return getProjectTaskById(db, newId, projectId);
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw err;
  }
}

function getWeeklyActivity(db, userId, clientNow) {
  ensureTaskCompletionsTable(db);

  const now = clientNow instanceof Date ? clientNow : new Date();
  const days = [];
  const dayDateStrings = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;
    days.push({ date: dateStr, completed: 0 });
    dayDateStrings.push(dateStr);
  }

  const rows = db
    .prepare(
      `
      SELECT 
        strftime('%Y-%m-%d', tc.completada_en, 'localtime') AS day_date,
        COUNT(DISTINCT tc.tarea_id) AS completed_count
      FROM tarea_completaciones tc
      INNER JOIN proyectos p ON p.id = tc.proyecto_id
      WHERE p.usuario_id = ?
        AND strftime('%Y-%m-%d', tc.completada_en, 'localtime') >= ?
        AND strftime('%Y-%m-%d', tc.completada_en, 'localtime') <= ?
      GROUP BY day_date
    `
    )
    .all(userId, dayDateStrings[0], dayDateStrings[6]);

  const countByDay = new Map();
  for (const r of rows) {
    countByDay.set(r.day_date, Number(r.completed_count));
  }

  for (const day of days) {
    if (countByDay.has(day.date)) {
      day.completed = countByDay.get(day.date);
    }
  }

  return {
    days,
    historyNotice: "La actividad se registra desde esta actualización.",
  };
}

function updateProjectTag(db, { projectId, tagId, name, color }) {
  const etiquetasCols = db
    .prepare("SELECT name FROM pragma_table_info('etiquetas')")
    .all()
    .map((c) => c.name);
  const hasTagProjectCol = etiquetasCols.includes("proyecto_id");
  const hasTagColorCol = etiquetasCols.includes("color");

  const tagRow = hasTagProjectCol
    ? db.prepare("SELECT id, proyecto_id, nombre, color FROM etiquetas WHERE id = ? AND proyecto_id = ?").get(tagId, projectId)
    : db.prepare("SELECT id, nombre FROM etiquetas WHERE id = ?").get(tagId);

  if (!tagRow) {
    return null;
  }

  if (typeof name !== "string") {
    const err = new Error("El nombre de etiqueta debe ser un texto");
    err.code = "INVALID_TAG_NAME";
    throw err;
  }
  const trimmedName = name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 80) {
    const err = new Error("El nombre de etiqueta debe tener entre 1 y 80 caracteres");
    err.code = "INVALID_TAG_NAME";
    throw err;
  }

  if (typeof color !== "string" || !isValidHexColor(color)) {
    const err = new Error("Color de etiqueta inválido (debe ser formato HEX #RRGGBB)");
    err.code = "INVALID_TAG_COLOR";
    throw err;
  }

  // Comprobar conflicto de nombre duplicado en el mismo proyecto (case-insensitive)
  const dupRow = hasTagProjectCol
    ? db.prepare("SELECT id FROM etiquetas WHERE proyecto_id = ? AND LOWER(nombre) = LOWER(?) AND id != ?").get(projectId, trimmedName, tagId)
    : db.prepare("SELECT id FROM etiquetas WHERE LOWER(nombre) = LOWER(?) AND id != ?").get(trimmedName, tagId);

  if (dupRow) {
    const err = new Error("Ya existe una etiqueta con este nombre en el proyecto");
    err.code = "TAG_NAME_CONFLICT";
    throw err;
  }

  db.exec("BEGIN");
  try {
    if (hasTagProjectCol) {
      if (hasTagColorCol) {
        db.prepare("UPDATE etiquetas SET nombre = ?, color = ? WHERE id = ? AND proyecto_id = ?").run(trimmedName, color, tagId, projectId);
      } else {
        db.prepare("UPDATE etiquetas SET nombre = ? WHERE id = ? AND proyecto_id = ?").run(trimmedName, tagId, projectId);
      }
    } else {
      if (hasTagColorCol) {
        db.prepare("UPDATE etiquetas SET nombre = ?, color = ? WHERE id = ?").run(trimmedName, color, tagId);
      } else {
        db.prepare("UPDATE etiquetas SET nombre = ? WHERE id = ?").run(trimmedName, tagId);
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw err;
  }

  return {
    id: tagId,
    name: trimmedName,
    color,
  };
}

function deleteProjectTag(db, { projectId, tagId }) {
  const etiquetasCols = db
    .prepare("SELECT name FROM pragma_table_info('etiquetas')")
    .all()
    .map((c) => c.name);
  const hasTagProjectCol = etiquetasCols.includes("proyecto_id");

  const tagRow = hasTagProjectCol
    ? db.prepare("SELECT id FROM etiquetas WHERE id = ? AND proyecto_id = ?").get(tagId, projectId)
    : db.prepare("SELECT id FROM etiquetas WHERE id = ?").get(tagId);

  if (!tagRow) {
    return false;
  }

  db.exec("BEGIN");
  try {
    // Eliminar asociaciones explícitamente dentro del proyecto para tareas de este proyecto
    db.prepare(`
      DELETE FROM tarea_etiquetas
      WHERE etiqueta_id = ?
        AND tarea_id IN (
          SELECT t.id
          FROM tareas t
          JOIN listas_tareas lt ON lt.id = t.lista_id
          WHERE lt.proyecto_id = ?
        )
    `).run(tagId, projectId);

    if (hasTagProjectCol) {
      db.prepare("DELETE FROM etiquetas WHERE id = ? AND proyecto_id = ?").run(tagId, projectId);
    } else {
      // Si la tabla fuera legacy sin proyecto_id, borrar solo si no quedan asociaciones en otros proyectos
      const remainingLinks = db.prepare("SELECT COUNT(*) AS cnt FROM tarea_etiquetas WHERE etiqueta_id = ?").get(tagId);
      if (!remainingLinks || Number(remainingLinks.cnt) === 0) {
        db.prepare("DELETE FROM etiquetas WHERE id = ?").run(tagId);
      }
    }

    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw err;
  }

  return true;
}

module.exports = {
  MAX_TASK_TITLE_LENGTH,
  MAX_TASK_JSON_BODY_BYTES,
  MAX_TASK_DESCRIPTION_LENGTH,
  MAX_TASK_ATTACHMENTS_LENGTH,
  MAX_TAG_NAME_LENGTH,
  MAX_SUBTASK_TITLE_LENGTH,
  MAX_SUBTASK_DESCRIPTION_LENGTH,
  isValidIsoDateString,
  isValidHexColor,
  KANBAN_COLUMNS,
  jsonResponse,
  withNoStore,
  parsePositiveSafeInt,
  isValidColumn,
  columnFromListNameOrStatus,
  ensureProjectLists,
  getProjectTasks,
  getProjectTaskById,
  moveProjectTask,
  updateProjectTask,
  deleteProjectTask,
  duplicateProjectTask,
  updateProjectTag,
  deleteProjectTag,
  getProjectCatalogs,
  createProjectTask,
  ensureTaskCompletionsTable,
  recordTaskCompletion,
  isTaskCompleted,
  getWeeklyActivity,
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
};
