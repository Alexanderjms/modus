import type { DatabaseSync } from "node:sqlite";
import {
  MAX_TASK_TITLE_LENGTH,
  MAX_TASK_JSON_BODY_BYTES,
  jsonResponse,
  withNoStore,
  parsePositiveSafeInt,
  isValidColumn,
  getProjectTasks,
  getProjectTaskById,
  moveProjectTask,
  updateProjectTask,
  deleteProjectTask,
  duplicateProjectTask,
  getProjectCatalogs,
  createProjectTask,
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
} from "../../../db/local/tasks.cjs";
import { readLimitedJsonBody } from "../../../db/local/chat.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface TaskTagDto {
  id: number;
  name: string;
  color: string | null;
  description: string | null;
}

export interface TaskSubtaskDto {
  id: number;
  title: string;
  completed: boolean;
}

export interface TaskDto {
  id: number;
  listId: number;
  column: number;
  order: number;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  attachments: string | null;
  priority: string;
  priorityColor: string | null;
  status: string;
  tags: TaskTagDto[];
  subtasks: TaskSubtaskDto[];
}

export interface TaskPriorityCatalogDto {
  id: number;
  name: string;
  color: string | null;
  description: string | null;
}

export interface TaskStatusCatalogDto {
  id: number;
  name: string;
  description: string | null;
}

export interface TaskListCatalogDto {
  column: number;
  listId: number;
  name: string;
  statusName: string;
}

export interface TaskCatalogsDto {
  lists: TaskListCatalogDto[];
  priorities: TaskPriorityCatalogDto[];
  statuses: TaskStatusCatalogDto[];
  tags: TaskTagDto[];
}

export async function GET(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const url = new URL(request.url);
  const rawProjectId = url.searchParams.get("projectId");
  const projectId = parsePositiveSafeInt(rawProjectId);
  if (projectId === null) {
    return jsonResponse({ error: "Parámetro projectId inválido" }, 400);
  }

  const includeCatalogs = url.searchParams.get("catalogs") === "1" || url.searchParams.get("includeCatalogs") === "true";

  let db: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) {
      return withNoStore(dbResult.error);
    }
    db = dbResult.db;

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

    const tasks: TaskDto[] = getProjectTasks(db, projectId);

    if (includeCatalogs) {
      const catalogs = getProjectCatalogs(db, projectId);
      return jsonResponse({
        tasks,
        catalogs,
        priorities: catalogs.priorities,
        statuses: catalogs.statuses,
        tags: catalogs.tags,
        lists: catalogs.lists,
      });
    }

    return jsonResponse({ tasks });
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

export async function POST(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const bodyResult = await readLimitedJsonBody(request, MAX_TASK_JSON_BODY_BYTES);
  if (bodyResult.error) return withNoStore(bodyResult.error);

  const body = bodyResult.data;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "El cuerpo debe ser un objeto JSON" }, 400);
  }

  const { projectId: rawProjectId, column, title, duplicateTaskId: rawDuplicateTaskId } = body as Record<string, unknown>;

  const projectId = parsePositiveSafeInt(rawProjectId);
  if (projectId === null) {
    return jsonResponse({ error: "projectId inválido" }, 400);
  }

  const duplicateTaskId = rawDuplicateTaskId !== undefined ? parsePositiveSafeInt(rawDuplicateTaskId) : null;
  if (rawDuplicateTaskId !== undefined && duplicateTaskId === null) {
    return jsonResponse({ error: "duplicateTaskId inválido" }, 400);
  }

  if (duplicateTaskId !== null) {
    let db: DatabaseSync | null = null;
    try {
      const dbResult = openProjectDatabase();
      if ("error" in dbResult && dbResult.error) {
        return withNoStore(dbResult.error);
      }
      db = dbResult.db;

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

      const task = duplicateProjectTask(db, { projectId, taskId: duplicateTaskId });
      if (!task) {
        return jsonResponse({ error: "Tarea no encontrada en este proyecto" }, 404);
      }

      const tasks = getProjectTasks(db, projectId);
      return jsonResponse({ task, tasks }, 201);
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

  if (typeof column !== "number" || !isValidColumn(column)) {
    return jsonResponse({ error: "column inválida (debe ser 0, 1 o 2)" }, 400);
  }

  if (typeof title !== "string") {
    return jsonResponse({ error: "title debe ser una cadena de texto" }, 400);
  }

  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return jsonResponse({ error: "title no puede estar vacío" }, 400);
  }

  if (trimmedTitle.length > MAX_TASK_TITLE_LENGTH) {
    return jsonResponse(
      { error: `title no puede superar ${MAX_TASK_TITLE_LENGTH} caracteres` },
      400
    );
  }

  let db: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) {
      return withNoStore(dbResult.error);
    }
    db = dbResult.db;

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

    const task: TaskDto = createProjectTask(db, {
      projectId,
      column,
      title: trimmedTitle,
    });

    return jsonResponse({ task }, 201);
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

export async function PATCH(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const bodyResult = await readLimitedJsonBody(request, MAX_TASK_JSON_BODY_BYTES);
  if (bodyResult.error) return withNoStore(bodyResult.error);

  const body = bodyResult.data;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "El cuerpo debe ser un objeto JSON" }, 400);
  }

  const b = body as Record<string, unknown>;
  const projectId = parsePositiveSafeInt(b.projectId);
  if (projectId === null) {
    return jsonResponse({ error: "projectId inválido" }, 400);
  }

  const taskId = parsePositiveSafeInt(b.taskId);
  if (taskId === null) {
    return jsonResponse({ error: "taskId inválido" }, 400);
  }

  // Comprobar si es operación de reordenamiento/movimiento
  const hasColumn = b.column !== undefined;
  const hasBeforeTaskId = b.beforeTaskId !== undefined;
  const isReorderOperation = hasColumn || hasBeforeTaskId;

  if (isReorderOperation && ["title", "description", "startDate", "endDate", "attachments", "priorityId", "statusId", "tags", "subtasks"].some((key) => b[key] !== undefined)) {
    return jsonResponse({ error: "Envía el movimiento y la edición de detalles en solicitudes separadas" }, 400);
  }

  let db: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) {
      return withNoStore(dbResult.error);
    }
    db = dbResult.db;

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

    if (isReorderOperation) {
      // Reordenar / Mover
      if (typeof b.column !== "number" || !isValidColumn(b.column)) {
        return jsonResponse({ error: "column inválida (debe ser 0, 1 o 2)" }, 400);
      }

      let beforeTaskId: number | null = null;
      if (b.beforeTaskId !== undefined && b.beforeTaskId !== null) {
        beforeTaskId = parsePositiveSafeInt(b.beforeTaskId);
        if (beforeTaskId === null) {
          return jsonResponse({ error: "beforeTaskId inválido" }, 400);
        }
      }

      try {
        const task = moveProjectTask(db, {
          projectId,
          taskId,
          column: b.column,
          beforeTaskId,
        });

        if (!task) {
          return jsonResponse({ error: "Tarea no encontrada en este proyecto" }, 404);
        }

        const tasks = getProjectTasks(db, projectId);
        return jsonResponse({ task, tasks }, 200);
      } catch (moveErr: unknown) {
        const err = moveErr as { code?: string; message?: string };
        if (err.code === "TARGET_TASK_NOT_FOUND" || err.code === "TARGET_COLUMN_MISMATCH") {
          return jsonResponse({ error: err.message || "Destino inválido para reordenamiento" }, 400);
        }
        throw moveErr;
      }
    }

    // Edición de campos y relaciones
    const editPayload: Record<string, unknown> = { projectId, taskId };

    if (b.title !== undefined) {
      if (typeof b.title !== "string" || !b.title.trim()) {
        return jsonResponse({ error: "title no puede estar vacío" }, 400);
      }
      const trimmedTitle = b.title.trim();
      if (trimmedTitle.length > MAX_TASK_TITLE_LENGTH) {
        return jsonResponse({ error: `title no puede superar ${MAX_TASK_TITLE_LENGTH} caracteres` }, 400);
      }
      editPayload.title = trimmedTitle;
    }

    if (b.description !== undefined) {
      if (b.description !== null && typeof b.description !== "string") {
        return jsonResponse({ error: "description debe ser texto o null" }, 400);
      }
      editPayload.description = b.description !== null ? (b.description as string).trim() || null : null;
    }

    if (b.startDate !== undefined) {
      if (b.startDate !== null && typeof b.startDate !== "string") {
        return jsonResponse({ error: "startDate debe ser texto o null" }, 400);
      }
      editPayload.startDate = b.startDate !== null ? (b.startDate as string).trim() || null : null;
    }

    if (b.endDate !== undefined) {
      if (b.endDate !== null && typeof b.endDate !== "string") {
        return jsonResponse({ error: "endDate debe ser texto o null" }, 400);
      }
      editPayload.endDate = b.endDate !== null ? (b.endDate as string).trim() || null : null;
    }

    if (b.attachments !== undefined) {
      if (b.attachments !== null && typeof b.attachments !== "string") {
        return jsonResponse({ error: "attachments debe ser texto o null" }, 400);
      }
      editPayload.attachments = b.attachments !== null ? (b.attachments as string).trim() || null : null;
    }

    if (b.priorityId !== undefined) {
      if (b.priorityId !== null) {
        const pid = parsePositiveSafeInt(b.priorityId);
        if (pid === null) return jsonResponse({ error: "priorityId inválido" }, 400);
        editPayload.priorityId = pid;
      } else {
        editPayload.priorityId = null;
      }
    }

    if (b.statusId !== undefined) {
      if (b.statusId !== null) {
        const sid = parsePositiveSafeInt(b.statusId);
        if (sid === null) return jsonResponse({ error: "statusId inválido" }, 400);
        editPayload.statusId = sid;
      } else {
        editPayload.statusId = null;
      }
    }

    if (b.tags !== undefined) {
      if (!Array.isArray(b.tags)) {
        return jsonResponse({ error: "tags debe ser un array" }, 400);
      }
      editPayload.tags = b.tags;
    }

    if (b.subtasks !== undefined) {
      if (!Array.isArray(b.subtasks)) {
        return jsonResponse({ error: "subtasks debe ser un array" }, 400);
      }
      for (const st of b.subtasks) {
        if (!st || typeof st !== "object" || Array.isArray(st)) {
          return jsonResponse({ error: "Cada subtarea debe ser un objeto" }, 400);
        }
        const record = st as Record<string, unknown>;
        if (record.description !== undefined) {
          return jsonResponse({ error: "El campo 'description' en subtareas ya no está soportado" }, 400);
        }
        if (record.status !== undefined || record.statusId !== undefined) {
          return jsonResponse({ error: "El campo 'status'/'statusId' en subtareas ya no está soportado" }, 400);
        }
        if (record.completed !== undefined && typeof record.completed !== "boolean") {
          return jsonResponse({ error: "El campo 'completed' en subtarea debe ser un booleano" }, 400);
        }
      }
      editPayload.subtasks = b.subtasks;
    }

    try {
      const task = updateProjectTask(db, editPayload as Parameters<typeof updateProjectTask>[1]);
      if (!task) {
        return jsonResponse({ error: "Tarea no encontrada en este proyecto" }, 404);
      }
      const tasks = getProjectTasks(db, projectId);
      return jsonResponse({ task, tasks }, 200);
    } catch (updErr: unknown) {
      const err = updErr as { code?: string; message?: string };
      if (
        err.code === "INVALID_TITLE" ||
        err.code === "INVALID_DESCRIPTION" ||
        err.code === "INVALID_ATTACHMENTS" ||
        err.code === "INVALID_DATE_FORMAT" ||
        err.code === "INVALID_DATE_RANGE" ||
        err.code === "INVALID_PRIORITY_ID" ||
        err.code === "INVALID_STATUS_ID" ||
        err.code === "INVALID_TAGS" ||
        err.code === "INVALID_TAG_ID" ||
        err.code === "TAG_NOT_FOUND" ||
        err.code === "INVALID_TAG_NAME" ||
        err.code === "INVALID_TAG_COLOR" ||
        err.code === "INVALID_TAG_FORMAT" ||
        err.code === "INVALID_SUBTASKS" ||
        err.code === "INVALID_SUBTASK_FORMAT" ||
        err.code === "INVALID_SUBTASK_ID" ||
        err.code === "SUBTASK_NOT_FOUND" ||
        err.code === "DUPLICATE_SUBTASK_ID" ||
        err.code === "INVALID_SUBTASK_TITLE" ||
        err.code === "INVALID_SUBTASK_FIELD" ||
        err.code === "INVALID_SUBTASK_COMPLETED" ||
        err.code === "INVALID_SUBTASK_DESCRIPTION" ||
        err.code === "INVALID_SUBTASK_STATUS"
      ) {
        return jsonResponse({ error: err.message || "Datos de tarea inválidos" }, 400);
      }
      throw updErr;
    }
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

export async function DELETE(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const bodyResult = await readLimitedJsonBody(request, MAX_TASK_JSON_BODY_BYTES);
  if (bodyResult.error) return withNoStore(bodyResult.error);

  const body = bodyResult.data;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "El cuerpo debe ser un objeto JSON" }, 400);
  }

  const { projectId: rawProjectId, taskId: rawTaskId } = body as Record<string, unknown>;

  const projectId = parsePositiveSafeInt(rawProjectId);
  if (projectId === null) {
    return jsonResponse({ error: "projectId inválido" }, 400);
  }

  const taskId = parsePositiveSafeInt(rawTaskId);
  if (taskId === null) {
    return jsonResponse({ error: "taskId inválido" }, 400);
  }

  let db: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) {
      return withNoStore(dbResult.error);
    }
    db = dbResult.db;

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

    const deleted = deleteProjectTask(db, { projectId, taskId });
    if (!deleted) {
      return jsonResponse({ error: "Tarea no encontrada en este proyecto" }, 404);
    }

    const tasks = getProjectTasks(db, projectId);
    return jsonResponse({ id: taskId, tasks }, 200);
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
