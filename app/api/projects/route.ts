import type { Project } from "../../components/projects-data";
import {
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  ICON_REGEX,
  ALLOWED_STATUSES,
  validateLoopbackSecurity,
  readJsonBody,
  parseOptionalString,
  rowToProject,
  resolveUser,
  openProjectDatabase,
} from "../../../db/local/projects.cjs";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;

  const dbResult = openProjectDatabase();
  if ("error" in dbResult) return dbResult.error;
  const { db } = dbResult;

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

    const rows = db.prepare(query).all(userId);
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

  const bodyResult = await readJsonBody(request);
  if ("error" in bodyResult) return bodyResult.error;

  const record = bodyResult.data as Record<string, unknown>;
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

  const dbResult = openProjectDatabase();
  if ("error" in dbResult) return dbResult.error;
  const { db } = dbResult;

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
