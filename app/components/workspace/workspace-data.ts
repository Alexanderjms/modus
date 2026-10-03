export type BoardTask = {
  title: string;
  column: number;
  tags: string[];
  priority: "alta" | "media" | "baja";
  assignee: string;
  checklist?: string;
  progress?: number;
  when?: string;
};

export const columns = ["BACKLOG", "POR HACER", "EN PROGRESO", "TERMINADO"];
export const initialTasks: BoardTask[] = [
  {
    title: "Optimizar consultas de organizaciones",
    column: 0,
    tags: ["Backend", "Rendimiento"],
    priority: "baja",
    assignee: "MG",
    checklist: "0/3",
  },
  {
    title: "Agregar logs de auditoría",
    column: 0,
    tags: ["Backend", "Infraestructura"],
    priority: "media",
    assignee: "JL",
    checklist: "0/4",
  },
  {
    title: "Investigación: librería de gráficos",
    column: 0,
    tags: ["Investigación", "UI/UX"],
    priority: "baja",
    assignee: "AR",
  },
  {
    title: "Migrar informes a la nueva API",
    column: 0,
    tags: ["Backend", "Datos"],
    priority: "media",
    assignee: "CP",
    checklist: "0/2",
  },
  {
    title: "Definir criterios de accesibilidad",
    column: 0,
    tags: ["UI/UX"],
    priority: "baja",
    assignee: "AL",
  },
  {
    title: "Investigar integración con ORCID",
    column: 0,
    tags: ["Investigación", "Investigadores"],
    priority: "baja",
    assignee: "AR",
  },
  {
    title: "Testing del módulo Investigadores",
    column: 1,
    tags: ["Testing", "Investigadores"],
    priority: "alta",
    assignee: "AL",
    checklist: "0/5",
  },
  {
    title: "Revisar rendimiento de consultas",
    column: 1,
    tags: ["Backend", "Rendimiento"],
    priority: "media",
    assignee: "MG",
  },
  {
    title: "Validar exportación de datos",
    column: 1,
    tags: ["Backend", "Datos"],
    priority: "media",
    assignee: "JL",
    checklist: "1/3",
    progress: 33,
  },
  {
    title: "Corregir error en organizaciones",
    column: 2,
    tags: ["Bug", "Investigadores"],
    priority: "alta",
    assignee: "AL",
    checklist: "2/4",
    progress: 50,
  },
  {
    title: "Documentar resultados de testing",
    column: 2,
    tags: ["Documentación", "Testing"],
    priority: "media",
    assignee: "AL",
    checklist: "1/2",
    progress: 50,
  },
  {
    title: "Diseñar estructura de pruebas",
    column: 2,
    tags: ["Testing"],
    priority: "media",
    assignee: "JL",
    checklist: "0/2",
  },
  {
    title: "Configurar entorno de testing",
    column: 3,
    tags: [],
    priority: "baja",
    assignee: "",
    when: "Ayer",
  },
  {
    title: "Crear cuentas de prueba",
    column: 3,
    tags: [],
    priority: "baja",
    assignee: "",
    when: "Ayer",
  },
  {
    title: "Revisar casos de uso",
    column: 3,
    tags: [],
    priority: "baja",
    assignee: "",
    when: "Lun",
  },
  {
    title: "Instalar dependencias",
    column: 3,
    tags: [],
    priority: "baja",
    assignee: "",
    when: "Lun",
  },
];

export const subtasks = [
  "Probar cambio de universidad",
  "Validar actualización de organizaciones",
  "Probar filtros de búsqueda",
  "Revisar casos con datos vacíos",
  "Corregir errores encontrados",
];
export const rules = [
  "Dividir funcionalidades grandes en subtareas.",
  "Priorizar correcciones antes de nuevas funcionalidades.",
  "Utilizar TypeScript para código nuevo.",
  "No sugerir fechas límite automáticamente.",
];
export const contextText =
  "El Observatorio Regional centraliza información de investigación científica de universidades de Centroamérica. Facilita la colaboración y el acceso a información científica regional…";
