import type { DatabaseSync } from "node:sqlite";
import {
  jsonResponse,
  withNoStore,
  parsePositiveSafeInt,
  isValidHexColor,
  getProjectTasks,
  getProjectCatalogs,
  updateProjectTag,
  deleteProjectTag,
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
} from "../../../../../../db/local/tasks.cjs";
import { readJsonBody } from "../../../../../../db/local/projects.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PATCH_FIELDS = new Set(["name", "color"]);

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string; tagId: string }> }
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const { id: rawId, tagId: rawTagId } = await props.params;
  const projectId = parsePositiveSafeInt(rawId);
  const tagId = parsePositiveSafeInt(rawTagId);

  if (projectId === null) {
    return jsonResponse({ error: "Identificador de proyecto inválido" }, 400);
  }
  if (tagId === null) {
    return jsonResponse({ error: "Identificador de etiqueta inválido" }, 400);
  }

  const bodyResult = await readJsonBody(request);
  if ("error" in bodyResult && bodyResult.error) {
    return withNoStore(bodyResult.error);
  }

  const record = bodyResult.data as Record<string, unknown>;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return jsonResponse({ error: "El cuerpo debe ser un objeto JSON válido" }, 400);
  }

  const keys = Object.keys(record);
  if (keys.length === 0) {
    return jsonResponse({ error: "El cuerpo no puede estar vacío" }, 400);
  }

  for (const k of keys) {
    if (!ALLOWED_PATCH_FIELDS.has(k)) {
      return jsonResponse({ error: `Campo no permitido: ${k}` }, 400);
    }
  }

  if (typeof record.name !== "string") {
    return jsonResponse({ error: "El nombre de la etiqueta es obligatorio y debe ser texto" }, 400);
  }
  const trimmedName = record.name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 80) {
    return jsonResponse({ error: "El nombre de la etiqueta debe tener entre 1 y 80 caracteres" }, 400);
  }

  if (typeof record.color !== "string" || !isValidHexColor(record.color)) {
    return jsonResponse({ error: "Color de etiqueta inválido (debe ser formato HEX #RRGGBB)" }, 400);
  }

  let db: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) {
      return withNoStore(dbResult.error);
    }
    const currentDb = (dbResult as { db: DatabaseSync }).db;
    db = currentDb;

    const user = resolveUser(currentDb);
    if (user instanceof Response) {
      return withNoStore(user);
    }

    const project = currentDb
      .prepare("SELECT id FROM proyectos WHERE id = ? AND usuario_id = ?")
      .get(projectId, user.id);

    if (!project) {
      return jsonResponse({ error: "Proyecto no encontrado" }, 404);
    }

    const updatedTag = updateProjectTag(currentDb, {
      projectId,
      tagId,
      name: trimmedName,
      color: record.color,
    });

    if (!updatedTag) {
      return jsonResponse({ error: "Etiqueta no encontrada en este proyecto" }, 404);
    }

    const tasks = getProjectTasks(currentDb, projectId);
    const catalogs = getProjectCatalogs(currentDb, projectId);

    return jsonResponse({
      tag: updatedTag,
      tasks,
      catalogs,
    });
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    if (error.code === "TAG_NAME_CONFLICT") {
      return jsonResponse({ error: error.message || "Conflicto de nombre de etiqueta" }, 409);
    }
    if (error.code === "INVALID_TAG_NAME" || error.code === "INVALID_TAG_COLOR") {
      return jsonResponse({ error: error.message || "Datos de etiqueta inválidos" }, 400);
    }
    return jsonResponse({ error: "Error interno del servidor" }, 500);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string; tagId: string }> }
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const { id: rawId, tagId: rawTagId } = await props.params;
  const projectId = parsePositiveSafeInt(rawId);
  const tagId = parsePositiveSafeInt(rawTagId);

  if (projectId === null) {
    return jsonResponse({ error: "Identificador de proyecto inválido" }, 400);
  }
  if (tagId === null) {
    return jsonResponse({ error: "Identificador de etiqueta inválido" }, 400);
  }

  let db: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) {
      return withNoStore(dbResult.error);
    }
    const currentDb = (dbResult as { db: DatabaseSync }).db;
    db = currentDb;

    const user = resolveUser(currentDb);
    if (user instanceof Response) {
      return withNoStore(user);
    }

    const project = currentDb
      .prepare("SELECT id FROM proyectos WHERE id = ? AND usuario_id = ?")
      .get(projectId, user.id);

    if (!project) {
      return jsonResponse({ error: "Proyecto no encontrado" }, 404);
    }

    const deleted = deleteProjectTag(currentDb, { projectId, tagId });
    if (!deleted) {
      return jsonResponse({ error: "Etiqueta no encontrada en este proyecto" }, 404);
    }

    const tasks = getProjectTasks(currentDb, projectId);
    const catalogs = getProjectCatalogs(currentDb, projectId);

    return jsonResponse({
      tasks,
      catalogs,
    });
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
