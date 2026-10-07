"use strict";

const crypto = require("node:crypto");

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_PRIORITIES = new Set(["alta", "media", "baja", "sin prioridad"]);
const ALLOWED_STATUSES = new Set(["pending", "accepted", "discarded"]);

const MAX_SUGGESTIONS_PER_MESSAGE = Infinity;
const MAX_SUBTASKS_PER_SUGGESTION = 20;
const MAX_TITLE_LEN = 255;
const MAX_DESC_LEN = 2000;
const MAX_TAGS_PER_SUGGESTION = 10;
const MAX_TAG_NAME_LEN = 80;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

function isValidUuid(id) {
  return typeof id === "string" && UUID_V4_REGEX.test(id);
}

function normalizePriority(val) {
  if (typeof val !== "string") return "sin prioridad";
  const lower = val.trim().toLowerCase();
  if (ALLOWED_PRIORITIES.has(lower)) return lower;
  return "sin prioridad";
}

function sanitizeSuggestionTitle(title) {
  if (typeof title !== "string") return null;
  const trimmed = title.replace(/[\x00-\x1F\x7F]/g, "").trim();
  if (!trimmed || trimmed.length > MAX_TITLE_LEN) return null;
  return trimmed;
}

function sanitizeSuggestionDescription(desc) {
  if (desc === undefined || desc === null) return "";
  if (typeof desc !== "string") return null;
  const trimmed = desc.replace(/[\x00-\x1F\x7F]/g, "").trim();
  if (trimmed.length > MAX_DESC_LEN) return null;
  return trimmed;
}

function sanitizeSubtasks(subtasks) {
  if (subtasks === undefined) return [];
  if (!Array.isArray(subtasks)) return null;
  if (subtasks.length > MAX_SUBTASKS_PER_SUGGESTION) return null;

  const result = [];
  for (const st of subtasks) {
    if (!st || typeof st !== "object" || Array.isArray(st)) return null;
    if (Object.keys(st).some((key) => key !== "title")) return null;
    const title = sanitizeSuggestionTitle(st.title);
    if (!title) return null;
    result.push({ title });
  }
  return result;
}

function sanitizeProposalTag(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (Object.keys(raw).some((key) => key !== "name" && key !== "color")) return null;
  if (typeof raw.name !== "string") return null;
  const name = raw.name.replace(/[\x00-\x1F\x7F]/g, "").trim();
  if (name.length < 1 || name.length > MAX_TAG_NAME_LEN) return null;
  if (raw.color !== undefined && raw.color !== null) {
    if (typeof raw.color !== "string" || !HEX_COLOR_REGEX.test(raw.color)) return null;
    return { name, color: raw.color };
  }
  return { name };
}

function sanitizeProposalTags(tags, options = {}) {
  const required = options.required === true;
  if (tags === undefined || tags === null) return required ? null : [];
  if (!Array.isArray(tags)) return null;
  if (tags.length > MAX_TAGS_PER_SUGGESTION) return null;

  const result = [];
  const seen = new Set();
  for (const raw of tags) {
    const tag = sanitizeProposalTag(raw);
    if (!tag) return null;
    const lower = tag.name.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(tag);
  }
  if (required && result.length === 0) return null;
  return result;
}

function sanitizeTitleList(list, max) {
  if (!Array.isArray(list) || list.length === 0 || list.length > max) return null;
  const result = [];
  for (const item of list) {
    const title = sanitizeSuggestionTitle(item);
    if (!title) return null;
    result.push(title);
  }
  return result;
}

function isValidDateOnly(val) {
  if (typeof val !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const date = new Date(`${val}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === val;
}

function sanitizeTaskChanges(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const allowed = ["title", "description", "priority", "startDate", "endDate", "column", "addTags", "addSubtasks", "removeTags", "removeSubtasks", "completeSubtasks", "reopenSubtasks", "renameSubtasks"];
  const keys = Object.keys(raw);
  if (keys.length === 0 || keys.some((key) => !allowed.includes(key))) return null;

  const changes = {};
  if (raw.title !== undefined) {
    const title = sanitizeSuggestionTitle(raw.title);
    if (!title) return null;
    changes.title = title;
  }
  if (raw.description !== undefined) {
    if (typeof raw.description !== "string") return null;
    const description = sanitizeSuggestionDescription(raw.description);
    if (description === null) return null;
    changes.description = description;
  }
  if (raw.priority !== undefined) {
    if (typeof raw.priority !== "string" || !ALLOWED_PRIORITIES.has(raw.priority.trim().toLowerCase())) return null;
    changes.priority = raw.priority.trim().toLowerCase();
  }
  for (const key of ["startDate", "endDate"]) {
    if (raw[key] === undefined) continue;
    if (raw[key] !== null && !isValidDateOnly(raw[key])) return null;
    changes[key] = raw[key];
  }
  if (changes.startDate && changes.endDate && changes.startDate > changes.endDate) return null;
  if (raw.column !== undefined) {
    if (raw.column !== 0 && raw.column !== 1 && raw.column !== 2) return null;
    changes.column = raw.column;
  }
  if (raw.addTags !== undefined) {
    const tags = sanitizeProposalTags(raw.addTags, { required: true });
    if (tags === null) return null;
    changes.addTags = tags;
  }
  if (raw.addSubtasks !== undefined) {
    const subtasks = sanitizeSubtasks(raw.addSubtasks);
    if (subtasks === null || subtasks.length === 0) return null;
    changes.addSubtasks = subtasks;
  }
  if (raw.removeTags !== undefined) {
    const names = sanitizeTitleList(raw.removeTags, MAX_TAGS_PER_SUGGESTION);
    if (!names) return null;
    changes.removeTags = names;
  }
  for (const key of ["removeSubtasks", "completeSubtasks", "reopenSubtasks"]) {
    if (raw[key] === undefined) continue;
    const titles = sanitizeTitleList(raw[key], MAX_SUBTASKS_PER_SUGGESTION);
    if (!titles) return null;
    changes[key] = titles;
  }
  if (raw.renameSubtasks !== undefined) {
    const list = raw.renameSubtasks;
    if (!Array.isArray(list) || list.length === 0 || list.length > MAX_SUBTASKS_PER_SUGGESTION) return null;
    const renames = [];
    for (const item of list) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      if (Object.keys(item).some((key) => key !== "from" && key !== "to")) return null;
      const from = sanitizeSuggestionTitle(item.from);
      const to = sanitizeSuggestionTitle(item.to);
      if (!from || !to) return null;
      renames.push({ from, to });
    }
    changes.renameSubtasks = renames;
  }
  return changes;
}

function sanitizeModelProposals(rawSuggestions) {
  if (rawSuggestions === undefined) return [];
  if (!Array.isArray(rawSuggestions)) return null;
  return rawSuggestions.slice(0, MAX_SUGGESTIONS_PER_MESSAGE).flatMap((item) => sanitizeProposalList([item]) ?? []);
}

function sanitizeProposalList(rawSuggestions) {
  if (rawSuggestions === undefined) return [];
  if (!Array.isArray(rawSuggestions)) return null;
  if (rawSuggestions.length > MAX_SUGGESTIONS_PER_MESSAGE) return null;

  const allowedKeys = ["title", "description", "priority", "subtasks", "kind", "targetTaskId", "tags", "changes"];
  const proposals = [];

  for (const item of rawSuggestions) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    if (Object.keys(item).some((key) => !allowedKeys.includes(key))) return null;

    const kind = item.kind === undefined ? "create" : item.kind;
    if (kind !== "create" && kind !== "add-tags" && kind !== "add-subtasks" && kind !== "edit") return null;
    if (kind === "create" && item.targetTaskId !== undefined) return null;
    if (item.priority !== undefined && (typeof item.priority !== "string" || !ALLOWED_PRIORITIES.has(item.priority.trim().toLowerCase()))) return null;

    const title = sanitizeSuggestionTitle(item.title);
    if (!title) return null;

    const description = sanitizeSuggestionDescription(item.description);
    if (description === null) return null;

    const priority = normalizePriority(item.priority);

    const subtasks = sanitizeSubtasks(item.subtasks);
    if (subtasks === null) return null;

    if (kind === "edit") {
      if (!Number.isSafeInteger(item.targetTaskId) || item.targetTaskId <= 0) return null;
      const changes = sanitizeTaskChanges(item.changes);
      if (!changes) return null;
      proposals.push({
        id: crypto.randomUUID(),
        kind: "edit",
        targetTaskId: item.targetTaskId,
        title,
        description,
        priority,
        subtasks: [],
        changes,
        status: "pending",
        taskId: null,
      });
      continue;
    }

    if (kind === "add-subtasks") {
      if (!Number.isSafeInteger(item.targetTaskId) || item.targetTaskId <= 0) return null;
      if (subtasks.length === 0) return null;
      proposals.push({
        id: crypto.randomUUID(),
        kind: "add-subtasks",
        targetTaskId: item.targetTaskId,
        title,
        description,
        priority,
        subtasks,
        status: "pending",
        taskId: null,
      });
      continue;
    }

    if (kind === "add-tags") {
      if (!Number.isSafeInteger(item.targetTaskId) || item.targetTaskId <= 0) return null;
      const tags = sanitizeProposalTags(item.tags, { required: true });
      if (tags === null) return null;

      proposals.push({
        id: crypto.randomUUID(),
        kind: "add-tags",
        targetTaskId: item.targetTaskId,
        title,
        description,
        priority,
        subtasks,
        tags,
        status: "pending",
        taskId: null,
      });
      continue;
    }

    let tags;
    if (item.tags !== undefined) {
      tags = sanitizeProposalTags(item.tags, { required: false });
      if (tags === null) return null;
    }

    proposals.push({
      id: crypto.randomUUID(),
      title,
      description,
      priority,
      subtasks,
      ...(tags !== undefined ? { tags } : {}),
      status: "pending",
      taskId: null,
    });
  }

  return proposals;
}

function validatePersistedSuggestions(suggestions) {
  if (!Array.isArray(suggestions)) {
    return { error: "suggestions debe ser un array" };
  }
  if (suggestions.length > MAX_SUGGESTIONS_PER_MESSAGE) {
    return { error: `Máximo ${MAX_SUGGESTIONS_PER_MESSAGE} sugerencias permitidas por mensaje` };
  }

  const allowedKeys = ["id", "title", "description", "priority", "subtasks", "status", "taskId", "kind", "targetTaskId", "tags", "changes"];
  const result = [];
  const seenIds = new Set();

  for (const s of suggestions) {
    if (!s || typeof s !== "object" || Array.isArray(s)) {
      return { error: "Cada sugerencia debe ser un objeto" };
    }
    if (Object.keys(s).some((key) => !allowedKeys.includes(key))) {
      return { error: "La sugerencia contiene campos no permitidos" };
    }
    if (!isValidUuid(s.id)) {
      return { error: "Identificador UUID de sugerencia inválido" };
    }
    if (seenIds.has(s.id)) {
      return { error: "ID de sugerencia duplicado" };
    }
    seenIds.add(s.id);

    const title = sanitizeSuggestionTitle(s.title);
    if (!title) {
      return { error: "Título de sugerencia inválido o excede 255 caracteres" };
    }

    const description = sanitizeSuggestionDescription(s.description);
    if (description === null) {
      return { error: "Descripción de sugerencia inválida o excede 2000 caracteres" };
    }

    if (!ALLOWED_PRIORITIES.has(s.priority)) {
      return { error: "Prioridad de sugerencia inválida" };
    }

    const subtasks = sanitizeSubtasks(s.subtasks);
    if (subtasks === null) {
      return { error: "Subtareas de sugerencia inválidas o exceden el límite de 20" };
    }

    if (!ALLOWED_STATUSES.has(s.status)) {
      return { error: "Estado de sugerencia inválido" };
    }

    let taskId = null;
    if (s.taskId !== undefined && s.taskId !== null) {
      if (!Number.isSafeInteger(s.taskId) || s.taskId <= 0) {
        return { error: "taskId de sugerencia debe ser un entero positivo o null" };
      }
      taskId = s.taskId;
    }

    const kind = s.kind === undefined ? "create" : s.kind;
    if (kind !== "create" && kind !== "add-tags" && kind !== "add-subtasks" && kind !== "edit") {
      return { error: "kind de sugerencia inválido" };
    }
    if (kind === "create" && s.targetTaskId !== undefined) {
      return { error: "Una propuesta de creación no puede indicar una tarea objetivo" };
    }

    let targetTaskId = null;
    let tags;
    let changes;
    if (kind === "edit") {
      if (!Number.isSafeInteger(s.targetTaskId) || s.targetTaskId <= 0) {
        return { error: "targetTaskId es obligatorio para sugerencias edit" };
      }
      targetTaskId = s.targetTaskId;
      changes = sanitizeTaskChanges(s.changes);
      if (!changes) {
        return { error: "changes de sugerencia edit inválidos" };
      }
    } else if (kind === "add-subtasks") {
      if (!Number.isSafeInteger(s.targetTaskId) || s.targetTaskId <= 0) {
        return { error: "targetTaskId es obligatorio para sugerencias add-subtasks" };
      }
      targetTaskId = s.targetTaskId;
    } else if (kind === "add-tags") {
      if (!Number.isSafeInteger(s.targetTaskId) || s.targetTaskId <= 0) {
        return { error: "targetTaskId es obligatorio para sugerencias add-tags" };
      }
      targetTaskId = s.targetTaskId;
      tags = sanitizeProposalTags(s.tags, { required: true });
      if (tags === null) {
        return { error: "tags de sugerencia add-tags inválidas o exceden el máximo de 10" };
      }
    } else if (s.tags !== undefined) {
      tags = sanitizeProposalTags(s.tags, { required: false });
      if (tags === null) {
        return { error: "tags de sugerencia inválidas o exceden el máximo de 10" };
      }
    }

    result.push({
      id: s.id,
      title,
      description,
      priority: s.priority,
      subtasks,
      status: s.status,
      ...(taskId ? { taskId } : {}),
      ...(kind === "add-tags" ? { kind: "add-tags", targetTaskId, tags } : {}),
      ...(kind === "add-subtasks" ? { kind: "add-subtasks", targetTaskId } : {}),
      ...(kind === "edit" ? { kind: "edit", targetTaskId, changes } : {}),
      ...(kind === "create" && tags !== undefined ? { tags } : {}),
    });
  }

  return { data: result };
}

function validateSuggestionAcceptReview(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "El cuerpo debe ser un objeto JSON" };
  }

  const keys = Object.keys(body);
  const hasTitle = keys.includes("title");

  if (keys.length === 1 && keys[0] === "changes") {
    const changes = sanitizeTaskChanges(body.changes);
    if (!changes) return { error: "changes contiene cambios inválidos o vacíos" };
    return { mode: "edit", data: { changes } };
  }

  if (keys.length === 1 && keys[0] === "subtasks") {
    const subtasks = sanitizeSubtasks(body.subtasks);
    if (subtasks === null || subtasks.length === 0) {
      return { error: "subtasks debe contener entre 1 y 20 subtareas válidas" };
    }
    return { mode: "add-subtasks", data: { subtasks } };
  }

  if (!hasTitle) {
    if (keys.length === 0 || keys.some((key) => key !== "tags")) {
      return { error: "El cuerpo contiene campos no permitidos" };
    }
    const tags = sanitizeProposalTags(body.tags, { required: true });
    if (tags === null) {
      return { error: "tags debe contener entre 1 y 10 etiquetas válidas (nombre 1-80, color HEX #RRGGBB opcional)" };
    }
    return { mode: "add-tags", data: { tags } };
  }

  const createKeys = ["title", "description", "priority", "subtasks", "tags"];
  if (keys.some((key) => !createKeys.includes(key))) {
    return { error: "El cuerpo contiene campos no permitidos" };
  }
  if (typeof body.priority !== "string" || !ALLOWED_PRIORITIES.has(body.priority.trim().toLowerCase())) {
    return { error: "Prioridad de sugerencia inválida" };
  }

  const title = sanitizeSuggestionTitle(body.title);
  if (!title) {
    return { error: "title es obligatorio y debe tener entre 1 y 255 caracteres" };
  }

  const description = sanitizeSuggestionDescription(body.description);
  if (description === null) {
    return { error: "description excede el límite de 2000 caracteres" };
  }

  const priority = normalizePriority(body.priority);

  const subtasks = sanitizeSubtasks(body.subtasks);
  if (subtasks === null) {
    return { error: "subtasks contiene elementos inválidos o supera el límite de 20" };
  }

  let tags;
  if (body.tags !== undefined) {
    tags = sanitizeProposalTags(body.tags, { required: false });
    if (tags === null) {
      return { error: "tags contiene etiquetas inválidas o supera el máximo de 10" };
    }
  }

  return {
    mode: "create",
    data: {
      title,
      description,
      priority,
      subtasks,
      ...(tags !== undefined ? { tags } : {}),
    },
  };
}

function ensureSuggestionTasksTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_suggestion_tasks (
      chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      suggestion_id TEXT NOT NULL,
      tarea_id INTEGER REFERENCES tareas(id) ON DELETE SET NULL,
      creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(chat_id, suggestion_id)
    );
    CREATE INDEX IF NOT EXISTS idx_chat_suggestion_tasks_chat ON chat_suggestion_tasks(chat_id);
    CREATE INDEX IF NOT EXISTS idx_chat_suggestion_tasks_tarea ON chat_suggestion_tasks(tarea_id);
  `);
}

module.exports = {
  isValidUuid,
  normalizePriority,
  sanitizeProposalTag,
  sanitizeProposalTags,
  sanitizeModelProposals,
  validatePersistedSuggestions,
  validateSuggestionAcceptReview,
  ensureSuggestionTasksTable,
};
