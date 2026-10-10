import type { DatabaseSync } from "node:sqlite";
import { sanitizeTaskChanges } from "../../../../../db/local/task-suggestions.cjs";
import { getProjectContext, saveProjectContext, validateContextDocument } from "../../../../../db/local/project-context.cjs";
import { createProjectTask, updateProjectTask, moveProjectTask, getProjectTaskById } from "../../../../../db/local/tasks.cjs";
import type { TaskDto } from "../../../tasks/route";
import type { TaskSuggestion } from "../../../../chat-contract";

export type AcceptOutcome =
  | { error: string; status: number }
  | { alreadyAccepted: boolean; task: TaskDto | null };

export function applySuggestionAcceptance(
  db: DatabaseSync,
  {
    chatRow,
    chatId,
    projectId,
    suggestionId,
    reviewData,
    reviewMode,
    state,
  }: {
    chatRow: Record<string, unknown>;
    chatId: number;
    projectId: number;
    suggestionId: string;
    reviewData: any;
    reviewMode: string;
    state: { messages: any[] | null };
  },
): AcceptOutcome {
  const mappingRow = db
    .prepare("SELECT tarea_id FROM chat_suggestion_tasks WHERE chat_id = ? AND suggestion_id = ?")
    .get(chatId, suggestionId) as { tarea_id: number | null } | undefined;

  if (mappingRow) {
    const existingTask: TaskDto | null = mappingRow.tarea_id
      ? getProjectTaskById(db, Number(mappingRow.tarea_id), projectId)
      : null;
    return { alreadyAccepted: true, task: existingTask };
  }

  if (!state.messages) {
    try {
      state.messages = JSON.parse(String(chatRow.mensajes || "[]"));
    } catch {
      return { error: "Datos de conversación corruptos", status: 500 };
    }
  }
  const messages = state.messages as any[];

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
    return { error: "La sugerencia no existe en esta conversación", status: 404 };
  }

  if (foundProposal.status === "discarded") {
    return { error: "La sugerencia fue descartada y no puede aceptarse", status: 409 };
  }

  if (foundProposal.status === "accepted") {
    return { error: "La sugerencia ya se encuentra marcada como aceptada", status: 409 };
  }

  const proposalKind = foundProposal.kind === "add-tags" || foundProposal.kind === "add-subtasks" || foundProposal.kind === "edit" || foundProposal.kind === "context"
    ? foundProposal.kind
    : "create";
  if (proposalKind !== reviewMode) {
    return { error: "El cuerpo de revisión no corresponde al tipo de sugerencia", status: 400 };
  }

  let acceptedTaskId: number | null;
  let finalTask: TaskDto | null = null;
  let previous: any;

  if (proposalKind === "edit") {
    const targetTaskId = Number(foundProposal.targetTaskId);
    if (!Number.isSafeInteger(targetTaskId) || targetTaskId <= 0) {
      return { error: "La sugerencia no referencia una tarea objetivo válida", status: 400 };
    }
    const targetTask = getProjectTaskById(db, targetTaskId, projectId);
    if (!targetTask) {
      return { error: "La tarea objetivo no existe en este proyecto", status: 404 };
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
      renameSubtasks?: { from: string; to: string }[];
      addAttachments?: string[];
    };
    const snapshot: Record<string, unknown> = {};
    if (changes.title !== undefined) snapshot.title = targetTask.title;
    if (changes.description !== undefined) snapshot.description = targetTask.description ?? "";
    if (changes.priority !== undefined) snapshot.priority = String(targetTask.priority).toLowerCase();
    if (changes.startDate !== undefined) snapshot.startDate = targetTask.startDate ?? null;
    if (changes.endDate !== undefined) snapshot.endDate = targetTask.endDate ?? null;
    if (changes.column !== undefined) snapshot.column = targetTask.column;
    previous = sanitizeTaskChanges(snapshot) ?? undefined;
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
    if (changes.addAttachments?.length) {
      const current = String(targetTask.attachments ?? "").split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);
      const known = new Set(current.map((line: string) => line.toLowerCase()));
      updateArgs.attachments = [...current, ...changes.addAttachments.filter((entry) => !known.has(entry.toLowerCase()))].join("\n");
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
    if (changes.addSubtasks || changes.removeSubtasks || changes.completeSubtasks || changes.reopenSubtasks || changes.renameSubtasks) {
      const renamed = new Map((changes.renameSubtasks ?? []).map((item) => [norm(item.from), item.to]));
      const removed = new Set((changes.removeSubtasks ?? []).map(norm));
      const completed = new Set((changes.completeSubtasks ?? []).map(norm));
      const reopened = new Set((changes.reopenSubtasks ?? []).map(norm));
      updateArgs.subtasks = [
        ...targetTask.subtasks
          .filter((st: { title: string }) => !removed.has(norm(st.title)))
          .map((st: { id: number; title: string; completed: boolean }) => ({
            id: st.id,
            title: renamed.get(norm(st.title)) ?? st.title,
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
      return { error: "La sugerencia no referencia una tarea objetivo válida", status: 400 };
    }
    const targetTask = getProjectTaskById(db, targetTaskId, projectId);
    if (!targetTask) {
      return { error: "La tarea objetivo no existe en este proyecto", status: 404 };
    }

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
    const targetTaskId = Number(foundProposal.targetTaskId);
    if (!Number.isSafeInteger(targetTaskId) || targetTaskId <= 0) {
      return { error: "La sugerencia no referencia una tarea objetivo válida", status: 400 };
    }

    const targetTask = getProjectTaskById(db, targetTaskId, projectId);
    if (!targetTask) {
      return { error: "La tarea objetivo no existe en este proyecto", status: 404 };
    }

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
  } else if (proposalKind === "context") {
    const changes = reviewData.contextChanges as {
      context?: string;
      addRules?: string[];
      removeRules?: string[];
      addResources?: { title: string; url: string }[];
      removeResources?: string[];
    };
    const norm = (value: string) => value.trim().toLowerCase();
    const current = getProjectContext(db, projectId) as { context: string; rules: string[]; resources: { title: string; url: string }[] };
    const removedRules = new Set((changes.removeRules ?? []).map(norm));
    const removedResources = new Set((changes.removeResources ?? []).map(norm));
    const rules = current.rules.filter((rule) => !removedRules.has(norm(rule)));
    for (const rule of changes.addRules ?? []) if (!rules.some((item) => norm(item) === norm(rule))) rules.push(rule);
    const resources = current.resources.filter((item) => !removedResources.has(norm(item.title)));
    for (const item of changes.addResources ?? []) if (!resources.some((existing) => norm(existing.url) === norm(item.url))) resources.push(item);
    const validated = validateContextDocument({ context: changes.context ?? current.context, rules, resources }, db, projectId);
    if (validated.error || !validated.data) {
      throw Object.assign(new Error(validated.error || "Contexto inválido"), { code: "INVALID_CONTEXT" });
    }
    saveProjectContext(db, projectId, validated.data);
    acceptedTaskId = null;
  } else {
    const priorityCatalogRow = db
      .prepare("SELECT id FROM prioridades WHERE LOWER(TRIM(nombre)) = LOWER(?)")
      .get(reviewData.priority.trim()) as { id: number } | undefined;

    const priorityId = priorityCatalogRow ? Number(priorityCatalogRow.id) : null;

    db.exec("SAVEPOINT create_accepted_task_sp;");
    try {
      const baseTask = createProjectTask(db, {
        projectId,
        column: [0, 1, 2].includes(Number(foundProposal.column)) ? Number(foundProposal.column) : 0,
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

      if (foundProposal.startDate) updateArgs.startDate = foundProposal.startDate;
      if (foundProposal.endDate) updateArgs.endDate = foundProposal.endDate;
      if (foundProposal.attachments?.length) updateArgs.attachments = foundProposal.attachments.join("\n");

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

  db.prepare(`
    INSERT INTO chat_suggestion_tasks (chat_id, suggestion_id, tarea_id)
    VALUES (?, ?, ?)
  `).run(chatId, suggestionId, acceptedTaskId);

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
    if (previous) acceptedSuggestion.previous = previous;
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
  return { alreadyAccepted: false, task: finalTask };

}
