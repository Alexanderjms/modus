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
