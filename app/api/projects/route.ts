import * as fs from "node:fs";
import { getDatabase, getDefaultDbPath } from "../../../db/local/db.cjs";
import type { Project } from "../../components/projects-data";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8192;
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 5000;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const ICON_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_STATUSES = new Set(["active", "completed", "archived"]);

function isLoopbackHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  try {
    const parsed = new URL(`http://${hostHeader}`);
    return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase()) && parsed.host === hostHeader.toLowerCase();
  } catch {
    return false;
  }
}

function isAllowedOrigin(originHeader: string | null, request: Request): boolean {
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

function validateLoopbackSecurity(request: Request): Response | null {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  const secFetchSite = request.headers.get("sec-fetch-site");

  if (!isLoopbackHost(host) || !isAllowedOrigin(origin, request) || secFetchSite === "cross-site") {
    return Response.json({ error: "Origen no permitido" }, { status: 403 });
  }
  return null;
}

function parseOptionalString(val: unknown, maxLen?: number): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val !== "string") throw new Error("Debe ser una cadena de texto");
  const trimmed = val.trim();
  if (trimmed === "") return null;
  if (maxLen && trimmed.length > maxLen) {
    throw new Error(`Excede longitud máxima permitida de ${maxLen}`);
  }
  return trimmed;
}

interface ProjectDbRow {
  id: number;
  nombre: string;
  descripcion: string | null;
  icono: string;
  estado: string | null;
  total_tareas?: number;
  done_tareas?: number;
  doing_tareas?: number;
}

function rowToProject(row: ProjectDbRow): Project {
  const total = Number(row.total_tareas ?? 0);
  const done = Number(row.done_tareas ?? 0);
  const doing = Number(row.doing_tareas ?? 0);
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const tasks = `${done} de ${total} tareas`;

  let status: "active" | "completed" | "archived" = "active";
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

function resolveUser(db: { prepare: (sql: string) => { all: () => unknown[]; get: () => unknown } }): { id: number } | Response {
  let users: Array<{ id: number }>;
  try {
    users = db.prepare("SELECT id FROM usuarios LIMIT 2").all() as Array<{ id: number }>;
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

export async function GET(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;

  const dbPath = process.env.MODUS_SQLITE_PATH || getDefaultDbPath();
  if (dbPath !== ":memory:" && !fs.existsSync(dbPath)) {
    return Response.json({ error: "Configura primero tu perfil local." }, { status: 409 });
  }

  let db;
  try {
    db = getDatabase();
  } catch {
    return Response.json({ error: "Configura primero tu perfil local." }, { status: 409 });
  }

  try {
    const userRes = resolveUser(db);
    if (userRes instanceof Response) return userRes;
    const userId = userRes.id;

    const query = `
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
      WHERE p.usuario_id = ?
      GROUP BY p.id
      ORDER BY p.id DESC
    `;

    const rows = db.prepare(query).all(userId) as unknown as ProjectDbRow[];
    const projects = rows.map(rowToProject);

    return Response.json({ projects }, { status: 200 });
  } catch {
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  } finally {
    try {
      db.close();
    } catch {}
  }
}

export async function POST(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;

  const contentType = request.headers.get("content-type") || "";
  if (contentType.split(";")[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: "Content-Type debe ser application/json" }, { status: 400 });
  }

  let rawBodyText: string;
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > MAX_BODY_BYTES) {
            await reader.cancel();
            return Response.json({ error: "El cuerpo de la solicitud excede el tamaño permitido" }, { status: 400 });
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    rawBodyText = Buffer.concat(chunks).toString("utf8");
  } catch {
    return Response.json({ error: "Error leyendo la solicitud" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBodyText);
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "El cuerpo debe ser un objeto JSON" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const { nombre, icono, descripcion, estado } = record;

  if (typeof nombre !== "string") {
    return Response.json({ error: "El nombre es obligatorio y debe ser una cadena de texto" }, { status: 400 });
  }
  const trimmedName = nombre.trim();
  if (!trimmedName) {
    return Response.json({ error: "El nombre no puede estar vacío" }, { status: 400 });
  }
  if (trimmedName.length > MAX_NAME_LENGTH) {
    return Response.json({ error: `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres` }, { status: 400 });
  }

  if (typeof icono !== "string") {
    return Response.json({ error: "El icono es obligatorio y debe ser una cadena de texto" }, { status: 400 });
  }
  const trimmedIcono = icono.trim();
  if (!trimmedIcono || trimmedIcono.length > 50 || !ICON_REGEX.test(trimmedIcono)) {
    return Response.json({ error: "Icono inválido" }, { status: 400 });
  }

  let parsedDescripcion: string | null = null;
  try {
    parsedDescripcion = parseOptionalString(descripcion, MAX_DESCRIPTION_LENGTH);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }

  let parsedEstado: string | null = null;
  if (estado !== undefined && estado !== null) {
    if (typeof estado !== "string" || !ALLOWED_STATUSES.has(estado)) {
      return Response.json({ error: "Estado inválido" }, { status: 400 });
    }
    parsedEstado = estado;
  }

  const dbPath = process.env.MODUS_SQLITE_PATH || getDefaultDbPath();
  if (dbPath !== ":memory:" && !fs.existsSync(dbPath)) {
    return Response.json({ error: "Configura primero tu perfil local." }, { status: 409 });
  }

  let db;
  try {
    db = getDatabase();
  } catch {
    return Response.json({ error: "Configura primero tu perfil local." }, { status: 409 });
  }

  try {
    const userRes = resolveUser(db);
    if (userRes instanceof Response) return userRes;
    const userId = userRes.id;

    const stmt = db.prepare(`
      INSERT INTO proyectos (usuario_id, nombre, descripcion, icono, estado)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      userId,
      trimmedName,
      parsedDescripcion,
      trimmedIcono,
      parsedEstado,
    );

    const insertedId = Number(result.lastInsertRowid);

    const project: Project = {
      id: insertedId,
      name: trimmedName,
      description: parsedDescripcion ?? "",
      icon: trimmedIcono,
      progress: 0,
      tasks: "0 de 0 tareas",
      doing: 0,
      activity: "sin actividad",
      age: Number.MAX_SAFE_INTEGER,
      status: (parsedEstado as "active" | "completed" | "archived" | null) ?? "active",
    };

    return Response.json({ project }, { status: 201 });
  } catch {
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  } finally {
    try {
      db.close();
    } catch {}
  }
}
