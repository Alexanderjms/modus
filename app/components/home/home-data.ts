export const projects = [
  {
    name: "Observatorio Regional",
    description:
      "Plataforma regional para gestión de investigación científica.",
    icon: "globe",
    color: "#007AFF",
    progress: 35,
    fill: 176,
    tasks: "14 / 40 tareas",
    doing: "3 en progreso",
    activity: "hace 12 min",
  },
  {
    name: "Portfolio personal",
    description: "Sitio personal y presentación de proyectos.",
    icon: "person",
    color: "#AF52DE",
    progress: 68,
    fill: 341,
    tasks: "17 / 25 tareas",
    doing: "2 en progreso",
    activity: "ayer",
  },
  {
    name: "Lista de Compras",
    description: "Aplicación móvil para crear listas de compras.",
    icon: "cart",
    color: "#FF9500",
    progress: 22,
    fill: 110,
    tasks: "5 / 23 tareas",
    doing: "1 en progreso",
    activity: "hace 3 días",
  },
];

export const tasks = [
  {
    text: "Validar actualización de organizaciones",
    project: projects[0],
  },
  {
    text: "Revisar responsive móvil",
    project: projects[1],
  },
  {
    text: "Implementar búsqueda de productos",
    project: projects[2],
  },
];

export const unavailable = "Esta función aún no está integrada.";

export type Project = (typeof projects)[number];
export type Task = (typeof tasks)[number];
