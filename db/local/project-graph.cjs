/**
 * db/local/project-graph.cjs
 * Sistema de grafo proyectual derivado de registros oficiales,
 * registro atómico de eventos append-only y compilación compacta de contexto para LLM.
 */

"use strict";

const DEFAULT_BUDGET_CHARS = 12000;
const MIN_ESSENTIAL_RESERVE_CHARS = 500;
const GRAPH_TRIGGERS_REVISION = "/* rev:project-graph-v3 */";

class ProjectContextBudgetError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProjectContextBudgetError";
    this.code = "PROJECT_CONTEXT_BUDGET_EXCEEDED";
  }
}

/**
 * Helper reutilizable para ejecutar operaciones en un SAVEPOINT.
 * Soporta llamadas anidadas sin romper transacciones externas.
 */
function withSnapshot(db, fn) {
  const savepointName = `sp_snap_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
  db.exec(`SAVEPOINT ${savepointName};`);
  try {
    const result = fn();
    db.exec(`RELEASE SAVEPOINT ${savepointName};`);
    return result;
  } catch (err) {
    try {
      db.exec(`ROLLBACK TO SAVEPOINT ${savepointName};`);
      db.exec(`RELEASE SAVEPOINT ${savepointName};`);
    } catch {}
    throw err;
  }
}

const MANAGED_TRIGGERS = [
  "trg_ev_proyectos_ai",
  "trg_ev_proyectos_au",
  "trg_ev_listas_ai",
  "trg_ev_listas_au",
  "trg_ev_listas_bd",
  "trg_ev_tareas_ai",
  "trg_ev_tareas_au",
  "trg_ev_tareas_bd",
  "trg_ev_subtareas_ai",
  "trg_ev_subtareas_au",
  "trg_ev_subtareas_bd",
  "trg_ev_etiquetas_ai",
  "trg_ev_etiquetas_au",
  "trg_ev_etiquetas_bd",
  "trg_ev_tarea_etiquetas_ai",
  "trg_ev_tarea_etiquetas_bd",
  "trg_ev_contexto_ai",
  "trg_ev_contexto_au",
  "trg_ev_contexto_bd",
  "trg_ev_archivos_ai",
  "trg_ev_archivos_bd",
  "trg_ev_chats_ai",
  "trg_ev_chats_au",
  "trg_ev_chats_bd",
];

function isProjectGraphSchemaCurrent(db) {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'proyecto_eventos'")
    .get();
  if (!table) return false;

  const placeholders = MANAGED_TRIGGERS.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name IN (${placeholders})`)
    .all(...MANAGED_TRIGGERS);

  if (rows.length !== MANAGED_TRIGGERS.length) return false;

  for (const r of rows) {
    if (!r.sql || !r.sql.includes(GRAPH_TRIGGERS_REVISION)) {
      return false;
    }
  }

  return true;
}

function ensureProjectGraphSchema(db) {
  // Fast path sin DDL si el esquema ya está instalado y en la revisión actual
  if (isProjectGraphSchemaCurrent(db)) {
    return;
  }

  // Instalación o actualización atómica bajo SAVEPOINT
  withSnapshot(db, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS proyecto_eventos (
        id INTEGER PRIMARY KEY,
        proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
        actor_usuario_id INTEGER,
        entidad_tipo TEXT NOT NULL,
        entidad_id TEXT NOT NULL,
        accion TEXT NOT NULL,
        datos TEXT,
        creado_en TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_proyecto_eventos_proyecto_id ON proyecto_eventos(proyecto_id, id ASC);
      CREATE INDEX IF NOT EXISTS idx_proyecto_eventos_entidad ON proyecto_eventos(entidad_tipo, entidad_id);
    `);

    for (const trg of MANAGED_TRIGGERS) {
      db.exec(`DROP TRIGGER IF EXISTS ${trg};`);
    }

    db.exec(`
      -- Triggers para proyectos
      CREATE TRIGGER trg_ev_proyectos_ai AFTER INSERT ON proyectos
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        VALUES (
          NEW.id,
          NEW.usuario_id,
          'project',
          CAST(NEW.id AS TEXT),
          'created',
          json_object('name', NEW.nombre, 'icon', NEW.icono, 'status', NEW.estado),
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        );
      END;

      CREATE TRIGGER trg_ev_proyectos_au AFTER UPDATE ON proyectos
      WHEN OLD.nombre IS NOT NEW.nombre
        OR OLD.descripcion IS NOT NEW.descripcion
        OR OLD.icono IS NOT NEW.icono
        OR OLD.estado IS NOT NEW.estado
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        VALUES (
          NEW.id,
          NEW.usuario_id,
          'project',
          CAST(NEW.id AS TEXT),
          'updated',
          json_object('name', NEW.nombre, 'icon', NEW.icono, 'status', NEW.estado),
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        );
      END;

      -- Triggers para listas_tareas
      CREATE TRIGGER trg_ev_listas_ai AFTER INSERT ON listas_tareas
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT NEW.proyecto_id, p.usuario_id, 'list', CAST(NEW.id AS TEXT), 'created',
               json_object('name', NEW.nombre, 'status', NEW.estado),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM proyectos p WHERE p.id = NEW.proyecto_id;
      END;

      CREATE TRIGGER trg_ev_listas_au AFTER UPDATE ON listas_tareas
      WHEN OLD.nombre IS NOT NEW.nombre
        OR OLD.descripcion IS NOT NEW.descripcion
        OR OLD.estado IS NOT NEW.estado
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT NEW.proyecto_id, p.usuario_id, 'list', CAST(NEW.id AS TEXT), 'updated',
               json_object('name', NEW.nombre, 'status', NEW.estado),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM proyectos p WHERE p.id = NEW.proyecto_id;
      END;

      CREATE TRIGGER trg_ev_listas_bd BEFORE DELETE ON listas_tareas
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT OLD.proyecto_id, p.usuario_id, 'list', CAST(OLD.id AS TEXT), 'deleted',
               json_object('name', OLD.nombre),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM proyectos p WHERE p.id = OLD.proyecto_id;
      END;

      -- Triggers para tareas
      CREATE TRIGGER trg_ev_tareas_ai AFTER INSERT ON tareas
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT lt.proyecto_id, p.usuario_id, 'task', CAST(NEW.id AS TEXT), 'created',
               json_object('title', NEW.nombre, 'listId', NEW.lista_id, 'priorityId', NEW.prioridad_id, 'statusId', NEW.estado_id),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM listas_tareas lt
        JOIN proyectos p ON p.id = lt.proyecto_id
        WHERE lt.id = NEW.lista_id;
      END;

      CREATE TRIGGER trg_ev_tareas_au AFTER UPDATE ON tareas
      WHEN OLD.nombre IS NOT NEW.nombre
        OR OLD.descripcion IS NOT NEW.descripcion
        OR OLD.lista_id IS NOT NEW.lista_id
        OR OLD.prioridad_id IS NOT NEW.prioridad_id
        OR OLD.estado_id IS NOT NEW.estado_id
        OR OLD.fecha_inicio IS NOT NEW.fecha_inicio
        OR OLD.fecha_fin IS NOT NEW.fecha_fin
        OR OLD.archivos_enlaces IS NOT NEW.archivos_enlaces
        OR OLD.posicion IS NOT NEW.posicion
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT lt.proyecto_id, p.usuario_id, 'task', CAST(NEW.id AS TEXT),
               CASE WHEN OLD.lista_id IS NOT NEW.lista_id THEN 'moved' ELSE 'updated' END,
               json_object(
                 'title', NEW.nombre,
                 'listId', NEW.lista_id,
                 'oldListId', OLD.lista_id,
                 'priorityId', NEW.prioridad_id,
                 'statusId', NEW.estado_id,
                 'position', NEW.posicion
               ),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM listas_tareas lt
        JOIN proyectos p ON p.id = lt.proyecto_id
        WHERE lt.id = NEW.lista_id;
      END;

      CREATE TRIGGER trg_ev_tareas_bd BEFORE DELETE ON tareas
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT lt.proyecto_id, p.usuario_id, 'task', CAST(OLD.id AS TEXT), 'deleted',
               json_object('title', OLD.nombre, 'listId', OLD.lista_id),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM listas_tareas lt
        JOIN proyectos p ON p.id = lt.proyecto_id
        WHERE lt.id = OLD.lista_id;
      END;

      -- Triggers para subtareas
      CREATE TRIGGER trg_ev_subtareas_ai AFTER INSERT ON subtareas
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT lt.proyecto_id, p.usuario_id, 'subtask', CAST(NEW.id AS TEXT), 'created',
               json_object('title', NEW.nombre, 'taskId', NEW.tarea_id, 'completed', NEW.completada),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM tareas t
        JOIN listas_tareas lt ON lt.id = t.lista_id
        JOIN proyectos p ON p.id = lt.proyecto_id
        WHERE t.id = NEW.tarea_id;
      END;

      CREATE TRIGGER trg_ev_subtareas_au AFTER UPDATE ON subtareas
      WHEN OLD.nombre IS NOT NEW.nombre OR OLD.completada IS NOT NEW.completada
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT lt.proyecto_id, p.usuario_id, 'subtask', CAST(NEW.id AS TEXT), 'updated',
               json_object('title', NEW.nombre, 'taskId', NEW.tarea_id, 'completed', NEW.completada),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM tareas t
        JOIN listas_tareas lt ON lt.id = t.lista_id
        JOIN proyectos p ON p.id = lt.proyecto_id
        WHERE t.id = NEW.tarea_id;
      END;

      CREATE TRIGGER trg_ev_subtareas_bd BEFORE DELETE ON subtareas
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT lt.proyecto_id, p.usuario_id, 'subtask', CAST(OLD.id AS TEXT), 'deleted',
               json_object('title', OLD.nombre, 'taskId', OLD.tarea_id),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM tareas t
        JOIN listas_tareas lt ON lt.id = t.lista_id
        JOIN proyectos p ON p.id = lt.proyecto_id
        WHERE t.id = OLD.tarea_id;
      END;

      -- Triggers para etiquetas del proyecto
      CREATE TRIGGER trg_ev_etiquetas_ai AFTER INSERT ON etiquetas
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT NEW.proyecto_id, p.usuario_id, 'tag', CAST(NEW.id AS TEXT), 'created',
               json_object('name', NEW.nombre, 'color', NEW.color),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM proyectos p WHERE p.id = NEW.proyecto_id;
      END;

      CREATE TRIGGER trg_ev_etiquetas_au AFTER UPDATE ON etiquetas
      WHEN OLD.nombre IS NOT NEW.nombre OR OLD.color IS NOT NEW.color OR OLD.descripcion IS NOT NEW.descripcion
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT NEW.proyecto_id, p.usuario_id, 'tag', CAST(NEW.id AS TEXT), 'updated',
               json_object('name', NEW.nombre, 'color', NEW.color),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM proyectos p WHERE p.id = NEW.proyecto_id;
      END;

      CREATE TRIGGER trg_ev_etiquetas_bd BEFORE DELETE ON etiquetas
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT OLD.proyecto_id, p.usuario_id, 'tag', CAST(OLD.id AS TEXT), 'deleted',
               json_object('name', OLD.nombre),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM proyectos p WHERE p.id = OLD.proyecto_id;
      END;

      -- Triggers para etiquetas de tareas
      CREATE TRIGGER trg_ev_tarea_etiquetas_ai AFTER INSERT ON tarea_etiquetas
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT lt.proyecto_id, p.usuario_id, 'task_tag', CAST(NEW.tarea_id AS TEXT) || ':' || CAST(NEW.etiqueta_id AS TEXT), 'created',
               json_object('taskId', NEW.tarea_id, 'tagId', NEW.etiqueta_id, 'tagName', e.nombre),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM tareas t
        JOIN listas_tareas lt ON lt.id = t.lista_id
        JOIN proyectos p ON p.id = lt.proyecto_id
        LEFT JOIN etiquetas e ON e.id = NEW.etiqueta_id
        WHERE t.id = NEW.tarea_id;
      END;

      CREATE TRIGGER trg_ev_tarea_etiquetas_bd BEFORE DELETE ON tarea_etiquetas
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT lt.proyecto_id, p.usuario_id, 'task_tag', CAST(OLD.tarea_id AS TEXT) || ':' || CAST(OLD.etiqueta_id AS TEXT), 'deleted',
               json_object('taskId', OLD.tarea_id, 'tagId', OLD.etiqueta_id, 'tagName', e.nombre),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM tareas t
        JOIN listas_tareas lt ON lt.id = t.lista_id
        JOIN proyectos p ON p.id = lt.proyecto_id
        LEFT JOIN etiquetas e ON e.id = OLD.etiqueta_id
        WHERE t.id = OLD.tarea_id;
      END;

      -- Triggers para proyecto_contexto
      CREATE TRIGGER trg_ev_contexto_ai AFTER INSERT ON proyecto_contexto
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT NEW.proyecto_id, p.usuario_id, 'context', CAST(NEW.proyecto_id AS TEXT), 'updated',
               json_object('length', length(NEW.contexto), 'updatedAt', NEW.actualizado_en),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM proyectos p WHERE p.id = NEW.proyecto_id;
      END;

      CREATE TRIGGER trg_ev_contexto_au AFTER UPDATE ON proyecto_contexto
      WHEN OLD.contexto IS NOT NEW.contexto OR OLD.reglas IS NOT NEW.reglas OR OLD.recursos IS NOT NEW.recursos
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT NEW.proyecto_id, p.usuario_id, 'context', CAST(NEW.proyecto_id AS TEXT), 'updated',
               json_object('length', length(NEW.contexto), 'updatedAt', NEW.actualizado_en),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM proyectos p WHERE p.id = NEW.proyecto_id;
      END;

      CREATE TRIGGER trg_ev_contexto_bd BEFORE DELETE ON proyecto_contexto
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT OLD.proyecto_id, p.usuario_id, 'context', CAST(OLD.proyecto_id AS TEXT), 'deleted',
               json_object('length', length(OLD.contexto)),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM proyectos p WHERE p.id = OLD.proyecto_id;
      END;

      -- Triggers para proyecto_archivos
      CREATE TRIGGER trg_ev_archivos_ai AFTER INSERT ON proyecto_archivos
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT NEW.proyecto_id, p.usuario_id, 'file', NEW.id, 'created',
               json_object('filename', NEW.nombre_archivo, 'mimeType', NEW.mime_type, 'size', NEW.tamano),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM proyectos p WHERE p.id = NEW.proyecto_id;
      END;

      CREATE TRIGGER trg_ev_archivos_bd BEFORE DELETE ON proyecto_archivos
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT OLD.proyecto_id, p.usuario_id, 'file', OLD.id, 'deleted',
               json_object('filename', OLD.nombre_archivo, 'mimeType', OLD.mime_type, 'size', OLD.tamano),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM proyectos p WHERE p.id = OLD.proyecto_id;
      END;

      -- Triggers para chats
      CREATE TRIGGER trg_ev_chats_ai AFTER INSERT ON chats
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT NEW.proyecto_id, p.usuario_id, 'chat', CAST(NEW.id AS TEXT), 'created',
               json_object('title', NEW.titulo, 'provider', NEW.proveedor, 'model', NEW.modelo),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM proyectos p WHERE p.id = NEW.proyecto_id;
      END;

      CREATE TRIGGER trg_ev_chats_au AFTER UPDATE ON chats
      WHEN OLD.titulo IS NOT NEW.titulo OR OLD.revision IS NOT NEW.revision
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT NEW.proyecto_id, p.usuario_id, 'chat', CAST(NEW.id AS TEXT), 'updated',
               json_object('title', NEW.titulo, 'revision', NEW.revision),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM proyectos p WHERE p.id = NEW.proyecto_id;
      END;

      CREATE TRIGGER trg_ev_chats_bd BEFORE DELETE ON chats
      BEGIN
        ${GRAPH_TRIGGERS_REVISION}
        INSERT INTO proyecto_eventos (proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)
        SELECT OLD.proyecto_id, p.usuario_id, 'chat', CAST(OLD.id AS TEXT), 'deleted',
               json_object('title', OLD.titulo),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM proyectos p WHERE p.id = OLD.proyecto_id;
      END;
    `);
  });
}

function getProjectVersion(db, projectId) {
  const row = db
    .prepare(
      `SELECT 
         COALESCE(MAX(pe.id), 0) AS max_evento_id,
         COUNT(pe.id) AS total_eventos
       FROM proyecto_eventos pe
       WHERE pe.proyecto_id = ?`
    )
    .get(projectId);

  const maxId = row ? Number(row.max_evento_id) : 0;
  const count = row ? Number(row.total_eventos) : 0;
  return `v${maxId}.${count}`;
}

function getProjectGraph(db, projectId, options = {}) {
  ensureProjectGraphSchema(db);

  return withSnapshot(db, () => {
    const version = getProjectVersion(db, projectId);

    const proj = db
      .prepare("SELECT id, usuario_id, nombre, descripcion, icono, estado FROM proyectos WHERE id = ?")
      .get(projectId);

    if (!proj) {
      return null;
    }

    const nodes = [];
    const edges = [];

    nodes.push({
      id: `project:${proj.id}`,
      type: "project",
      label: proj.nombre,
      data: {
        description: proj.descripcion || "",
        icon: proj.icono,
        status: proj.estado || "active",
      },
    });

    const lists = db
      .prepare("SELECT id, proyecto_id, nombre, descripcion, estado FROM listas_tareas WHERE proyecto_id = ? ORDER BY id ASC")
      .all(projectId);

    for (const l of lists) {
      nodes.push({
        id: `list:${l.id}`,
        type: "list",
        label: l.nombre,
        data: {
          description: l.descripcion || "",
          status: l.estado || "",
        },
      });
      edges.push({
        id: `edge:project:${proj.id}->list:${l.id}`,
        source: `project:${proj.id}`,
        target: `list:${l.id}`,
        type: "contains",
      });
    }

    const tasks = db
      .prepare(
        `SELECT t.id, t.lista_id, t.nombre, t.descripcion, t.posicion,
                p.nombre AS prioridad_nombre,
                e.nombre AS estado_nombre,
                t.fecha_inicio, t.fecha_fin, t.archivos_enlaces
         FROM tareas t
         JOIN listas_tareas lt ON lt.id = t.lista_id
         LEFT JOIN prioridades p ON p.id = t.prioridad_id
         LEFT JOIN estados e ON e.id = t.estado_id
         WHERE lt.proyecto_id = ?
         ORDER BY t.lista_id ASC, COALESCE(t.posicion, 0) ASC, t.id ASC`
      )
      .all(projectId);

    for (const t of tasks) {
      nodes.push({
        id: `task:${t.id}`,
        type: "task",
        label: t.nombre,
        data: {
          description: t.descripcion || "",
          priority: t.prioridad_nombre || "Sin prioridad",
          status: t.estado_nombre || "Pendiente",
          position: Number(t.posicion ?? 0),
          startDate: t.fecha_inicio || null,
          endDate: t.fecha_fin || null,
          attachments: t.archivos_enlaces || null,
        },
      });
      edges.push({
        id: `edge:list:${t.lista_id}->task:${t.id}`,
        source: `list:${t.lista_id}`,
        target: `task:${t.id}`,
        type: "contains",
      });
    }

    const subtasks = db
      .prepare(
        `SELECT st.id, st.tarea_id, st.nombre, st.completada
         FROM subtareas st
         JOIN tareas t ON t.id = st.tarea_id
         JOIN listas_tareas lt ON lt.id = t.lista_id
         WHERE lt.proyecto_id = ?
         ORDER BY st.id ASC`
      )
      .all(projectId);

    for (const st of subtasks) {
      nodes.push({
        id: `subtask:${st.id}`,
        type: "subtask",
        label: st.nombre,
        data: {
          completed: Boolean(st.completada),
        },
      });
      edges.push({
        id: `edge:task:${st.tarea_id}->subtask:${st.id}`,
        source: `task:${st.tarea_id}`,
        target: `subtask:${st.id}`,
        type: "has_subtask",
      });
    }

    const taskTags = db
      .prepare(
        `SELECT te.tarea_id, te.etiqueta_id, e.nombre, e.color
         FROM tarea_etiquetas te
         JOIN tareas t ON t.id = te.tarea_id
         JOIN listas_tareas lt ON lt.id = t.lista_id
         JOIN etiquetas e ON e.id = te.etiqueta_id
         WHERE lt.proyecto_id = ?`
      )
      .all(projectId);

    const seenTags = new Set();
    for (const tt of taskTags) {
      const tagNodeId = `tag:${tt.etiqueta_id}`;
      if (!seenTags.has(tagNodeId)) {
        seenTags.add(tagNodeId);
        nodes.push({
          id: tagNodeId,
          type: "tag",
          label: tt.nombre,
          data: {
            color: tt.color || null,
          },
        });
      }
      edges.push({
        id: `edge:task:${tt.tarea_id}->tag:${tt.etiqueta_id}`,
        source: `task:${tt.tarea_id}`,
        target: tagNodeId,
        type: "tagged_with",
      });
    }

    const ctxRow = db
      .prepare("SELECT contexto, reglas, recursos, actualizado_en FROM proyecto_contexto WHERE proyecto_id = ?")
      .get(projectId);

    if (ctxRow) {
      nodes.push({
        id: `context:${projectId}`,
        type: "context",
        label: "Contexto del proyecto",
        data: {
          context: ctxRow.contexto || "",
          updatedAt: ctxRow.actualizado_en,
        },
      });
      edges.push({
        id: `edge:project:${projectId}->context:${projectId}`,
        source: `project:${projectId}`,
        target: `context:${projectId}`,
        type: "has_context",
      });

      let rules = [];
      try {
        rules = JSON.parse(ctxRow.reglas || "[]");
      } catch {}
      if (Array.isArray(rules)) {
        rules.forEach((r, idx) => {
          const ruleId = `rule:${projectId}:${idx + 1}`;
          nodes.push({
            id: ruleId,
            type: "rule",
            label: r,
            data: { index: idx + 1 },
          });
          edges.push({
            id: `edge:context:${projectId}->rule:${projectId}:${idx + 1}`,
            source: `context:${projectId}`,
            target: ruleId,
            type: "mandates",
          });
        });
      }

      let resources = [];
      try {
        resources = JSON.parse(ctxRow.recursos || "[]");
      } catch {}
      if (Array.isArray(resources)) {
        resources.forEach((res, idx) => {
          const resId = `resource:${projectId}:${idx + 1}`;
          nodes.push({
            id: resId,
            type: "resource",
            label: res.title || "Recurso",
            data: { url: res.url || "" },
          });
          edges.push({
            id: `edge:context:${projectId}->resource:${projectId}:${idx + 1}`,
            source: `context:${projectId}`,
            target: resId,
            type: "references",
          });
        });
      }
    }

    const files = db
      .prepare("SELECT id, nombre_archivo, mime_type, tamano, creado_en FROM proyecto_archivos WHERE proyecto_id = ? ORDER BY creado_en ASC")
      .all(projectId);

    for (const f of files) {
      nodes.push({
        id: `file:${f.id}`,
        type: "file",
        label: f.nombre_archivo,
        data: {
          mimeType: f.mime_type,
          size: Number(f.tamano),
          createdAt: f.creado_en,
        },
      });
      edges.push({
        id: `edge:project:${projectId}->file:${f.id}`,
        source: `project:${projectId}`,
        target: `file:${f.id}`,
        type: "has_file",
      });
    }

    return {
      version,
      projectId,
      nodes,
      edges,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        taskCount: tasks.length,
        listCount: lists.length,
        subtaskCount: subtasks.length,
        fileCount: files.length,
      },
    };
  });
}

function compileProjectContext(db, projectId, options = {}) {
  ensureProjectGraphSchema(db);

  return withSnapshot(db, () => {
    const queryText = (options.queryText || "").trim();
    const maxBudgetChars = Number.isSafeInteger(options.maxBudgetChars) && options.maxBudgetChars > 0
      ? options.maxBudgetChars
      : DEFAULT_BUDGET_CHARS;

    const explicitTaskIds = new Set();
    const explicitMatches = queryText.matchAll(/(?:\[tarea:\s*(\d+)\]|#(\d+)|(?:tarea|task)\s+(\d+))/gi);
    for (const match of explicitMatches) {
      const rawNum = match[1] || match[2] || match[3];
      if (rawNum) {
        const parsed = Number(rawNum);
        if (Number.isSafeInteger(parsed) && parsed > 0) {
          explicitTaskIds.add(parsed);
        }
      }
    }

    const version = getProjectVersion(db, projectId);

    // 1. Contexto, Reglas y Recursos base
    const ctxRow = db
      .prepare("SELECT contexto, reglas, recursos FROM proyecto_contexto WHERE proyecto_id = ?")
      .get(projectId);

    let rawRules = [];
    let rawResources = [];
    let contextDescription = "";

    if (ctxRow) {
      contextDescription = (ctxRow.contexto || "").trim();
      try {
        rawRules = JSON.parse(ctxRow.reglas || "[]");
      } catch {}
      try {
        rawResources = JSON.parse(ctxRow.recursos || "[]");
      } catch {}
    }

    // 2. Estructura de listas (obligatoria para mapeo de kanban)
    const lists = db
      .prepare(
        `SELECT lt.id, lt.nombre, lt.estado,
                COUNT(t.id) AS task_count
         FROM listas_tareas lt
         LEFT JOIN tareas t ON t.lista_id = lt.id
         WHERE lt.proyecto_id = ?
         GROUP BY lt.id
         ORDER BY lt.id ASC`
      )
      .all(projectId);

    let listsSummary = "### ESTRUCTURA KANBAN:\n";
    for (const l of lists) {
      listsSummary += `- Lista [id:${l.id}] "${l.nombre}": ${l.task_count} tarea(s)\n`;
    }
    listsSummary += "\n";

    const rulesHeader = "### REGLAS OBLIGATORIAS:\n";
    const rulesFormatted = rawRules.length > 0 ? rawRules.map((r) => `- ${r}`).join("\n") + "\n\n" : "";
    const mandatoryRulesBlock = rawRules.length > 0 ? `${rulesHeader}${rulesFormatted}` : "";

    const minimalEssentialLength = mandatoryRulesBlock.length + listsSummary.length + MIN_ESSENTIAL_RESERVE_CHARS;
    if (minimalEssentialLength > maxBudgetChars) {
      throw new ProjectContextBudgetError(
        `Presupuesto de caracteres insuficiente para reglas obligatorias y estructura esencial del proyecto (${minimalEssentialLength} > ${maxBudgetChars})`
      );
    }

    // 3. Tareas en BD
    const allTasks = db
      .prepare(
        `SELECT t.id, t.lista_id, lt.nombre AS lista_nombre, t.nombre,
                p.nombre AS prioridad_nombre,
                e.nombre AS estado_nombre,
                (SELECT COUNT(*) FROM subtareas st WHERE st.tarea_id = t.id) AS total_sub,
                (SELECT COUNT(*) FROM subtareas st WHERE st.tarea_id = t.id AND st.completada = 1) AS done_sub
         FROM tareas t
         JOIN listas_tareas lt ON lt.id = t.lista_id
         LEFT JOIN prioridades p ON p.id = t.prioridad_id
         LEFT JOIN estados e ON e.id = t.estado_id
         WHERE lt.proyecto_id = ?
         ORDER BY t.lista_id ASC, COALESCE(t.posicion, 0) ASC, t.id ASC`
      )
      .all(projectId);

    const allTaskMap = new Map(allTasks.map((t) => [t.id, t]));

    // 4. Detalle de tareas explícitas primero
    const explicitDetails = [];
    const missingExplicitIds = [];
    for (const eid of explicitTaskIds) {
      if (allTaskMap.has(eid)) {
        explicitDetails.push(allTaskMap.get(eid));
      } else {
        missingExplicitIds.push(eid);
      }
    }

    // Tareas adicionales que coincidan con palabras clave
    const lowerQuery = queryText.toLowerCase();
    const queryTokens = lowerQuery
      .split(/\s+/)
      .map((w) => w.replace(/[^a-záéíóúñ0-9]/gi, "").trim())
      .filter((w) => w.length >= 3);

    const keywordDetails = [];
    if (queryTokens.length > 0) {
      for (const t of allTasks) {
        if (explicitTaskIds.has(t.id)) continue;
        const lowerName = t.nombre.toLowerCase();
        if (queryTokens.some((tok) => lowerName.includes(tok))) {
          keywordDetails.push(t);
        }
      }
    }

    const prioritizedDetailTasks = [...explicitDetails, ...keywordDetails];

    // Helper para formatear detalle acotado
    function formatTaskDetail(taskItem, budgetRemaining) {
      const fullTaskRow = db
        .prepare("SELECT descripcion, fecha_inicio, fecha_fin, archivos_enlaces FROM tareas WHERE id = ?")
        .get(taskItem.id);

      const subtasks = db
        .prepare("SELECT nombre, completada FROM subtareas WHERE tarea_id = ? ORDER BY id ASC")
        .all(taskItem.id);

      const tags = db
        .prepare(
          "SELECT e.nombre FROM tarea_etiquetas te JOIN etiquetas e ON e.id = te.etiqueta_id WHERE te.tarea_id = ?"
        )
        .all(taskItem.id);

      let item = `--- Detalle [tarea:${taskItem.id}] "${taskItem.nombre}" ---\n`;
      item += `Lista: ${taskItem.lista_nombre} | Prioridad: ${taskItem.prioridad_nombre || "Sin prioridad"} | Estado: ${taskItem.estado_nombre || "Pendiente"}\n`;
      if (tags.length > 0) {
        item += `Etiquetas: ${tags.map((tg) => tg.nombre).join(", ")}\n`;
      }
      if (fullTaskRow?.fecha_inicio || fullTaskRow?.fecha_fin) {
        item += `Fechas: ${fullTaskRow.fecha_inicio || "N/A"} a ${fullTaskRow.fecha_fin || "N/A"}\n`;
      }

      let isAttachmentsTruncated = false;
      if (fullTaskRow?.archivos_enlaces) {
        const att = String(fullTaskRow.archivos_enlaces);
        if (att.length > 200) {
          item += `Adjuntos/Enlaces: ${att.slice(0, 197)}... [adjuntos recortados]\n`;
          isAttachmentsTruncated = true;
        } else {
          item += `Adjuntos/Enlaces: ${att}\n`;
        }
      }

      let descStr = fullTaskRow?.descripcion ? `Descripción: ${fullTaskRow.descripcion}\n` : "";
      let subStr = "";
      if (subtasks.length > 0) {
        subStr = `Subtareas:\n${subtasks.map((st) => `  * [${st.completada ? "X" : " "}] ${st.nombre}`).join("\n")}\n`;
      }

      let candidate = item + descStr + subStr;
      if (candidate.length <= budgetRemaining) {
        return { text: candidate, truncated: isAttachmentsTruncated };
      }

      // Truncar descripción si excede
      const overhead = item.length + subStr.length + 50;
      const descBudget = budgetRemaining - overhead;
      if (descBudget > 40 && descStr) {
        const safeDesc = descStr.slice(0, descBudget) + "... [descripción truncada]\n";
        candidate = item + safeDesc + subStr;
        if (candidate.length <= budgetRemaining) {
          return { text: candidate, truncated: true };
        }
      }

      // Truncar subtareas si es necesario
      if (item.length + 30 <= budgetRemaining) {
        return { text: item + "... [detalle parcial por presupuesto]\n", truncated: true };
      }

      return null;
    }

    // 5. Construir secciones de detalles prioritarios
    let detailsBlock = "";
    let detailedTasksCount = 0;
    let truncatedDetailTasksCount = 0;
    let missingDetailCount = missingExplicitIds.length;

    let maxDetailsAllowance = Math.max(0, maxBudgetChars - (mandatoryRulesBlock.length + listsSummary.length + 800));

    if (prioritizedDetailTasks.length > 0) {
      if (maxDetailsAllowance > 200) {
        let tempDetails = "\n### DETALLE DE TAREAS RELEVANTES:\n";
        for (let i = 0; i < prioritizedDetailTasks.length; i++) {
          const t = prioritizedDetailTasks[i];
          const remainingForThis = maxDetailsAllowance - tempDetails.length;
          if (remainingForThis < 80) {
            missingDetailCount += (prioritizedDetailTasks.length - i);
            break;
          }
          const formatted = formatTaskDetail(t, remainingForThis);
          if (formatted) {
            tempDetails += formatted.text;
            detailedTasksCount++;
            if (formatted.truncated) {
              truncatedDetailTasksCount++;
            }
          } else {
            missingDetailCount++;
          }
        }
        if (detailedTasksCount > 0) {
          detailsBlock = tempDetails;
        }
      } else {
        missingDetailCount += prioritizedDetailTasks.length;
      }
    }

    // Aviso acotado para IDs explícitos inexistentes
    if (missingExplicitIds.length > 0) {
      const maxSample = 5;
      const sample = missingExplicitIds.slice(0, maxSample).map((id) => `[tarea:${id}]`).join(", ");
      const extra = missingExplicitIds.length > maxSample ? ` y ${missingExplicitIds.length - maxSample} más` : "";
      detailsBlock += `[Aviso: Tareas citadas no encontradas (${missingExplicitIds.length}): ${sample}${extra}]\n`;
    }

    // 6. Eventos recientes acotados
    const recentEvents = db
      .prepare(
        `SELECT entidad_tipo, entidad_id, accion, creado_en
         FROM proyecto_eventos
         WHERE proyecto_id = ?
         ORDER BY id DESC
         LIMIT 5`
      )
      .all(projectId);

    let eventsBlock = "";
    if (recentEvents.length > 0) {
      let tempEvents = "\n### ACTIVIDAD RECIENTE CONFIRMADA:\n";
      for (const ev of recentEvents) {
        tempEvents += `- ${ev.creado_en}: [${ev.entidad_tipo}:${ev.entidad_id}] ${ev.accion}\n`;
      }
      eventsBlock = tempEvents;
    }

    // 7. Contexto general y Recursos
    let contextBlock = "";
    if (contextDescription) {
      contextBlock = `### CONTEXTO DEL PROYECTO:\n${contextDescription}\n\n`;
    }

    let resourcesBlock = "";
    if (rawResources.length > 0) {
      resourcesBlock = "### RECURSOS:\n" + rawResources.map((r) => `- ${r.title}: ${r.url}`).join("\n") + "\n\n";
    }

    const files = db
      .prepare("SELECT id, nombre_archivo, mime_type, tamano FROM proyecto_archivos WHERE proyecto_id = ? ORDER BY creado_en ASC")
      .all(projectId);

    if (files.length > 0) {
      resourcesBlock += "### ARCHIVOS ASOCIADOS:\n" + files.map((f) => `- [file:${f.id}] ${f.nombre_archivo} (${f.mime_type}, ${f.tamano} bytes)`).join("\n") + "\n\n";
    }

    let currentTotal = mandatoryRulesBlock.length + listsSummary.length + detailsBlock.length + eventsBlock.length + 600;

    if (contextBlock.length + currentTotal > maxBudgetChars) {
      const allowedCtx = Math.max(0, maxBudgetChars - currentTotal - 100);
      if (allowedCtx > 50) {
        contextBlock = `### CONTEXTO DEL PROYECTO:\n${contextDescription.slice(0, allowedCtx)}... [contexto recortado]\n\n`;
      } else {
        contextBlock = `[Nota: Contexto descriptivo omitido por presupuesto]\n\n`;
      }
    }

    currentTotal += contextBlock.length;

    if (resourcesBlock.length + currentTotal > maxBudgetChars) {
      const allowedRes = Math.max(0, maxBudgetChars - currentTotal - 100);
      if (allowedRes > 50) {
        resourcesBlock = resourcesBlock.slice(0, allowedRes) + "... [recursos recortados]\n\n";
      } else {
        resourcesBlock = `[Nota: Recursos omitidos por presupuesto]\n\n`;
      }
    }

    const fixedHeaderBlock = `${contextBlock}${mandatoryRulesBlock}${listsSummary}${resourcesBlock}`;

    // 8. Resumen Kanban de tareas
    let tasksSummaryBlock = "### RESUMEN DE TAREAS (KANBAN ACTUAL):\n";
    let includedCount = 0;
    let truncatedCount = 0;

    for (const t of allTasks) {
      const checksStr = t.total_sub > 0 ? ` [subtareas: ${t.done_sub}/${t.total_sub}]` : "";
      const line = `- [tarea:${t.id}] "${t.nombre}" en "${t.lista_nombre}" | Prioridad: ${t.prioridad_nombre || "Sin prioridad"} | Estado: ${t.estado_nombre || "Pendiente"}${checksStr}\n`;

      const wouldBeLength = fixedHeaderBlock.length + tasksSummaryBlock.length + line.length + detailsBlock.length + eventsBlock.length + 250;
      if (wouldBeLength <= maxBudgetChars) {
        tasksSummaryBlock += line;
        includedCount++;
      } else {
        truncatedCount++;
      }
    }

    const isSummaryComplete = truncatedCount === 0;
    const isComplete = isSummaryComplete &&
      truncatedDetailTasksCount === 0 &&
      missingDetailCount === 0 &&
      detailedTasksCount === prioritizedDetailTasks.length;

    const coverage = {
      totalTasks: allTasks.length,
      includedSummaryTasks: includedCount,
      truncatedSummaryTasks: truncatedCount,
      isSummaryComplete,
      isComplete,
      detailedTasksCount,
      truncatedDetailTasksCount,
      missingDetailCount,
      budgetChars: maxBudgetChars,
    };

    let detailSummaryMsg = "";
    if (prioritizedDetailTasks.length > 0) {
      detailSummaryMsg = ` Detalles seleccionados: ${detailedTasksCount} incluidos (${truncatedDetailTasksCount} parciales), ${missingDetailCount} omitidos.`;
    }

    const coverageNote = isSummaryComplete
      ? `\n[Cobertura kanban: RESUMEN COMPLETO (${allTasks.length} de ${allTasks.length} tareas listadas; no equivale a auditoría detallada de descripciones).${detailSummaryMsg}]\n`
      : `\n[Cobertura kanban: RESUMEN PARCIAL (${includedCount} de ${allTasks.length} tareas listadas por límite de presupuesto. ${truncatedCount} no listadas. Citar sólo datos confirmados).${detailSummaryMsg}]\n`;

    let compiledPrompt = `${fixedHeaderBlock}${tasksSummaryBlock}${coverageNote}${detailsBlock}${eventsBlock}`.trim();

    // Verificación de invariante estricta sin recortes arbitrarios ciegos
    if (compiledPrompt.length > maxBudgetChars) {
      if (eventsBlock) {
        compiledPrompt = `${fixedHeaderBlock}${tasksSummaryBlock}${coverageNote}${detailsBlock}`.trim();
      }
      if (compiledPrompt.length > maxBudgetChars) {
        throw new ProjectContextBudgetError(
          `No se pudo ensamblar el contexto dentro del presupuesto estricto de ${maxBudgetChars} caracteres sin comprometer datos estructurados obligatorios`
        );
      }
    }

    return {
      version,
      context: contextDescription,
      rules: rawRules,
      resources: rawResources,
      compiledPrompt,
      coverage,
    };
  });
}

module.exports = {
  DEFAULT_BUDGET_CHARS,
  ProjectContextBudgetError,
  withSnapshot,
  ensureProjectGraphSchema,
  isProjectGraphSchemaCurrent,
  getProjectVersion,
  getProjectGraph,
  compileProjectContext,
};
