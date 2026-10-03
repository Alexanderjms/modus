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

export const initialProjects: Project[] = [
  {
    id: 1,
    name: "Observatorio Regional",
    description:
      "Plataforma regional para gestión de investigación científica.",
    icon: "globe",
    progress: 35,
    tasks: "14 / 40 tareas",
    doing: 3,
    activity: "hace 12 min",
    age: 12,
    status: "active",
  },
  {
    id: 2,
    name: "Portfolio personal",
    description: "Sitio personal y presentación de proyectos.",
    icon: "person",
    progress: 68,
    tasks: "17 / 25 tareas",
    doing: 2,
    activity: "ayer",
    age: 1440,
    status: "active",
  },
  {
    id: 3,
    name: "Lista de Compras",
    description: "Aplicación móvil para crear listas de compras.",
    icon: "cart",
    progress: 22,
    tasks: "5 / 23 tareas",
    doing: 1,
    activity: "hace 3 días",
    age: 4320,
    status: "active",
  },
  {
    id: 4,
    name: "Red de Laboratorios",
    description: "Gestión compartida de equipos y muestras de laboratorio.",
    icon: "flask",
    progress: 48,
    tasks: "12 / 25 tareas",
    doing: 2,
    activity: "hace 5 h",
    age: 300,
    status: "active",
  },
  {
    id: 5,
    name: "Sistema de Becas",
    description: "Administración de convocatorias y postulaciones.",
    icon: "mortarboard",
    progress: 100,
    tasks: "31 / 31 tareas",
    doing: 0,
    activity: "hace 2 semanas",
    age: 20160,
    status: "completed",
  },
  {
    id: 6,
    name: "App de Recetas",
    description: "Recetario personal con modo cocina paso a paso.",
    icon: "fork-knife",
    progress: 12,
    tasks: "3 / 24 tareas",
    doing: 0,
    activity: "hace 1 mes",
    age: 43200,
    status: "archived",
  },
];
