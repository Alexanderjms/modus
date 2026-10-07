import { protocols, providers } from "./chat-data.mjs";
import { maxAttachments, validAttachment } from "../../chat-attachments.mjs";

const providerIds = new Set(providers.map(({ id }) => id));
const protocolIds = new Set(protocols.map(({ id }) => id));
const suggestionKeys = new Set(["id", "kind", "targetTaskId", "tags", "title", "description", "priority", "subtasks", "status", "taskId", "changes"]);

function validSuggestionTags(value) {
  return Array.isArray(value) && value.length <= 10 && value.every((tag) =>
    typeof tag === "object" && tag !== null && Object.keys(tag).every((key) => key === "name" || key === "color") &&
    typeof tag.name === "string" && tag.name.trim().length > 0 && tag.name.length <= 80 &&
    !/[\x00-\x1f\x7f]/.test(tag.name) &&
    (!Object.hasOwn(tag, "color") || (typeof tag.color === "string" && /^#[0-9a-f]{6}$/i.test(tag.color)))
  );
}

function validSuggestion(value) {
  return typeof value === "object" && value !== null && Object.keys(value).every((key) => suggestionKeys.has(key)) &&
    typeof value.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) &&
    (value.kind === undefined || value.kind === "create" || value.kind === "add-tags" || value.kind === "add-subtasks" || value.kind === "edit") &&
    (value.targetTaskId === undefined || (Number.isSafeInteger(value.targetTaskId) && value.targetTaskId > 0)) &&
    ((value.kind !== "add-tags" && value.kind !== "add-subtasks" && value.kind !== "edit") || (Number.isSafeInteger(value.targetTaskId) && value.targetTaskId > 0)) &&
    (value.tags === undefined || validSuggestionTags(value.tags)) &&
    ((value.kind === "edit") === (value.changes !== undefined) && (value.changes === undefined || (typeof value.changes === "object" && value.changes !== null && !Array.isArray(value.changes)))) &&
    typeof value.title === "string" && value.title.length <= 255 &&
    typeof value.description === "string" && value.description.length <= 2000 &&
    ["alta", "media", "baja", "sin prioridad"].includes(value.priority) &&
    Array.isArray(value.subtasks) && value.subtasks.length <= 20 &&
    value.subtasks.every((subtask) => typeof subtask === "object" && subtask !== null &&
      Object.keys(subtask).every((key) => key === "title") && typeof subtask.title === "string" && subtask.title.length <= 255) &&
    ["pending", "accepted", "discarded"].includes(value.status) &&
    (!Object.hasOwn(value, "taskId") || value.taskId === null ||
      (Number.isSafeInteger(value.taskId) && value.taskId > 0));
}

export function errorForStatus(status) {
  if (status === 400) return "Solicitud no válida. Revisa el proveedor y el modelo.";
  if (status === 422) return "Revisa la clave, los permisos y la compatibilidad del modelo en el proveedor.";
  if (status === 401 || status === 403) return "La clave o los permisos del proveedor no son válidos.";
  if (status === 409) {
    return "El perfil local o la configuración del proveedor cambió. Actualiza los proveedores.";
  }
  if (status === 429) return "El proveedor alcanzó su cuota o límite de solicitudes.";
  if (status === 502) return "El proveedor no pudo completar la solicitud.";
  if (status === 504) return "La solicitud agotó el tiempo de espera.";
  return "No se pudo completar la operación. Inténtalo de nuevo.";
}

export function validMessages(value) {
  return Array.isArray(value) && value.every((item) =>
    typeof item === "object" && item !== null &&
    (item.role === "user" || item.role === "assistant") && typeof item.content === "string" &&
    (!Object.hasOwn(item, "attachments") || (item.role === "user" && Array.isArray(item.attachments) && item.attachments.length > 0 && item.attachments.length <= maxAttachments && item.attachments.every(validAttachment))) &&
    (!Object.hasOwn(item, "tasks") || (item.role === "user" && Array.isArray(item.tasks) && item.tasks.length > 0 && item.tasks.length <= 10 &&
      item.tasks.every((task) => typeof task === "object" && task !== null && Object.keys(task).every((key) => key === "id" || key === "title") &&
        Number.isSafeInteger(task.id) && task.id > 0 && typeof task.title === "string" && task.title.length <= 255))) &&
    (!Object.hasOwn(item, "suggestions") || (item.role === "assistant" && Array.isArray(item.suggestions) &&
      item.suggestions.every(validSuggestion))),
  );
}

export function validSummary(value) {
  if (typeof value !== "object" || value === null) return false;
  const item = value;
  return typeof item.id === "number" && typeof item.projectId === "number" &&
    typeof item.title === "string" &&
    typeof item.revision === "number" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string" &&
    (item.provider === null || providerIds.has(item.provider)) &&
    (item.model === null || typeof item.model === "string") &&
    (item.protocol === null || protocolIds.has(item.protocol)) &&
    (item.region === null || typeof item.region === "string");
}

export function validConversation(value) {
  return validSummary(value) && "messages" in value && validMessages(value.messages);
}

export async function readChat(response) {
  if (!response.ok) throw new Error(response.status === 404
    ? "Ese chat no existe en este proyecto."
    : "No se pudo acceder al historial local.");
  const data = await response.json();
  if (typeof data !== "object" || data === null || !("chat" in data) || !validConversation(data.chat)) {
    throw new Error("No se pudo leer el historial del chat.");
  }
  return data.chat;
}

export async function createChat(projectId, signal, transport = fetch) {
  const response = await transport("/api/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
    signal,
  });
  return readChat(response);
}
