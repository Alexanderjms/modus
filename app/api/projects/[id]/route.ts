import type { SQLInputValue } from "node:sqlite";
import {
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  ICON_REGEX,
  ALLOWED_STATUSES,
  validateLoopbackSecurity,
  readJsonBody,
  parseOptionalString,
  parseProjectId,
  resolveUser,
  openProjectDatabase,
  getProjectWithMetrics,
} from "../../../../db/local/projects.cjs";

export const runtime = "nodejs";

const ALLOWED_PATCH_FIELDS = new Set(["nombre", "descripcion", "icono", "estado"]);

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;

  const { id: rawId } = await props.params;
  const projectId = parseProjectId(rawId);
  if (projectId === null) {
    return Response.json({ error: "Identificador de proyecto inválido" }, { status: 400 });
  }

  const bodyResult = await readJsonBody(request);
  if ("error" in bodyResult) return bodyResult.error;

  const record = bodyResult.data as Record<string, unknown>;
  const keys = Object.keys(record);

  if (keys.length === 0) {
    return Response.json({ error: "El cuerpo no puede estar vacío" }, { status: 400 });
  }

  for (const key of keys) {
    if (!ALLOWED_PATCH_FIELDS.has(key)) {
      return Response.json({ error: `Campo no permitido: ${key}` }, { status: 400 });
    }
  }

  const setClauses: string[] = [];
  const setValues: SQLInputValue[] = [];

  if ("nombre" in record) {
    const { nombre } = record;
    if (typeof nombre !== "string") {
      return Response.json({ error: "El nombre debe ser una cadena de texto" }, { status: 400 });
    }
    const trimmedName = nombre.trim();
    if (!trimmedName) {
      return Response.json({ error: "El nombre no puede estar vacío" }, { status: 400 });
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
      return Response.json({ error: `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres` }, { status: 400 });
    }
    setClauses.push("nombre = ?");
    setValues.push(trimmedName);
  }

  if ("icono" in record) {
    const { icono } = record;
    if (typeof icono !== "string") {
      return Response.json({ error: "El icono debe ser una cadena de texto" }, { status: 400 });
    }
    const trimmedIcono = icono.trim();
    if (!trimmedIcono || trimmedIcono.length > 50 || !ICON_REGEX.test(trimmedIcono)) {
      return Response.json({ error: "Icono inválido" }, { status: 400 });
    }
    setClauses.push("icono = ?");
    setValues.push(trimmedIcono);
  }

  if ("descripcion" in record) {
    try {
      const parsedDescripcion = parseOptionalString(record.descripcion, MAX_DESCRIPTION_LENGTH);
      setClauses.push("descripcion = ?");
      setValues.push(parsedDescripcion);
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  if ("estado" in record) {
    const { estado } = record;
    if (estado !== null && (typeof estado !== "string" || !ALLOWED_STATUSES.has(estado))) {
      return Response.json({ error: "Estado inválido" }, { status: 400 });
    }
    setClauses.push("estado = ?");
    setValues.push(estado as string | null);
  }

  const dbResult = openProjectDatabase();
  if ("error" in dbResult) return dbResult.error;
  const { db } = dbResult;

  try {
    const userRes = resolveUser(db);
    if (userRes instanceof Response) return userRes;
    const userId = userRes.id;

    db.exec("BEGIN IMMEDIATE;");
    let inTransaction = true;

    try {
      const existing = db.prepare("SELECT id FROM proyectos WHERE id = ? AND usuario_id = ?").get(projectId, userId);
      if (!existing) {
        db.exec("ROLLBACK;");
        inTransaction = false;
        return Response.json({ error: "Proyecto no encontrado" }, { status: 404 });
      }

      setValues.push(projectId, userId);
      const updateSql = `UPDATE proyectos SET ${setClauses.join(", ")} WHERE id = ? AND usuario_id = ?`;
      db.prepare(updateSql).run(...setValues);

      const project = getProjectWithMetrics(db, projectId, userId);
      db.exec("COMMIT;");
      inTransaction = false;

      return Response.json({ project }, { status: 200 });
    } catch (err) {
      if (inTransaction) {
        try {
          db.exec("ROLLBACK;");
        } catch {}
      }
      throw err;
    }
  } catch {
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  } finally {
    try {
      db.close();
    } catch {}
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;

  const { id: rawId } = await props.params;
  const projectId = parseProjectId(rawId);
  if (projectId === null) {
    return Response.json({ error: "Identificador de proyecto inválido" }, { status: 400 });
  }

  const dbResult = openProjectDatabase();
  if ("error" in dbResult) return dbResult.error;
  const { db } = dbResult;

  try {
    const userRes = resolveUser(db);
    if (userRes instanceof Response) return userRes;
    const userId = userRes.id;

    db.exec("BEGIN IMMEDIATE;");
    let inTransaction = true;

    try {
      const existing = db.prepare("SELECT id FROM proyectos WHERE id = ? AND usuario_id = ?").get(projectId, userId);
      if (!existing) {
        db.exec("ROLLBACK;");
        inTransaction = false;
        return Response.json({ error: "Proyecto no encontrado" }, { status: 404 });
      }

      db.prepare(`
        DELETE FROM tareas
        WHERE lista_id IN (SELECT id FROM listas_tareas WHERE proyecto_id = ?)
      `).run(projectId);

      db.prepare("DELETE FROM listas_tareas WHERE proyecto_id = ?").run(projectId);
      db.prepare("DELETE FROM proyectos WHERE id = ? AND usuario_id = ?").run(projectId, userId);

      db.exec("COMMIT;");
      inTransaction = false;

      return new Response(null, { status: 204 });
    } catch (err) {
      if (inTransaction) {
        try {
          db.exec("ROLLBACK;");
        } catch {}
      }
      throw err;
    }
  } catch {
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  } finally {
    try {
      db.close();
    } catch {}
  }
}
