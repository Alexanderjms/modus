"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const MAX_CONTEXT_LENGTH = 5000;
const MAX_RULES_COUNT = 50;
const MAX_RULE_LENGTH = 500;
const MAX_RESOURCES_COUNT = 50;
const MAX_RESOURCE_TITLE_LENGTH = 200;
const MAX_RESOURCE_URL_LENGTH = 2048;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB

function ensureProjectContextTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS proyecto_contexto (
      proyecto_id INTEGER PRIMARY KEY REFERENCES proyectos(id) ON DELETE CASCADE,
      contexto TEXT NOT NULL DEFAULT '',
      reglas TEXT NOT NULL DEFAULT '[]',
      recursos TEXT NOT NULL DEFAULT '[]',
      actualizado_en TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS proyecto_archivos (
      id TEXT PRIMARY KEY,
      proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
      nombre_archivo TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      tamano INTEGER NOT NULL,
      datos BLOB NOT NULL,
      creado_en TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_proyecto_archivos_proyecto ON proyecto_archivos(proyecto_id);
  `);
}

function isValidHttpUrl(stringVal) {
  if (typeof stringVal !== "string") return false;
  try {
    const parsed = new URL(stringVal);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const FILE_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseProjectFileResourceUrl(urlVal, currentProjectId) {
  if (typeof urlVal !== "string") return null;
  const trimmed = urlVal.trim();
  const match = trimmed.match(/^\/api\/projects\/(\d+)\/context\/files\/([0-9a-fA-F-]{36})$/);
  if (!match) return null;
  const urlProjectId = Number.parseInt(match[1], 10);
  const fileId = match[2].toLowerCase();
  if (!Number.isSafeInteger(urlProjectId) || urlProjectId <= 0) return null;
  if (!FILE_ID_REGEX.test(fileId)) return null;

  if (currentProjectId !== undefined && currentProjectId !== null) {
    if (urlProjectId !== Number(currentProjectId)) {
      return null;
    }
  }

  return { projectId: urlProjectId, fileId };
}

function sanitizeFilename(originalName) {
  if (typeof originalName !== "string") return "archivo.bin";
  const normalized = originalName.replace(/\\/g, "/");
  let name = path.posix.basename(normalized.trim());
  name = name.replace(/[\x00-\x1f\x7f"]/g, "");
  name = name.replace(/\s+/g, " ").trim();
  if (!name || name === "." || name === "..") {
    name = "archivo.bin";
  }
  if (name.length > MAX_RESOURCE_TITLE_LENGTH) {
    const ext = path.posix.extname(name);
    const base = path.posix.basename(name, ext);
    const maxBase = Math.max(1, MAX_RESOURCE_TITLE_LENGTH - ext.length);
    name = `${base.slice(0, maxBase)}${ext}`.slice(0, MAX_RESOURCE_TITLE_LENGTH);
  }
  return name;
}

function sanitizeMimeType(mimeType) {
  if (typeof mimeType !== "string") return "application/octet-stream";
  const trimmed = mimeType.trim().toLowerCase();
  if (/^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/i.test(trimmed)) {
    return trimmed;
  }
  return "application/octet-stream";
}

/**
 * @param {unknown} data
 * @param {any} [db]
 * @param {number|null} [projectId]
 */
function validateContextDocument(data, db = null, projectId = null) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { error: "El cuerpo debe ser un objeto JSON" };
  }

  const allowedKeys = new Set(["context", "rules", "resources"]);
  for (const k of Object.keys(data)) {
    if (!allowedKeys.has(k)) {
      return { error: `Campo no permitido: ${k}` };
    }
  }

  // context: string (max 5000 chars)
  const contextVal = data.context ?? "";
  if (typeof contextVal !== "string") {
    return { error: "'context' debe ser una cadena de texto" };
  }
  if (contextVal.length > MAX_CONTEXT_LENGTH) {
    return { error: `'context' excede el límite máximo de ${MAX_CONTEXT_LENGTH} caracteres` };
  }

  // rules: string[] (max 50 rules, each max 500 chars)
  const rulesVal = data.rules ?? [];
  if (!Array.isArray(rulesVal)) {
    return { error: "'rules' debe ser un array de cadenas de texto" };
  }
  if (rulesVal.length > MAX_RULES_COUNT) {
    return { error: `'rules' excede el límite máximo de ${MAX_RULES_COUNT} reglas` };
  }
  const sanitizedRules = [];
  for (let i = 0; i < rulesVal.length; i++) {
    const item = rulesVal[i];
    if (typeof item !== "string") {
      return { error: `La regla en posición ${i} debe ser una cadena de texto` };
    }
    const trimmed = item.trim();
    if (trimmed.length === 0) {
      return { error: `La regla en posición ${i} no puede estar vacía` };
    }
    if (trimmed.length > MAX_RULE_LENGTH) {
      return { error: `La regla en posición ${i} excede el límite de ${MAX_RULE_LENGTH} caracteres` };
    }
    sanitizedRules.push(trimmed);
  }

  // resources: { title: string, url: string }[] (max 50 resources)
  const resourcesVal = data.resources ?? [];
  if (!Array.isArray(resourcesVal)) {
    return { error: "'resources' debe ser un array de objetos { title, url }" };
  }
  if (resourcesVal.length > MAX_RESOURCES_COUNT) {
    return { error: `'resources' excede el límite máximo de ${MAX_RESOURCES_COUNT} recursos` };
  }
  const sanitizedResources = [];
  const allowedResourceKeys = new Set(["title", "url"]);
  for (let i = 0; i < resourcesVal.length; i++) {
    const res = resourcesVal[i];
    if (!res || typeof res !== "object" || Array.isArray(res)) {
      return { error: `El recurso en posición ${i} debe ser un objeto { title, url }` };
    }
    for (const rk of Object.keys(res)) {
      if (!allowedResourceKeys.has(rk)) {
        return { error: `Campo no permitido '${rk}' en el recurso en posición ${i}` };
      }
    }
    if (typeof res.title !== "string" || typeof res.url !== "string") {
      return { error: `El recurso en posición ${i} debe tener 'title' y 'url' como cadenas de texto` };
    }
    const titleTrimmed = res.title.trim();
    const urlTrimmed = res.url.trim();
    if (titleTrimmed.length === 0) {
      return { error: `El título del recurso en posición ${i} no puede estar vacío` };
    }
    if (titleTrimmed.length > MAX_RESOURCE_TITLE_LENGTH) {
      return { error: `El título del recurso en posición ${i} excede el límite de ${MAX_RESOURCE_TITLE_LENGTH} caracteres` };
    }
    if (urlTrimmed.length > MAX_RESOURCE_URL_LENGTH) {
      return { error: `La URL del recurso en posición ${i} excede el límite de ${MAX_RESOURCE_URL_LENGTH} caracteres` };
    }
    if (isValidHttpUrl(urlTrimmed)) {
      sanitizedResources.push({
        title: titleTrimmed,
        url: urlTrimmed,
      });
    } else {
      const parsedFile = parseProjectFileResourceUrl(urlTrimmed, projectId);
      if (!parsedFile) {
        return { error: `La URL del recurso en posición ${i} debe ser una dirección HTTP/HTTPS válida o una ruta de archivo del proyecto actual` };
      }
      if (db && projectId) {
        const fileExists = db
          .prepare("SELECT 1 FROM proyecto_archivos WHERE id = ? AND proyecto_id = ?")
          .get(parsedFile.fileId, projectId);
        if (!fileExists) {
          return { error: `El archivo referenciado en el recurso en posición ${i} no existe o no pertenece a este proyecto` };
        }
      }
      sanitizedResources.push({
        title: titleTrimmed,
        url: `/api/projects/${projectId || parsedFile.projectId}/context/files/${parsedFile.fileId}`,
      });
    }
  }

  return {
    data: {
      context: contextVal,
      rules: sanitizedRules,
      resources: sanitizedResources,
    },
  };
}

function getProjectContext(db, projectId) {
  ensureProjectContextTable(db);
  const row = db
    .prepare("SELECT contexto, reglas, recursos FROM proyecto_contexto WHERE proyecto_id = ?")
    .get(projectId);

  if (!row) {
    return {
      context: "",
      rules: [],
      resources: [],
    };
  }

  let rules = [];
  let resources = [];
  try {
    rules = JSON.parse(row.reglas);
    if (!Array.isArray(rules)) rules = [];
  } catch {
    rules = [];
  }

  try {
    resources = JSON.parse(row.recursos);
    if (!Array.isArray(resources)) resources = [];
  } catch {
    resources = [];
  }

  return {
    context: typeof row.contexto === "string" ? row.contexto : "",
    rules,
    resources,
  };
}

function saveProjectContext(db, projectId, doc) {
  ensureProjectContextTable(db);
  const now = new Date().toISOString();
  const rulesJson = JSON.stringify(doc.rules);
  const resourcesJson = JSON.stringify(doc.resources);

  db.prepare(`
    INSERT INTO proyecto_contexto (proyecto_id, contexto, reglas, recursos, actualizado_en)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(proyecto_id) DO UPDATE SET
      contexto = excluded.contexto,
      reglas = excluded.reglas,
      recursos = excluded.recursos,
      actualizado_en = excluded.actualizado_en
  `).run(projectId, doc.context, rulesJson, resourcesJson, now);

  return {
    context: doc.context,
    rules: doc.rules,
    resources: doc.resources,
  };
}

function saveProjectFile(db, projectId, { filename, mimeType, buffer }) {
  ensureProjectContextTable(db);
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    throw new Error("El archivo debe proporcionarse como un buffer binario");
  }
  const fileBytes = Buffer.from(buffer);
  if (fileBytes.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new Error(`El archivo excede el tamaño máximo permitido de 10 MiB`);
  }
  if (fileBytes.byteLength === 0) {
    throw new Error("El archivo no puede estar vacío");
  }

  const fileId = crypto.randomUUID().toLowerCase();
  const safeFilename = sanitizeFilename(filename);
  const safeMime = sanitizeMimeType(mimeType);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO proyecto_archivos (id, proyecto_id, nombre_archivo, mime_type, tamano, datos, creado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(fileId, projectId, safeFilename, safeMime, fileBytes.byteLength, fileBytes, now);

  return {
    id: fileId,
    projectId,
    filename: safeFilename,
    mimeType: safeMime,
    size: fileBytes.byteLength,
    url: `/api/projects/${projectId}/context/files/${fileId}`,
  };
}

function getProjectFile(db, projectId, fileId) {
  ensureProjectContextTable(db);
  if (typeof fileId !== "string" || !FILE_ID_REGEX.test(fileId)) {
    return null;
  }
  const row = db.prepare(`
    SELECT id, proyecto_id, nombre_archivo, mime_type, tamano, datos, creado_en
    FROM proyecto_archivos
    WHERE id = ? AND proyecto_id = ?
  `).get(fileId.toLowerCase(), projectId);

  if (!row) return null;
  return {
    id: row.id,
    projectId: row.proyecto_id,
    filename: row.nombre_archivo,
    mimeType: row.mime_type,
    size: row.tamano,
    data: Buffer.from(row.datos),
    createdAt: row.creado_en,
  };
}

module.exports = {
  MAX_CONTEXT_LENGTH,
  MAX_RULES_COUNT,
  MAX_RULE_LENGTH,
  MAX_RESOURCES_COUNT,
  MAX_RESOURCE_TITLE_LENGTH,
  MAX_RESOURCE_URL_LENGTH,
  MAX_FILE_SIZE_BYTES,
  FILE_ID_REGEX,
  ensureProjectContextTable,
  isValidHttpUrl,
  parseProjectFileResourceUrl,
  sanitizeFilename,
  sanitizeMimeType,
  validateContextDocument,
  getProjectContext,
  saveProjectContext,
  saveProjectFile,
  getProjectFile,
};
