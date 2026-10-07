"use strict";

const { randomUUID } = require("node:crypto");

const {
  maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
  maxAttachments: MAX_ATTACHMENTS,
  attachmentTypes: ATTACHMENT_TYPES,
  attachmentError,
  validAttachment,
} = require("../../app/chat-attachments.mjs");
const MAX_STAGED_BYTES = 50 * 1024 * 1024;
const MAX_MODEL_FILE_BYTES = 12 * 1024 * 1024;

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const { isOfficeType, extractOfficeText } = require("./office-text.cjs");

const TEXT_TYPES = new Set(["text/plain", "text/markdown", "text/csv", "application/json"]);

function ensureAttachmentsTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS chat_adjuntos (
    id TEXT PRIMARY KEY,
    proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL, tipo TEXT NOT NULL, tamano INTEGER NOT NULL,
    contenido BLOB NOT NULL, creado_en TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_adjuntos_proyecto ON chat_adjuntos(proyecto_id);`);
}

function isValidAttachmentId(value) {
  return typeof value === "string" && UUID_V4_REGEX.test(value);
}

function attachmentTypeFor(name) {
  if (typeof name !== "string") return "";
  const extension = name.split(".").pop().toLowerCase();
  return Object.hasOwn(ATTACHMENT_TYPES, extension) ? ATTACHMENT_TYPES[extension] : "";
}

function hasPrefix(buffer, bytes) {
  if (buffer.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buffer[i] !== bytes[i]) return false;
  }
  return true;
}

function validateAttachmentBytes(type, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
  if (type === "image/png") return hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (type === "image/jpeg") return hasPrefix(buffer, [0xff, 0xd8, 0xff]);
  if (type === "image/webp") return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (type === "application/pdf") return hasPrefix(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (isOfficeType(type)) {
    if (!hasPrefix(buffer, [0x50, 0x4b, 0x03, 0x04])) return false;
    try {
      extractOfficeText(type, buffer);
      return true;
    } catch {
      return false;
    }
  }
  if (TEXT_TYPES.has(type)) {
    if (buffer.includes(0)) return false;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function attachmentMetadata(row) {
  return { id: row.id, name: row.nombre, type: row.tipo, size: Number(row.tamano) };
}

function saveAttachment(db, projectId, name, type, buffer) {
  ensureAttachmentsTable(db);
  const id = randomUUID();
  db.prepare("INSERT INTO chat_adjuntos (id, proyecto_id, nombre, tipo, tamano, contenido, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, projectId, name, type, buffer.length, buffer, new Date().toISOString());
  return { id, name, type, size: buffer.length };
}

function getAttachment(db, projectId, id) {
  if (!isValidAttachmentId(id)) return null;
  ensureAttachmentsTable(db);
  const row = db
    .prepare("SELECT id, nombre, tipo, tamano, contenido FROM chat_adjuntos WHERE id = ? AND proyecto_id = ?")
    .get(id, projectId);
  if (!row) return null;
  return {
    id: row.id,
    name: row.nombre,
    type: row.tipo,
    size: Number(row.tamano),
    data: Buffer.from(row.contenido),
  };
}

function collectReferencedIds(db, projectId) {
  const referenced = new Set();
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'chats'").get()) return referenced;
  const rows = db.prepare("SELECT mensajes FROM chats WHERE proyecto_id = ?").all(projectId);
  for (const row of rows) {
    const parsed = JSON.parse(row.mensajes);
    if (!Array.isArray(parsed)) throw new Error("Historial de chat corrupto; no se pueden eliminar adjuntos.");
    for (const message of parsed) {
      if (!message || typeof message !== "object") throw new Error("Historial de chat corrupto.");
      if (!Object.hasOwn(message, "attachments")) continue;
      if (!Array.isArray(message.attachments)) throw new Error("Historial de adjuntos corrupto.");
      for (const attachment of message.attachments) {
        if (attachment && typeof attachment.id === "string") referenced.add(attachment.id);
      }
    }
  }
  return referenced;
}

function isAttachmentReferenced(db, projectId, id) {
  return collectReferencedIds(db, projectId).has(id);
}

function getStagedAttachmentBytes(db, projectId) {
  ensureAttachmentsTable(db);
  const rows = db.prepare("SELECT id, tamano FROM chat_adjuntos WHERE proyecto_id = ?").all(projectId);
  if (rows.length === 0) return 0;
  const referenced = collectReferencedIds(db, projectId);
  let total = 0;
  for (const row of rows) {
    if (!referenced.has(row.id)) total += Number(row.tamano);
  }
  return total;
}

function pruneStagedAttachments(db, projectId) {
  ensureAttachmentsTable(db);
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const expired = db.prepare("SELECT id FROM chat_adjuntos WHERE proyecto_id = ? AND creado_en < ?").all(projectId, cutoff);
  if (!expired.length) return;
  const referenced = collectReferencedIds(db, projectId);
  const remove = db.prepare("DELETE FROM chat_adjuntos WHERE id = ? AND proyecto_id = ?");
  for (const row of expired) if (!referenced.has(row.id)) remove.run(row.id, projectId);
}

function resolveMessageAttachments(db, projectId, messages) {
  const needsResolution = messages.some((message) => message.attachments?.length);
  if (!needsResolution) return { data: messages };
  ensureAttachmentsTable(db);
  const lookup = db.prepare("SELECT id, nombre, tipo, tamano FROM chat_adjuntos WHERE id = ? AND proyecto_id = ?");
  const resolved = [];
  for (const message of messages) {
    if (!message.attachments?.length) {
      resolved.push(message);
      continue;
    }
    const attachments = [];
    for (const attachment of message.attachments) {
      const row = lookup.get(attachment.id, projectId);
      if (!row) return { error: "El adjunto no existe o no pertenece al proyecto." };
      attachments.push(attachmentMetadata(row));
    }
    resolved.push({ ...message, attachments });
  }
  return { data: resolved };
}

function attachFilesToMessages(db, projectId, messages) {
  const out = messages.map(({ role, content }) => ({ role, content }));
  let budget = MAX_MODEL_FILE_BYTES;
  for (let i = messages.length - 1; i >= 0; i--) {
    const ids = messages[i].attachmentIds;
    if (!Array.isArray(ids) || !ids.length) continue;
    const files = [];
    for (const id of ids) {
      const file = getAttachment(db, projectId, id);
      if (!file) continue;
      if (isOfficeType(file.type)) {
        try {
          files.push({ name: file.name, type: file.type, text: extractOfficeText(file.type, file.data) });
        } catch {
          files.push({ name: file.name, type: file.type, skipped: true });
        }
        continue;
      }
      const isText = TEXT_TYPES.has(file.type);
      if (!isText && file.size > budget) {
        files.push({ name: file.name, type: file.type, skipped: true });
        continue;
      }
      if (!isText) budget -= file.size;
      files.push({ name: file.name, type: file.type, data: file.data });
    }
    if (files.length) out[i].files = files;
  }
  return out;
}

function attachmentIdsOfMessages(rawMessages) {
  try {
    const parsed = JSON.parse(rawMessages);
    return Array.isArray(parsed)
      ? parsed.flatMap((message) => (Array.isArray(message?.attachments) ? message.attachments : []))
          .flatMap((attachment) => (typeof attachment?.id === "string" ? [attachment.id] : []))
      : [];
  } catch {
    return [];
  }
}

function deleteUnreferencedAttachments(db, projectId, ids) {
  if (!ids.length) return 0;
  ensureAttachmentsTable(db);
  const referenced = collectReferencedIds(db, projectId);
  const remove = db.prepare("DELETE FROM chat_adjuntos WHERE id = ? AND proyecto_id = ?");
  let removed = 0;
  for (const id of new Set(ids)) {
    if (!isValidAttachmentId(id) || referenced.has(id)) continue;
    removed += Number(remove.run(id, projectId).changes);
  }
  return removed;
}

function deleteAttachment(db, projectId, id) {
  if (!isValidAttachmentId(id)) return { error: "notfound" };
  ensureAttachmentsTable(db);
  db.exec("BEGIN IMMEDIATE;");
  try {
    const row = db.prepare("SELECT id FROM chat_adjuntos WHERE id = ? AND proyecto_id = ?").get(id, projectId);
    const result = !row ? { error: "notfound" } : isAttachmentReferenced(db, projectId, id) ? { error: "linked" } : { data: true };
    if (result.data) db.prepare("DELETE FROM chat_adjuntos WHERE id = ? AND proyecto_id = ?").run(id, projectId);
    db.exec("COMMIT;");
    return result;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

module.exports = {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  MAX_STAGED_BYTES,
  ATTACHMENT_TYPES,
  ensureAttachmentsTable,
  isValidAttachmentId,
  attachmentTypeFor,
  attachmentError,
  validAttachment,
  validateAttachmentBytes,
  attachmentMetadata,
  saveAttachment,
  getAttachment,
  isAttachmentReferenced,
  getStagedAttachmentBytes,
  pruneStagedAttachments,
  resolveMessageAttachments,
  attachmentIdsOfMessages,
  deleteUnreferencedAttachments,
  attachFilesToMessages,
  deleteAttachment,
};
