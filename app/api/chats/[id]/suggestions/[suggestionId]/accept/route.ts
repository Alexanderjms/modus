import type { DatabaseSync } from "node:sqlite";
import {
  jsonResponse,
  withNoStore,
  parsePositiveSafeInt,
  rowToChatConversation,
} from "../../../../../../../db/local/conversations.cjs";
import {
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
  readLimitedJsonBody,
} from "../../../../../../../db/local/chat.cjs";
import {
  ensureSuggestionTasksTable,
  validateSuggestionAcceptReview,
  isValidUuid,
} from "../../../../../../../db/local/task-suggestions.cjs";
import {
  createProjectTask,
  updateProjectTask,
  moveProjectTask,
  getProjectTaskById,
} from "../../../../../../../db/local/tasks.cjs";
import type { TaskDto } from "../../../../../tasks/route";
import type { ChatConversation, TaskSuggestion } from "../../../../../../chat-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string; suggestionId: string }> }
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const { id: rawChatId, suggestionId: rawSuggestionId } = await props.params;

  const chatId = parsePositiveSafeInt(rawChatId);
  if (chatId === null) {
    return jsonResponse({ error: "Identificador de chat inválido" }, 400);
  }

  const suggestionId = typeof rawSuggestionId === "string" ? rawSuggestionId.trim() : "";
  if (!isValidUuid(suggestionId)) {
    return jsonResponse({ error: "Identificador de sugerencia inválido" }, 400);
  }

  const bodyResult = await readLimitedJsonBody(request, 32 * 1024);
  if (bodyResult.error) return bodyResult.error;
  const reviewValidation = validateSuggestionAcceptReview(bodyResult.data);
  if (reviewValidation.error || !reviewValidation.data) {
    return jsonResponse({ error: reviewValidation.error || "Datos de revisión inválidos" }, 400);
  }
  const reviewData = reviewValidation.data as any;
  const reviewMode = reviewValidation.mode === "add-tags" || reviewValidation.mode === "add-subtasks" || reviewValidation.mode === "edit"
    ? reviewValidation.mode
    : "create";

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

    ensureSuggestionTasksTable(db);

    db.exec("BEGIN IMMEDIATE;");
    let committed = false;
    try {
      // 1. Obtener chat con bloqueo inmediato y verificar titularidad
      const chatRow = db
        .prepare(`
          SELECT c.*, p.usuario_id
          FROM chats c
          INNER JOIN proyectos p ON p.id = c.proyecto_id
          WHERE c.id = ?
        `)
        .get(chatId) as (Record<string, unknown> & { usuario_id: number; proyecto_id: number }) | undefined;

      if (!chatRow || Number(chatRow.usuario_id) !== Number(user.id)) {
        db.exec("ROLLBACK;");
        return jsonResponse({ error: "Conversación no encontrada o no pertenece a tu perfil" }, 404);
      }

      const projectId = Number(chatRow.proyecto_id);

      // 2. Comprobar idempotencia en la tabla chat_suggestion_tasks
      const mappingRow = db
        .prepare("SELECT tarea_id FROM chat_suggestion_tasks WHERE chat_id = ? AND suggestion_id = ?")
        .get(chatId, suggestionId) as { tarea_id: number | null } | undefined;

      if (mappingRow) {
        // Ya fue aceptada previamente
        let existingTask: TaskDto | null = null;
        if (mappingRow.tarea_id) {
          existingTask = getProjectTaskById(db, Number(mappingRow.tarea_id), projectId);
        }

        db.exec("COMMIT;");
        committed = true;

        const canonicalChat = rowToChatConversation(chatRow);
        return jsonResponse(
          {
            conversation: canonicalChat,
            task: existingTask,
            alreadyAccepted: true,
          },
          200
        );
      }

      // 3. Inspeccionar mensajes para ubicar la propuesta
      let messages: any[] = [];
      try {
        messages = JSON.parse(String(chatRow.mensajes || "[]"));
      } catch {
        db.exec("ROLLBACK;");
        return jsonResponse({ error: "Datos de conversación corruptos" }, 500);
      }

      let foundProposal: TaskSuggestion | null = null;
      let targetMessageIndex = -1;
      let targetSuggestionIndex = -1;

      for (let mIdx = 0; mIdx < messages.length; mIdx++) {
        const msg = messages[mIdx];
        if (msg.role === "assistant" && Array.isArray(msg.suggestions)) {
          for (let sIdx = 0; sIdx < msg.suggestions.length; sIdx++) {
            const sug = msg.suggestions[sIdx];
            if (sug.id === suggestionId) {
              foundProposal = sug;
              targetMessageIndex = mIdx;
              targetSuggestionIndex = sIdx;
              break;
            }
          }
        }
        if (foundProposal) break;
      }

      if (!foundProposal) {
        db.exec("ROLLBACK;");
        return jsonResponse({ error: "La sugerencia no existe en esta conversación" }, 404);
      }

      if (foundProposal.status === "discarded") {
        db.exec("ROLLBACK;");
        return jsonResponse({ error: "La sugerencia fue descartada y no puede aceptarse" }, 409);
      }

      if (foundProposal.status === "accepted") {
        // En el historial figura accepted pero no tenía mapping (caso anómalo/PUT huérfano)
        db.exec("ROLLBACK;");
        return jsonResponse({ error: "La sugerencia ya se encuentra marcada como aceptada" }, 409);
      }

      const proposalKind = foundProposal.kind === "add-tags" || foundProposal.kind === "add-subtasks" || foundProposal.kind === "edit"
        ? foundProposal.kind
        : "create";
      if (proposalKind !== reviewMode) {
        db.exec("ROLLBACK;");
        return jsonResponse({ error: "El cuerpo de revisión no corresponde al tipo de sugerencia" }, 400);
      }

      let acceptedTaskId: number;
      let finalTask: TaskDto | null = null;

      if (proposalKind === "edit") {
        const targetTaskId = Number(foundProposal.targetTaskId);
        if (!Number.isSafeInteger(targetTaskId) || targetTaskId <= 0) {
          db.exec("ROLLBACK;");
          return jsonResponse({ error: "La sugerencia no referencia una tarea objetivo válida" }, 400);
        }
        const targetTask = getProjectTaskById(db, targetTaskId, projectId);
        if (!targetTask) {
          db.exec("ROLLBACK;");
          return jsonResponse({ error: "La tarea objetivo no existe en este proyecto" }, 404);
        }

        const changes = reviewData.changes as {
          title?: string;
          description?: string;
          priority?: string;
          startDate?: string | null;
          endDate?: string | null;
          column?: number;
          addTags?: { name: string; color?: string }[];
          addSubtasks?: { title: string }[];
          removeTags?: string[];
          removeSubtasks?: string[];
          completeSubtasks?: string[];
          reopenSubtasks?: string[];
        };
        const updateArgs: Record<string, unknown> = { projectId, taskId: targetTaskId };
        if (changes.title !== undefined) updateArgs.title = changes.title;
        if (changes.description !== undefined) updateArgs.description = changes.description || null;
        if (changes.startDate !== undefined) updateArgs.startDate = changes.startDate;
        if (changes.endDate !== undefined) updateArgs.endDate = changes.endDate;
        if (changes.priority !== undefined) {
          const priorityRow = db
            .prepare("SELECT id FROM prioridades WHERE LOWER(TRIM(nombre)) = LOWER(?)")
            .get(changes.priority) as { id: number } | undefined;
          updateArgs.priorityId = priorityRow ? Number(priorityRow.id) : null;
        }
        const norm = (value: string) => value.trim().toLowerCase();
        if (changes.addTags || changes.removeTags) {
          const removed = new Set((changes.removeTags ?? []).map(norm));
          const kept = targetTask.tags.filter((t: { name: string }) => !removed.has(norm(t.name)));
          const present = new Set(kept.map((t: { name: string }) => norm(t.name)));
          updateArgs.tags = [
            ...kept.map((t: { id: number }) => ({ id: t.id })),
            ...(changes.addTags ?? [])
              .filter((t) => !present.has(norm(t.name)))
              .map((t) => (t.color ? { name: t.name, color: t.color } : { name: t.name })),
          ];
        }
        if (changes.addSubtasks || changes.removeSubtasks || changes.completeSubtasks || changes.reopenSubtasks) {
          const removed = new Set((changes.removeSubtasks ?? []).map(norm));
          const completed = new Set((changes.completeSubtasks ?? []).map(norm));
          const reopened = new Set((changes.reopenSubtasks ?? []).map(norm));
          updateArgs.subtasks = [
            ...targetTask.subtasks
              .filter((st: { title: string }) => !removed.has(norm(st.title)))
              .map((st: { id: number; title: string; completed: boolean }) => ({
                id: st.id,
                title: st.title,
                completed: completed.has(norm(st.title)) ? true : reopened.has(norm(st.title)) ? false : st.completed,
              })),
            ...(changes.addSubtasks ?? []).map((st) => ({ title: st.title, completed: false })),
          ];
        }

        db.exec("SAVEPOINT edit_task_sp;");
        try {
          let updated: TaskDto | null = targetTask;
          if (Object.keys(updateArgs).length > 2) {
            updated = updateProjectTask(db, updateArgs as any);
          }
          if (updated && changes.column !== undefined && changes.column !== updated.column) {
            updated = moveProjectTask(db, { projectId, taskId: targetTaskId, column: changes.column, beforeTaskId: undefined });
          }
          if (!updated) {
            throw new Error("No se pudo editar la tarea");
          }
          finalTask = updated;
          acceptedTaskId = targetTaskId;
          db.exec("RELEASE edit_task_sp;");
        } catch (editErr) {
          try {
            db.exec("ROLLBACK TO edit_task_sp;");
            db.exec("RELEASE edit_task_sp;");
          } catch {}
          throw editErr;
        }
      } else if (proposalKind === "add-subtasks") {
        const targetTaskId = Number(foundProposal.targetTaskId);
        if (!Number.isSafeInteger(targetTaskId) || targetTaskId <= 0) {
          db.exec("ROLLBACK;");
          return jsonResponse({ error: "La sugerencia no referencia una tarea objetivo válida" }, 400);
        }
        const targetTask = getProjectTaskById(db, targetTaskId, projectId);
        if (!targetTask) {
          db.exec("ROLLBACK;");
          return jsonResponse({ error: "La tarea objetivo no existe en este proyecto" }, 404);
        }

        // updateProjectTask reemplaza las subtareas: conservar las actuales (con id) y añadir las nuevas.
        const mergedSubtasks = [
          ...targetTask.subtasks.map((st: { id: number; title: string; completed: boolean }) => ({
            id: st.id,
            title: st.title,
            completed: st.completed,
          })),
          ...(reviewData.subtasks as { title: string }[]).map((st) => ({ title: st.title, completed: false })),
        ];

        db.exec("SAVEPOINT add_subtasks_sp;");
        try {
          const updated = updateProjectTask(db, {
            projectId,
            taskId: targetTaskId,
            subtasks: mergedSubtasks,
          } as any);
          if (!updated) {
            throw new Error("No se pudo añadir las subtareas a la tarea");
          }
          finalTask = updated;
          acceptedTaskId = targetTaskId;
          db.exec("RELEASE add_subtasks_sp;");
        } catch (subErr) {
          try {
            db.exec("ROLLBACK TO add_subtasks_sp;");
            db.exec("RELEASE add_subtasks_sp;");
          } catch {}
          throw subErr;
        }
      } else if (proposalKind === "add-tags") {
        // El tipo de acción y la tarea objetivo salen SIEMPRE de la propuesta guardada,
        // nunca del payload del cliente.
        const targetTaskId = Number(foundProposal.targetTaskId);
        if (!Number.isSafeInteger(targetTaskId) || targetTaskId <= 0) {
          db.exec("ROLLBACK;");
          return jsonResponse({ error: "La sugerencia no referencia una tarea objetivo válida" }, 400);
        }

        // Verifica existencia y pertenencia al proyecto del chat (nunca leer datos ajenos).
        const targetTask = getProjectTaskById(db, targetTaskId, projectId);
        if (!targetTask) {
          db.exec("ROLLBACK;");
          return jsonResponse({ error: "La tarea objetivo no existe en este proyecto" }, 404);
        }

        // Unión de etiquetas: conservar las existentes y añadir las propuestas.
        // updateProjectTask reemplaza asociaciones, por lo que incluimos las actuales.
        const mergedTags: unknown[] = [
          ...targetTask.tags.map((t: { id: number }) => ({ id: t.id })),
          ...(reviewData.tags as { name: string; color?: string }[]).map((t) =>
            t.color ? { name: t.name, color: t.color } : { name: t.name }
          ),
        ];

        db.exec("SAVEPOINT add_tags_sp;");
        try {
          const updated = updateProjectTask(db, {
            projectId,
            taskId: targetTaskId,
            tags: mergedTags,
          } as any);
          if (!updated) {
            throw new Error("No se pudo actualizar las etiquetas de la tarea");
          }
          finalTask = updated;
          acceptedTaskId = targetTaskId;
          db.exec("RELEASE add_tags_sp;");
        } catch (tagErr) {
          try {
            db.exec("ROLLBACK TO add_tags_sp;");
            db.exec("RELEASE add_tags_sp;");
          } catch {}
          throw tagErr;
        }
      } else {
        // Modo create: resolución de prioridad de catálogo
        const priorityCatalogRow = db
          .prepare("SELECT id FROM prioridades WHERE LOWER(TRIM(nombre)) = LOWER(?)")
          .get(reviewData.priority.trim()) as { id: number } | undefined;

        const priorityId = priorityCatalogRow ? Number(priorityCatalogRow.id) : null;

        // Creación atómica de la tarea en columna 0 ('Por hacer')
        db.exec("SAVEPOINT create_accepted_task_sp;");
        try {
          const baseTask = createProjectTask(db, {
            projectId,
            column: 0,
            title: reviewData.title,
          });

          acceptedTaskId = Number(baseTask.id);

          const updateArgs: Record<string, unknown> = {
            projectId,
            taskId: acceptedTaskId,
            title: reviewData.title,
            description: reviewData.description ? reviewData.description : null,
            priorityId,
          };

          if (reviewData.subtasks && reviewData.subtasks.length > 0) {
            updateArgs.subtasks = reviewData.subtasks.map((st: { title: string }) => ({
              title: st.title,
              completed: false,
            }));
          }

          if (reviewData.tags && reviewData.tags.length > 0) {
            updateArgs.tags = reviewData.tags.map((t: { name: string; color?: string }) =>
              t.color ? { name: t.name, color: t.color } : { name: t.name }
            );
          }

          const updated = updateProjectTask(db, updateArgs as any);
          if (!updated) {
            throw new Error("No se pudo actualizar los detalles de la tarea creada");
          }
          finalTask = updated;

          db.exec("RELEASE create_accepted_task_sp;");
        } catch (taskErr) {
          try {
            db.exec("ROLLBACK TO create_accepted_task_sp;");
            db.exec("RELEASE create_accepted_task_sp;");
          } catch {}
          throw taskErr;
        }
      }

      // 6. Registrar mapeo de idempotencia
      db.prepare(`
        INSERT INTO chat_suggestion_tasks (chat_id, suggestion_id, tarea_id)
        VALUES (?, ?, ?)
      `).run(chatId, suggestionId, acceptedTaskId);

      // 7. Actualizar el estado de la sugerencia en el historial JSON y subir la revisión del chat
      const acceptedSuggestion: TaskSuggestion = {
        ...foundProposal,
        status: "accepted",
        taskId: acceptedTaskId,
      };
      if (proposalKind === "create") {
        acceptedSuggestion.title = reviewData.title;
        acceptedSuggestion.description = reviewData.description;
        acceptedSuggestion.priority = reviewData.priority;
        acceptedSuggestion.subtasks = reviewData.subtasks;
        if (reviewData.tags !== undefined) {
          acceptedSuggestion.tags = reviewData.tags;
        }
      }
      if (proposalKind === "edit") {
        acceptedSuggestion.changes = reviewData.changes;
      }
      if (proposalKind === "add-subtasks") {
        acceptedSuggestion.title = finalTask!.title;
        acceptedSuggestion.subtasks = reviewData.subtasks;
      }
      if (proposalKind === "add-tags") {
        acceptedSuggestion.title = finalTask!.title;
        acceptedSuggestion.tags = reviewData.tags;
      }

      messages[targetMessageIndex].suggestions[targetSuggestionIndex] = acceptedSuggestion;

      const nextRevision = Number(chatRow.revision) + 1;
      const updatedMessagesJson = JSON.stringify(messages);
      const nowIso = new Date().toISOString();

      db.prepare(`
        UPDATE chats
        SET
          mensajes = ?,
          revision = ?,
          actualizado_en = ?
        WHERE id = ? AND revision = ?
      `).run(updatedMessagesJson, nextRevision, nowIso, chatId, chatRow.revision as number);

      db.exec("COMMIT;");
      committed = true;

      // 8. Re-leer el chat actualizado para la respuesta canónica
      const freshChatRow = db.prepare("SELECT * FROM chats WHERE id = ?").get(chatId) as Record<string, unknown>;
      const canonicalChat = rowToChatConversation(freshChatRow);

      return jsonResponse(
        {
          conversation: canonicalChat,
          task: finalTask,
          alreadyAccepted: false,
        },
        200
      );
    } catch (txErr) {
      if (!committed) {
        try {
          db.exec("ROLLBACK;");
        } catch {}
      }
      const code = (txErr as { code?: unknown } | null)?.code;
      if (typeof code === "string" && code.startsWith("INVALID_")) {
        return jsonResponse({ error: (txErr as Error).message }, 400);
      }
      return jsonResponse({ error: "Error al procesar la aceptación de la sugerencia" }, 500);
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
