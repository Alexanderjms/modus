import type { Project } from "../../../../components/projects-data";
import {
  validateLoopbackSecurity,
  parseProjectId,
  resolveUser,
  openProjectDatabase,
  truncateForDuplicate,
} from "../../../../../db/local/projects.cjs";

export const runtime = "nodejs";

export async function POST(
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
      const source = db
        .prepare("SELECT nombre, descripcion, icono, estado FROM proyectos WHERE id = ? AND usuario_id = ?")
        .get(projectId, userId) as
        | { nombre: string; descripcion: string | null; icono: string; estado: string | null }
        | undefined;

      if (!source) {
        db.exec("ROLLBACK;");
        inTransaction = false;
        return Response.json({ error: "Proyecto no encontrado" }, { status: 404 });
      }

      const duplicateName = truncateForDuplicate(source.nombre);

      const insertStmt = db.prepare(`
        INSERT INTO proyectos (usuario_id, nombre, descripcion, icono, estado)
        VALUES (?, ?, ?, ?, ?)
      `);

      const result = insertStmt.run(
        userId,
        duplicateName,
        source.descripcion,
        source.icono,
        source.estado,
      );

      const insertedId = Number(result.lastInsertRowid);
      db.exec("COMMIT;");
      inTransaction = false;

      const project: Project = {
        id: insertedId,
        name: duplicateName,
        description: source.descripcion ?? "",
        icon: source.icono,
        progress: 0,
        tasks: "0 de 0 tareas",
        doing: 0,
        activity: "sin actividad",
        age: Number.MAX_SAFE_INTEGER,
        status: (source.estado as "active" | "completed" | "archived" | null) ?? "active",
      };

      return Response.json({ project }, { status: 201 });
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
