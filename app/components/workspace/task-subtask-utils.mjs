export function getSubtasksToSave(subtasks, removedKeys) {
  const active = subtasks.filter(({ localKey }) => !removedKeys.has(localKey));
  if (active.some(({ id, title }) => id !== undefined && !title.trim())) return null;
  return active.filter(({ title }) => title.trim()).map(({ id, title, completed }) => ({
    ...(id === undefined ? {} : { id }),
    title: title.trim(),
    completed: completed === true,
  }));
}
