export type Project = {
  name: string;
  description: string;
  icon: string;
  color: string;
  progress: number;
  fill: number;
  tasks: string;
  doing: string;
  activity: string;
};

export type Task = {
  text: string;
  project: Project;
};

export const projects: Project[] = [];

export const tasks: Task[] = [];

export const unavailable = "Esta función aún no está integrada.";
