type EditableSubtask = { id?: number; localKey: string; title: string; completed: boolean };

export function getSubtasksToSave(subtasks: EditableSubtask[], removedKeys: Set<string>): { id?: number; title: string; completed: boolean }[] | null;
