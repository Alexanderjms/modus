"use strict";

const { applySchema } = require("./migrate.cjs");
const { validatePersistedSuggestions, ensureSuggestionTasksTable } = require("./task-suggestions.cjs");

const MAX_CHAT_JSON_BODY_BYTES = 512 * 1024;
const MAX_MESSAGES = 40;
const MAX_USER_MESSAGE_CONTENT_LEN = 4000;
const MAX_ASSISTANT_MESSAGE_CONTENT_LEN = 80000;
const MAX_TOTAL_CONTENT_LEN = 200000;
const MAX_MODEL_LENGTH = 1000;

const { ALLOWED_PROVIDERS_SET } = require("./providers.cjs");

const ALLOWED_PROTOCOLS_SET = new Set(["chat-completions", "responses", "messages"]);

const BEDROCK_ALLOWED_REGIONS = new Set([
  "us-east-2",
  "us-east-1",
  "us-west-2",
  "ap-southeast-3",
  "ap-south-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-south-1",
  "eu-north-1",
  "sa-east-1",
  "us-gov-west-1",
]);

function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function withNoStore(response) {
  if (!response) {
    return jsonResponse({ error: "Error en la solicitud" }, 400);
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function ensureChatsTable(db) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chats'")
    .get();
  if (!row) {
    applySchema(db);
    ensureSuggestionTasksTable(db);
    return;
  }
  const cols = db.prepare("PRAGMA table_info(chats)").all();
  if (!cols.some((c) => c.name === "titulo_manual")) {
    db.exec("ALTER TABLE chats ADD COLUMN titulo_manual INTEGER NOT NULL DEFAULT 0;");
  }
  ensureSuggestionTasksTable(db);
}

function parseNonNegativeSafeInt(val) {
  if (typeof val === "number") {
    if (Number.isSafeInteger(val) && val >= 0) return val;
    return null;
  }
  if (typeof val !== "string" || !/^\d+$/.test(val)) return null;
  const num = Number(val);
  if (!Number.isSafeInteger(num) || num < 0) return null;
  return num;
}

function parsePositiveSafeInt(val) {
  if (typeof val === "number") {
    if (Number.isSafeInteger(val) && val > 0) return val;
    return null;
  }
  if (typeof val !== "string" || !/^\d+$/.test(val)) return null;
  const num = Number(val);
  if (!Number.isSafeInteger(num) || num <= 0) return null;
  return num;
}

function computeChatTitle(firstUserText) {
  if (!firstUserText || typeof firstUserText !== "string") {
    return "Nuevo chat";
  }
  const collapsed = firstUserText.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return "Nuevo chat";
  }
  return collapsed.slice(0, 60);
}

function validateMessages(messages) {
  if (!Array.isArray(messages)) {
    return { error: "messages debe ser un array" };
  }
  if (messages.length > MAX_MESSAGES) {
    return { error: `Excede el límite máximo de ${MAX_MESSAGES} mensajes` };
  }

  if (messages.length === 0) {
    return { data: [] };
  }

  if (messages.length % 2 !== 0) {
    return { error: "El historial debe contener pares completos de mensajes alternados" };
  }

  let totalLen = 0;
  const sanitizedMessages = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (typeof msg !== "object" || msg === null || Array.isArray(msg)) {
      return { error: "Cada mensaje debe ser un objeto" };
    }
    const keys = Object.keys(msg);
    const hasSuggestions = Object.hasOwn(msg, "suggestions");
    if (keys.length > 3 || (keys.length === 3 && !hasSuggestions) || (keys.length < 2) || !("role" in msg) || !("content" in msg)) {
      return { error: "Mensaje contiene campos no permitidos" };
    }

    const expectedRole = i % 2 === 0 ? "user" : "assistant";
    if (msg.role !== expectedRole) {
      return { error: "Los roles deben alternar iniciando con 'user' y terminando con 'assistant'" };
    }

    if (hasSuggestions && expectedRole !== "assistant") {
      return { error: "Solo los mensajes de asistente pueden incluir sugerencias de tareas" };
    }

    let sanitizedSuggestions = undefined;
    if (hasSuggestions) {
      const suggResult = validatePersistedSuggestions(msg.suggestions);
      if (suggResult.error) {
        return { error: suggResult.error };
      }
      sanitizedSuggestions = suggResult.data;
    }

    if (typeof msg.content !== "string") {
      return { error: "El contenido del mensaje debe ser una cadena de texto" };
    }

    const contentTrimmed = msg.content.trim();
    if (contentTrimmed.length === 0) {
      return { error: "El contenido del mensaje no puede estar vacío" };
    }

    if (expectedRole === "user" && msg.content.length > MAX_USER_MESSAGE_CONTENT_LEN) {
      return { error: `El mensaje de usuario excede el límite de ${MAX_USER_MESSAGE_CONTENT_LEN} caracteres` };
    }

    if (expectedRole === "assistant" && msg.content.length > MAX_ASSISTANT_MESSAGE_CONTENT_LEN) {
      return { error: `El mensaje de asistente excede el límite de ${MAX_ASSISTANT_MESSAGE_CONTENT_LEN} caracteres` };
    }

    totalLen += msg.content.length;
    if (totalLen > MAX_TOTAL_CONTENT_LEN) {
      return { error: `El contenido total excede el límite de ${MAX_TOTAL_CONTENT_LEN} caracteres` };
    }

    sanitizedMessages.push({
      role: expectedRole,
      content: msg.content,
      ...(sanitizedSuggestions !== undefined ? { suggestions: sanitizedSuggestions } : {}),
    });
  }

  return { data: sanitizedMessages };
}

function validateSaveChatPayload(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "El cuerpo debe ser un objeto JSON" };
  }
  const allowedFields = ["revision", "messages", "provider", "model", "protocol", "region"];
  if (Object.keys(body).length !== allowedFields.length ||
    allowedFields.some((field) => !Object.hasOwn(body, field))) {
    return { error: "Campos de conversación no válidos" };
  }

  const { revision, messages, provider, model, protocol, region } = body;

  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    return { error: "revision debe ser un entero seguro no negativo (>= 0)" };
  }

  if (typeof provider !== "string" || !ALLOWED_PROVIDERS_SET.has(provider)) {
    return { error: "provider inválido" };
  }

  if (typeof model !== "string") {
    return { error: "model debe ser una cadena de texto" };
  }
  const trimmedModel = model.trim();
  if (trimmedModel.length === 0 || trimmedModel.length > MAX_MODEL_LENGTH) {
    return { error: `model no puede estar vacío ni superar ${MAX_MODEL_LENGTH} caracteres` };
  }
  if (/[\x00-\x1F\x7F]/.test(trimmedModel)) {
    return { error: "model contiene caracteres de control no permitidos" };
  }

  let finalProtocol = null;
  if (protocol !== null && protocol !== undefined) {
    if (typeof protocol !== "string" || !ALLOWED_PROTOCOLS_SET.has(protocol)) {
      return { error: "protocol inválido" };
    }
    finalProtocol = protocol;
  }

  let finalRegion = null;
  if (provider === "bedrock") {
    if (typeof region !== "string" || !BEDROCK_ALLOWED_REGIONS.has(region.trim())) {
      return { error: "region inválida para provider bedrock" };
    }
    finalRegion = region.trim();
  } else {
    if (region !== null && region !== undefined) {
      if (typeof region !== "string") {
        return { error: "region debe ser una cadena de texto o null" };
      }
      if (region.length > 64 || /[\x00-\x1F\x7F]/.test(region)) {
        return { error: "region inválida" };
      }
      finalRegion = region.trim() || null;
    }
  }

  const msgsRes = validateMessages(messages);
  if (msgsRes.error) {
    return { error: msgsRes.error };
  }

  return {
    data: {
      revision,
      messages: msgsRes.data,
      provider,
      model: trimmedModel,
      protocol: finalProtocol,
      region: finalRegion,
    },
  };
}

function rowToChatSummary(row) {
  return {
    id: Number(row.id),
    projectId: Number(row.proyecto_id),
    title: row.titulo,
    revision: Number(row.revision),
    createdAt: row.creado_en,
    updatedAt: row.actualizado_en,
    provider: row.proveedor || null,
    model: row.modelo || null,
    protocol: row.protocolo || null,
    region: row.region || null,
  };
}

function rowToChatConversation(row) {
  const summary = rowToChatSummary(row);
  let messages = [];
  try {
    const parsed = JSON.parse(row.mensajes);
    const result = validateMessages(parsed);
    if (result.error) throw new Error("Datos de conversación corruptos");
    messages = result.data;
  } catch {
    throw new Error("Datos de conversación corruptos");
  }
  return {
    ...summary,
    messages,
  };
}

module.exports = {
  MAX_CHAT_JSON_BODY_BYTES,
  MAX_MESSAGES,
  MAX_USER_MESSAGE_CONTENT_LEN,
  MAX_ASSISTANT_MESSAGE_CONTENT_LEN,
  MAX_TOTAL_CONTENT_LEN,
  MAX_MODEL_LENGTH,
  ALLOWED_PROVIDERS_SET,
  ALLOWED_PROTOCOLS_SET,
  BEDROCK_ALLOWED_REGIONS,
  jsonResponse,
  withNoStore,
  ensureChatsTable,
  parsePositiveSafeInt,
  parseNonNegativeSafeInt,
  computeChatTitle,
  validateMessages,
  validateSaveChatPayload,
  rowToChatSummary,
  rowToChatConversation,
};
