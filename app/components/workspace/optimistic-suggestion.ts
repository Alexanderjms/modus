import type { TaskDto } from "../../api/tasks/route";
import type { TaskSuggestionDraft, TaskSuggestionView } from "./task-suggestion-card";

export type TaskChange = {
  task?: TaskDto;
  replaceId?: number;
  patch?: { taskId: number; apply: (task: TaskDto) => TaskDto };
  refresh?: boolean;
};

const END_OF_COLUMN = 1_000_000_000;

const priorityName = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const norm = (value: string) => value.trim().toLocaleLowerCase("es");

export function optimisticNewTask(draft: TaskSuggestionDraft, tempId: number): TaskDto | null {
  if (!("title" in draft)) return null;
  return {
    id: tempId,
    listId: 0,
    column: 0,
    order: END_OF_COLUMN,
    title: draft.title,
    description: draft.description || null,
    startDate: null,
    endDate: null,
    attachments: null,
    priority: priorityName(draft.priority),
    priorityColor: null,
    status: "Pendiente",
    tags: (draft.tags ?? []).map((tag, index) => ({ id: -(index + 1), name: tag.name, color: tag.color ?? null, description: null })),
    subtasks: draft.subtasks.map((subtask, index) => ({ id: -(index + 1), title: subtask.title, completed: false })),
  };
}

export function optimisticPatch(suggestion: TaskSuggestionView, draft: TaskSuggestionDraft): ((task: TaskDto) => TaskDto) | null {
  const newSubtasks = (items: { title: string }[]) => items.map((item, index) => ({ id: -(1000 + index), title: item.title, completed: false }));
  const newTags = (items: { name: string; color?: string }[]) => items.map((item, index) => ({ id: -(1000 + index), name: item.name, color: item.color ?? null, description: null }));

  if (suggestion.kind === "add-subtasks" && "subtasks" in draft) {
    return (task) => ({ ...task, subtasks: [...task.subtasks, ...newSubtasks(draft.subtasks)] });
  }
  if (suggestion.kind === "add-tags" && "tags" in draft && draft.tags) {
    const added = draft.tags;
    return (task) => ({
      ...task,
      tags: [...task.tags, ...newTags(added.filter((tag) => !task.tags.some((existing) => norm(existing.name) === norm(tag.name))))],
    });
  }
  if (suggestion.kind === "edit" && "changes" in draft) {
    const changes = draft.changes;
    return (task) => {
      const removedTags = new Set((changes.removeTags ?? []).map(norm));
      const removedSubtasks = new Set((changes.removeSubtasks ?? []).map(norm));
      const completed = new Set((changes.completeSubtasks ?? []).map(norm));
      const reopened = new Set((changes.reopenSubtasks ?? []).map(norm));
      const renamed = new Map((changes.renameSubtasks ?? []).map((item) => [norm(item.from), item.to]));
      const next: TaskDto = {
        ...task,
        tags: [
          ...task.tags.filter((tag) => !removedTags.has(norm(tag.name))),
          ...newTags((changes.addTags ?? []).filter((tag) => !task.tags.some((existing) => norm(existing.name) === norm(tag.name)))),
        ],
        subtasks: [
          ...task.subtasks
            .filter((subtask) => !removedSubtasks.has(norm(subtask.title)))
            .map((subtask) => ({
              ...subtask,
              title: renamed.get(norm(subtask.title)) ?? subtask.title,
              completed: completed.has(norm(subtask.title)) ? true : reopened.has(norm(subtask.title)) ? false : subtask.completed,
            })),
          ...newSubtasks(changes.addSubtasks ?? []),
        ],
      };
      if (changes.title !== undefined) next.title = changes.title;
      if (changes.description !== undefined) next.description = changes.description || null;
      if (changes.priority !== undefined) {
        next.priority = priorityName(changes.priority);
        next.priorityColor = null;
      }
      if (changes.addAttachments?.length) {
        const current = (task.attachments ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        next.attachments = [...current, ...changes.addAttachments.filter((entry) => !current.some((line) => norm(line) === norm(entry)))].join("\n");
      }
      if (changes.startDate !== undefined) next.startDate = changes.startDate;
      if (changes.endDate !== undefined) next.endDate = changes.endDate;
      if (changes.column !== undefined && changes.column !== task.column) {
        next.column = changes.column;
        next.order = END_OF_COLUMN;
      }
      return next;
    };
  }
  return null;
}
