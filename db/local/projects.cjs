const fs = require("node:fs");
const path = require("node:path");
const { getDatabase, getDefaultDbPath } = require("./db.cjs");

const MAX_BODY_BYTES = 8192;
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 5000;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const ICON_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_STATUSES = new Set(["active", "completed", "archived"]);

function isLoopbackHost(hostHeader) {
  if (!hostHeader) return false;
  try {
    const parsed = new URL(`http://${hostHeader}`);
    return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase()) && parsed.host === hostHeader.toLowerCase();
  } catch {
    return false;
  }
}

function isAllowedOrigin(originHeader, request) {
  if (!originHeader) return true;
  try {
    const parsed = new URL(originHeader);
    const expected = new URL(request.url);
    const hostHeader = request.headers.get("host");
    if (hostHeader) {
      expected.host = hostHeader;
    }
    return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase()) && parsed.origin === expected.origin;
  } catch {
    return false;
  }
}

function validateLoopbackSecurity(request) {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  const secFetchSite = request.headers.get("sec-fetch-site");

  if (!isLoopbackHost(host) || !isAllowedOrigin(origin, request) || secFetchSite === "cross-site") {
    return Response.json({ error: "Origen no permitido" }, { status: 403 });
  }
  return null;
}

async function readJsonBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.split(";")[0].trim().toLowerCase() !== "application/json") {
    return { error: Response.json({ error: "Content-Type debe ser application/json" }, { status: 400 }) };
  }

  let rawBodyText;
  try {
    const reader = request.body?.getReader();
    const chunks = [];
    let totalBytes = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > MAX_BODY_BYTES) {
            await reader.cancel();
            return {
              error: Response.json({ error: "El cuerpo de la solicitud excede el tamaño permitido" }, { status: 400 }),
            };
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    rawBodyText = Buffer.concat(chunks).toString("utf8");
  } catch {
    return { error: Response.json({ error: "Error leyendo la solicitud" }, { status: 400 }) };
  }

  try {
    const body = JSON.parse(rawBodyText);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return { error: Response.json({ error: "El cuerpo debe ser un objeto JSON" }, { status: 400 }) };
    }
    return { data: body };
  } catch {
    return { error: Response.json({ error: "JSON inválido" }, { status: 400 }) };
  }
}

function parseOptionalString(val, maxLen) {
  if (val === undefined || val === null) return null;
  if (typeof val !== "string") throw new Error("Debe ser una cadena de texto");
  const trimmed = val.trim();
  if (trimmed === "") return null;
  if (maxLen && trimmed.length > maxLen) {
    throw new Error(`Excede longitud máxima permitida de ${maxLen}`);
  }
  return trimmed;
}

function rowToProject(row) {
  const total = Number(row.total_tareas ?? 0);
  const done = Number(row.done_tareas ?? 0);
  const doing = Number(row.doing_tareas ?? 0);
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const tasks = `${done} de ${total} tareas`;

  let status = "active";
  if (row.estado === "completed" || row.estado === "archived" || row.estado === "active") {
    status = row.estado;
  }

  return {
    id: Number(row.id),
    name: row.nombre,
    description: row.descripcion ?? "",
    icon: row.icono,
    progress,
    tasks,
    doing,
    activity: "sin actividad",
    age: Number.MAX_SAFE_INTEGER,
    status,
  };
}

function parseProjectId(rawId) {
  if (typeof rawId !== "string" || !/^\d+$/.test(rawId)) {
    return null;
  }
  const num = Number(rawId);
  if (!Number.isSafeInteger(num) || num <= 0) {
    return null;
  }
  return num;
}

function resolveUser(db) {
  let users;
  try {
    users = db.prepare("SELECT id FROM usuarios LIMIT 2").all();
  } catch {
    return Response.json({ error: "Configura primero tu perfil local." }, { status: 409 });
  }

  if (users.length === 0) {
    return Response.json({ error: "Configura primero tu perfil local." }, { status: 409 });
  }

  if (users.length > 1) {
    return Response.json({ error: "Múltiples perfiles locales detectados." }, { status: 409 });
  }

  return { id: users[0].id };
}

function openProjectDatabase() {
  const dbPath = process.env.MODUS_SQLITE_PATH || getDefaultDbPath();
  if (dbPath !== ":memory:" && !fs.existsSync(dbPath)) {
    return { error: Response.json({ error: "Configura primero tu perfil local." }, { status: 409 }) };
  }

  try {
    const db = getDatabase();
    const tagColumns = db.prepare("SELECT name FROM pragma_table_info('etiquetas')").all();
    if (tagColumns.length && !tagColumns.some(({ name }) => name === "proyecto_id")) {
      try {
        require("./migrate.cjs").applySchema(db);
      } catch {
        db.close();
        return { error: Response.json({ error: "No se pudo actualizar el esquema local de etiquetas. Tus datos no se han modificado." }, { status: 500 }) };
      }
    }
    return { db };
  } catch {
    return { error: Response.json({ error: "Configura primero tu perfil local." }, { status: 409 }) };
  }
}

const PROJECT_METRICS_QUERY = `
  SELECT 
    p.id,
    p.nombre,
    p.descripcion,
    p.icono,
    p.estado,
    COUNT(t.id) AS total_tareas,
    SUM(CASE WHEN e.nombre = 'Completada' THEN 1 ELSE 0 END) AS done_tareas,
    SUM(CASE WHEN e.nombre = 'En curso' THEN 1 ELSE 0 END) AS doing_tareas
  FROM proyectos p
  LEFT JOIN listas_tareas lt ON lt.proyecto_id = p.id
  LEFT JOIN tareas t ON t.lista_id = lt.id
  LEFT JOIN estados e ON e.id = t.estado_id
  WHERE p.id = ? AND p.usuario_id = ?
  GROUP BY p.id
`;

function getProjectWithMetrics(db, projectId, userId) {
  const row = db.prepare(PROJECT_METRICS_QUERY).get(projectId, userId);
  return row ? rowToProject(row) : null;
}

function truncateForDuplicate(baseName) {
  const suffix = " (copia)";
  const maxBaseLen = MAX_NAME_LENGTH - suffix.length;
  const trimmed = baseName.slice(0, maxBaseLen);
  return `${trimmed}${suffix}`;
}

module.exports = {
  MAX_BODY_BYTES,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  ICON_REGEX,
  ALLOWED_STATUSES,
  validateLoopbackSecurity,
  readJsonBody,
  parseOptionalString,
  rowToProject,
  parseProjectId,
  resolveUser,
  openProjectDatabase,
  PROJECT_METRICS_QUERY,
  getProjectWithMetrics,
  truncateForDuplicate,
};
