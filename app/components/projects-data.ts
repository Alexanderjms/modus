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

export function projectTasksLabel(tasks: string, t: Translate) {
  const match = /^(\d+) de (\d+) tareas$/.exec(tasks);
  return match ? t("{0} de {1} tareas", match[1], match[2]) : t(tasks);
}
