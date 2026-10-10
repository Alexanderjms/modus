import type { Translate } from "../i18n/translate";
export type Project = {
  id: number;
  name: string;
  description: string;
  icon: string;
  progress: number;
  tasks: string;
  doing: number;
  activity: string;
  age: number;
  status: "active" | "completed" | "archived";
};

export const initialProjects: Project[] = [];

const OPENED_KEY = "modus.projectOpenedAt";

function readOpened(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OPENED_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function markProjectOpened(id: number) {
  try {
    localStorage.setItem(OPENED_KEY, JSON.stringify({ ...readOpened(), [id]: Date.now() }));
  } catch {}
}

export function sortByLastOpened<T extends { id: number }>(projects: readonly T[]): T[] {
  const opened = readOpened();
  return [...projects].sort((a, b) => (opened[b.id] ?? 0) - (opened[a.id] ?? 0));
}

export function projectTasksLabel(tasks: string, t: Translate) {
  const match = /^(\d+) de (\d+) tareas$/.exec(tasks);
  return match ? t("{0} de {1} tareas", match[1], match[2]) : t(tasks);
}
