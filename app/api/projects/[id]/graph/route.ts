import type { DatabaseSync } from "node:sqlite";
import {
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
  parseProjectId,
} from "../../../../../db/local/projects.cjs";
import { jsonResponse, withNoStore } from "../../../../../db/local/tasks.cjs";
import { getProjectGraph } from "../../../../../db/local/project-graph.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const { id: rawId } = await props.params;
  const projectId = parseProjectId(rawId);
  if (projectId === null) {
    return jsonResponse({ error: "Identificador de proyecto inválido" }, 400);
  }

  let db: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) {
      return withNoStore(dbResult.error);
    }
    db = dbResult.db as DatabaseSync;

    const user = resolveUser(db);
    if (user instanceof Response) {
      return withNoStore(user);
    }

    const project = db
      .prepare("SELECT id FROM proyectos WHERE id = ? AND usuario_id = ?")
      .get(projectId, user.id);

    if (!project) {
      return jsonResponse({ error: "Proyecto no encontrado o no pertenece a tu perfil" }, 404);
    }

    const graph = getProjectGraph(db, projectId);
    if (!graph) {
      return jsonResponse({ error: "No se pudo generar el grafo del proyecto" }, 500);
    }

    return jsonResponse(graph, 200);
  } catch {
    return jsonResponse({ error: "Error interno del servidor" }, 500);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}
