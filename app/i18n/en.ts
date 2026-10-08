import { enApi } from "./en-api";
import { enUi1 } from "./en-ui-1";
import { enUi2 } from "./en-ui-2";
import { enUi3 } from "./en-ui-3";
import { enUi4 } from "./en-ui-4";

const enExtra: Record<string, string> = {
  "Iniciando almacenamiento local...": "Starting local storage...",
  "Base de datos inicializada...": "Database initialized...",
  "Esquema y catálogos aplicados...": "Schema and catalogs applied...",
  "PIN de acceso protegido...": "Access PIN protected...",
  "Perfil de usuario registrado...": "User profile registered...",
  "{0} de {1} tareas": "{0} of {1} tasks",
  "sin actividad": "no activity",
  "La actividad se registra desde esta actualización.": "Activity is recorded from this update onward.",
  "Etiquetas: {0}.": "Tags: {0}.",
  "Hola, {0}": "Hello, {0}",
  "Hola": "Hello",
  "Esta base de datos ya tiene un perfil. Inicia sesión con tu usuario y contraseña para recuperar tus datos.": "This database already has a profile. Sign in with your username and password to recover your data.",
  "No se pudo iniciar sesión. Inténtalo de nuevo.": "Could not sign in. Try again.",
  "Iniciar sesión en Turso": "Sign in to Turso",
  "Pensando…": "Thinking…",
  "Buscando…": "Searching…",
  "Menú de {0}": "{0}'s menu",
  "Desbloquea Modus antes de cambiar el perfil.": "Unlock Modus before changing the profile.",
  "El nombre debe tener entre 1 y 100 caracteres.": "The name must be between 1 and 100 characters.",
  "pendiente": "pending",
  "pendientes": "pending",
  "completada": "completed",
  "quitar archivo": "remove file",
  "eliminar recurso": "delete resource",
  "recurso {0}": "resource {0}",
  "archivo": "file",
  "enlace": "link",
  "guardar": "save",
  "crear": "create",
  "subtarea": "subtask",
  "subtareas": "subtasks",
  "subtarea {0}": "subtask {0}",
  "resultado": "result",
  "resultados": "results",
  "Mié": "Wed",
  "Ya existe una etiqueta con este nombre en el proyecto": "A tag with this name already exists in the project",
};

export const en: Record<string, string> = { ...enApi, ...enUi1, ...enUi2, ...enUi3, ...enUi4, ...enExtra };
