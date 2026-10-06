import { protocols, providers } from "./chat-data.mjs";

const providerIds = new Set(providers.map(({ id }) => id));
const protocolIds = new Set(protocols.map(({ id }) => id));

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
    (item.role === "user" || item.role === "assistant") && typeof item.content === "string",
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

export async function createChat(projectId, signal) {
  const response = await fetch("/api/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
    signal,
  });
  return readChat(response);
}
