"use strict";

const {
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
} = require("./projects.cjs");
const { ALLOWED_PROVIDERS_SET, getDecryptedProviderKey } = require("./providers.cjs");

const MAX_CHAT_BODY_BYTES = 128 * 1024;
const MAX_UPSTREAM_BYTES = 4 * 1024 * 1024;
const DISCOVERY_TIMEOUT_MS = 30000;
const CHAT_TIMEOUT_MS = 90000;
const MAX_MESSAGES = 40;
const MAX_USER_MESSAGE_CONTENT_LEN = 4000;
const MAX_TOTAL_CONTENT_LEN = 80000;
const MAX_MODELS_DISCOVERY = 10000;

const ALLOWED_PROTOCOLS = new Set(["chat-completions", "responses", "messages"]);

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

const OPENCODE_RESPONSES_MODELS = new Set([
  "grok-4.7",
  "grok-4.6",
  "gpt-6-luna",
  "gpt-5.6-luna",
  "muse-spark-1.3-contributor",
  "muse-spark-1.2-contributor",
  "muse-spark-1.3-contributor-free",
  "muse-spark-1.2-contributor-free",
]);

const OPENCODE_MESSAGES_MODELS = new Set([
  "minimax-m3",
  "minimax-m2.7",
  "qwen3.8-max",
  "qwen3.8-flash",
  "qwen3.7-plus",
]);

const OPENCODE_CHAT_MODELS = new Set([
  "glm-5.3-flash",
  "glm-5.3",
  "glm-5.2",
  "kimi-k3",
  "kimi-k2.7-code",
  "kimi-k2.6",
  "longcat-2.0",
  "deepseek-v4.1-flash",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "deepseek-v4-flash-vision-exp",
  "mimo-v2.6-flash",
  "mimo-v2.6-pro",
  "mimo-v2.5",
  "mimo-v2.5-pro",
  "hy4-preview",
  "hy3",
  "big-pickle",
  "deepseek-v4-flash-free",
  "mimo-v2.6-flash-free",
  "mimo-v2.5-free",
  "ling-3.0-flash-fin-free",
  "nemotron-3-ultra-free",
  "nemotron-3.5-lightning-free",
  "fledge-alpha-free",
  "ling-3.1-flash-free",
  "space-bunny-free",
  "longcat-2.5-preview-free",
]);

function getOpenCodeProtocolForModel(modelId) {
  const rawModelId = modelId.startsWith("zen:") ? modelId.slice(4) : modelId;
  if (OPENCODE_RESPONSES_MODELS.has(rawModelId)) return "responses";
  if (OPENCODE_MESSAGES_MODELS.has(rawModelId)) return "messages";
  if (OPENCODE_CHAT_MODELS.has(rawModelId)) return "chat-completions";
  return null;
}

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

async function readLimitedJsonBody(request, maxBytes) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.split(";")[0].trim().toLowerCase() !== "application/json") {
    return { error: jsonResponse({ error: "Content-Type debe ser application/json" }, 400) };
  }

  let rawBodyText;
  try {
    const reader = request.body?.getReader();
    const chunks = [];
    let totalBytes = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel();
            return {
              error: jsonResponse({ error: "El cuerpo de la solicitud excede el límite permitido" }, 400),
            };
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    rawBodyText = Buffer.concat(chunks).toString("utf8");
  } catch {
    return { error: jsonResponse({ error: "Error al leer el cuerpo de la solicitud" }, 400) };
  }

  try {
    const body = JSON.parse(rawBodyText);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return { error: jsonResponse({ error: "El cuerpo debe ser un objeto JSON" }, 400) };
    }
    return { data: body };
  } catch {
    return { error: jsonResponse({ error: "JSON inválido" }, 400) };
  }
}

function handleUpstreamError(status) {
  if (status === 401 || status === 403) {
    return jsonResponse({ error: "Clave de API o permisos no válidos para el proveedor" }, 422);
  }
  if (status === 429) {
    return jsonResponse({ error: "Límite de solicitudes excedido en el proveedor upstream" }, 429);
  }
  return jsonResponse({ error: "Error en el servicio del proveedor upstream" }, 502);
}

function getProviderEndpoint(provider, region) {
  switch (provider) {
    case "opencode":
      return "https://opencode.ai/zen/go/v1";
    case "google":
      return "https://generativelanguage.googleapis.com/v1beta";
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    case "groq":
      return "https://api.groq.com/openai/v1";
    case "cerebras":
      return "https://api.cerebras.ai/v1";
    case "deepinfra":
      return "https://api.deepinfra.com/v1";
    case "nvidia":
      return "https://integrate.api.nvidia.com/v1";
    case "bedrock":
      return `https://bedrock-mantle.${region}.api.aws/v1`;
    default:
      return null;
  }
}

async function fetchJSON(url, options, clientSignal, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error("Timeout"));
  }, timeoutMs);

  let onClientAbort = null;
  if (clientSignal) {
    if (clientSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(clientSignal.reason);
    } else {
      onClientAbort = () => {
        clearTimeout(timeoutId);
        controller.abort(clientSignal.reason);
      };
      clientSignal.addEventListener("abort", onClientAbort, { once: true });
    }
  }

  let reader = null;
  let onReadAbort = null;
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: "error",
    });

    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      return { ok: false, errorResponse: handleUpstreamError(res.status) };
    }

    if (!res.body) {
      return { ok: true, data: null };
    }

    reader = res.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    const abortPromise = new Promise((_, reject) => {
      onReadAbort = () => reject(controller.signal.reason);
      if (controller.signal.aborted) onReadAbort();
      else controller.signal.addEventListener("abort", onReadAbort, { once: true });
    });

    while (true) {
      const readPromise = reader.read();
      const { done, value } = await Promise.race([readPromise, abortPromise]);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_UPSTREAM_BYTES) {
        void reader.cancel().catch(() => {});
        return { ok: false, errorResponse: jsonResponse({ error: "Respuesta del proveedor demasiado grande" }, 502) };
      }
      chunks.push(value);
    }

    const text = Buffer.concat(chunks).toString("utf8");
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, errorResponse: jsonResponse({ error: "Respuesta malformada del proveedor" }, 502) };
    }

    return { ok: true, data };
  } catch (err) {
    if (reader) {
      try { void reader.cancel().catch(() => {}); } catch {}
    }
    if (controller.signal.aborted) {
      if (clientSignal && clientSignal.aborted) {
        return { ok: false, errorResponse: jsonResponse({ error: "Solicitud cancelada por el cliente" }, 499) };
      }
      return { ok: false, errorResponse: jsonResponse({ error: "Tiempo de espera agotado con el proveedor" }, 504) };
    }
    return { ok: false, errorResponse: jsonResponse({ error: "Error de conexión con el proveedor" }, 502) };
  } finally {
    clearTimeout(timeoutId);
    if (clientSignal && onClientAbort) {
      clientSignal.removeEventListener("abort", onClientAbort);
    }
    if (onReadAbort) controller.signal.removeEventListener("abort", onReadAbort);
    if (reader) {
      try { reader.releaseLock(); } catch {}
    }
  }
}

function sanitizeText(str) {
  if (typeof str !== "string") return "";
  return str.replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, 1000);
}

function validModelId(str) {
  return typeof str === "string" && str.length > 0 && str.length <= 1000 &&
    str.trim() === str && !/[\x00-\x1F\x7F]/.test(str) ? str : "";
}

const GOOGLE_MODEL_NAME_REGEX = /^models\/[a-zA-Z0-9.\-_]{1,993}$/;

function formatFallbackModelName(rawId) {
  return rawId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isZenFreeModel(id) {
  if (id === "big-pickle") return true;
  return id.endsWith("-free");
}

function isZenChatCompatible(id) {
  return !id.startsWith("jev-");
}

async function discoverProviderModels(provider, apiKey, region, clientSignal) {
  if (provider === "bedrock") {
    if (!region || !BEDROCK_ALLOWED_REGIONS.has(region)) {
      return { error: jsonResponse({ error: "Región no válida o ausente para Bedrock Mantle" }, 400) };
    }
  }

  const baseUrl = getProviderEndpoint(provider, region);
  if (!baseUrl) {
    return { error: jsonResponse({ error: "Proveedor no soportado" }, 400) };
  }

  let modelsUrl = "";
  const headers = {};

  if (provider === "google") {
    modelsUrl = `${baseUrl}/models?pageSize=100`;
    headers["x-goog-api-key"] = apiKey;
  } else if (provider === "opencode") {
    modelsUrl = `${baseUrl}/models`;
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["User-Agent"] = "Modus/1.0";
    headers["x-opencode-session"] = "modus-default";
  } else if (provider === "deepinfra") {
    modelsUrl = `${baseUrl}/models`;
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    modelsUrl = `${baseUrl}/models`;
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const collectedModels = [];
  const seenIds = new Set();
  const discoveryDeadline = Date.now() + DISCOVERY_TIMEOUT_MS;

  if (provider === "google") {
    let pageToken = null;
    let pageCount = 0;
    const seenPageTokens = new Set();

    while (true) {
      pageCount++;
      if (pageCount > 100) {
        return { error: jsonResponse({ error: "Respuesta del proveedor excede el límite de paginación" }, 502) };
      }

      const url = pageToken ? `${modelsUrl}&pageToken=${encodeURIComponent(pageToken)}` : modelsUrl;
      const remaining = discoveryDeadline - Date.now();
      if (remaining <= 0) {
        return { error: jsonResponse({ error: "Tiempo de espera agotado con el proveedor" }, 504) };
      }
      const result = await fetchJSON(url, { method: "GET", headers }, clientSignal, remaining);
      if (!result.ok) return { error: result.errorResponse };

      const parsed = result.data;
      if (typeof parsed !== "object" || parsed === null) {
        return { error: jsonResponse({ error: "Formato de respuesta del proveedor inválido" }, 502) };
      }

      if (!Array.isArray(parsed.models)) {
        return { error: jsonResponse({ error: "Formato de lista de modelos inválido" }, 502) };
      }

      if (Array.isArray(parsed.models)) {
        for (const m of parsed.models) {
          if (typeof m !== "object" || m === null) continue;
          const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
          if (methods.includes("generateContent")) {
            if (typeof m.name !== "string" || !GOOGLE_MODEL_NAME_REGEX.test(m.name)) {
              continue;
            }
            const id = m.name;
            if (seenIds.has(id)) continue;
            seenIds.add(id);

            const displayName = typeof m.displayName === "string" ? sanitizeText(m.displayName) : "";
            const name = displayName || id;

            collectedModels.push({
              id,
              name,
              protocol: "chat-completions",
            });

            if (collectedModels.length > MAX_MODELS_DISCOVERY) {
              return { error: jsonResponse({ error: "Catálogo de modelos excede el límite admitido" }, 502) };
            }
          }
        }
      }

      if (parsed.nextPageToken && typeof parsed.nextPageToken === "string") {
        if (seenPageTokens.has(parsed.nextPageToken)) {
          return { error: jsonResponse({ error: "Bucle de paginación detectado en proveedor" }, 502) };
        }
        seenPageTokens.add(parsed.nextPageToken);
        pageToken = parsed.nextPageToken;
      } else {
        break;
      }
    }
  } else {
    const result = await fetchJSON(modelsUrl, { method: "GET", headers }, clientSignal, DISCOVERY_TIMEOUT_MS);
    if (!result.ok) return { error: result.errorResponse };

    const parsed = result.data;
    if (typeof parsed !== "object" || parsed === null) {
      return { error: jsonResponse({ error: "Formato de respuesta del proveedor inválido" }, 502) };
    }

    if (provider === "deepinfra") {
      let items = null;
      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (Array.isArray(parsed.data)) {
        items = parsed.data;
      } else {
        return { error: jsonResponse({ error: "Formato de lista de modelos inválido" }, 502) };
      }

      for (const item of items) {
        if (typeof item !== "object" || item === null) continue;
        if (item.task !== undefined && item.task !== null && item.task !== "text-generation") {
          continue;
        }
        const rawId = typeof item.model_name === "string" ? item.model_name : typeof item.id === "string" ? item.id : "";
        const id = validModelId(rawId);
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);

        const rawName = typeof item.name === "string" ? item.name : id;
        const name = sanitizeText(rawName) || id;

        collectedModels.push({
          id,
          name,
          protocol: "chat-completions",
        });

        if (collectedModels.length > MAX_MODELS_DISCOVERY) {
          return { error: jsonResponse({ error: "Catálogo de modelos excede el límite admitido" }, 502) };
        }
      }
    } else {
      let items = null;
      if (Array.isArray(parsed.data)) {
        items = parsed.data;
      } else if (Array.isArray(parsed.models)) {
        items = parsed.models;
      } else {
        return { error: jsonResponse({ error: "Formato de lista de modelos inválido" }, 502) };
      }

      for (const item of items) {
        if (typeof item !== "object" || item === null) continue;
        if (provider === "openrouter") {
          if (Array.isArray(item.architecture?.output_modalities)) {
            if (!item.architecture.output_modalities.includes("text")) continue;
          }
        }
        const rawId = typeof item.id === "string" ? item.id : "";
        const id = validModelId(rawId);
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);

        const rawName = typeof item.name === "string" ? item.name : id;
        const name = sanitizeText(rawName) || id;

        let protocol = "chat-completions";
        const entry = { id, name };
        if (provider === "opencode") {
          protocol = getOpenCodeProtocolForModel(id);
          entry.protocol = protocol;
          entry.source = "go";
        } else if (provider === "bedrock") {
          entry.protocol = "responses";
        } else {
          entry.protocol = protocol;
        }

        collectedModels.push(entry);

        if (collectedModels.length > MAX_MODELS_DISCOVERY) {
          return { error: jsonResponse({ error: "Catálogo de modelos excede el límite admitido" }, 502) };
        }
      }

      if (provider === "opencode") {
        let warning;
        const zenDeadline = discoveryDeadline - Date.now();
        if (zenDeadline <= 0) {
          warning = "No se pudieron cargar los modelos gratuitos de OpenCode Zen a tiempo";
        } else {
          const zenUrl = "https://opencode.ai/zen/v1/models";
          try {
            const zenResult = await fetchJSON(zenUrl, { method: "GET", headers }, clientSignal, zenDeadline);
            if (!zenResult.ok) {
              warning = "No se pudieron cargar los modelos gratuitos de OpenCode Zen";
            } else {
              const zenParsed = zenResult.data;
              const zenItems = Array.isArray(zenParsed?.data)
                ? zenParsed.data
                : Array.isArray(zenParsed?.models)
                ? zenParsed.models
                : null;

              if (!zenItems) {
                warning = "No se pudieron cargar los modelos gratuitos de OpenCode Zen";
              } else {
                for (const item of zenItems) {
                  if (typeof item !== "object" || item === null) continue;
                  const rawId = typeof item.id === "string" ? item.id : "";
                  const validRawId = validModelId(rawId);
                  if (!validRawId) continue;
                  if (!isZenFreeModel(validRawId)) continue;
                  if (!isZenChatCompatible(validRawId)) continue;

                  const namespacedId = `zen:${validRawId}`;
                  if (seenIds.has(namespacedId)) continue;
                  seenIds.add(namespacedId);

                  const rawName = typeof item.name === "string" && item.name.trim().length > 0
                    ? item.name
                    : formatFallbackModelName(validRawId);
                  const name = sanitizeText(rawName) || formatFallbackModelName(validRawId);
                  const protocol = getOpenCodeProtocolForModel(validRawId);

                  collectedModels.push({
                    id: namespacedId,
                    name,
                    protocol,
                    source: "zen",
                    badge: "FREE",
                  });

                  if (collectedModels.length > MAX_MODELS_DISCOVERY) {
                    return { error: jsonResponse({ error: "Catálogo de modelos excede el límite admitido" }, 502) };
                  }
                }
              }
            }
          } catch {
            warning = "No se pudieron cargar los modelos gratuitos de OpenCode Zen";
          }
        }

        const out = { models: collectedModels };
        if (warning) out.warning = warning;
        return out;
      }
    }
  }

  return { models: collectedModels };
}

function validateChatRequest(body) {
  const allowedKeys = new Set(["projectId", "provider", "model", "protocol", "region", "messages"]);
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      return { error: jsonResponse({ error: "Campo no permitido en la solicitud" }, 400) };
    }
  }

  const { projectId, provider, model, protocol, region, messages } = body;

  if (typeof projectId !== "number" || !Number.isSafeInteger(projectId) || projectId <= 0) {
    return { error: jsonResponse({ error: "projectId debe ser un entero positivo" }, 400) };
  }

  if (typeof provider !== "string" || !ALLOWED_PROVIDERS_SET.has(provider)) {
    return { error: jsonResponse({ error: "Proveedor inválido" }, 400) };
  }

  if (typeof model !== "string" || model.trim().length === 0 || model.length > 1000) {
    return { error: jsonResponse({ error: "Modelo inválido" }, 400) };
  }

  if (protocol !== undefined && (typeof protocol !== "string" || !ALLOWED_PROTOCOLS.has(protocol))) {
    return { error: jsonResponse({ error: "Protocolo inválido" }, 400) };
  }

  if (provider === "bedrock") {
    if (typeof region !== "string" || !BEDROCK_ALLOWED_REGIONS.has(region)) {
      return { error: jsonResponse({ error: "Región no válida o ausente para Bedrock Mantle" }, 400) };
    }
  }

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return { error: jsonResponse({ error: "messages debe ser un array de 1 a 40 mensajes" }, 400) };
  }

  let totalLength = 0;
  let expectedRole = "user";

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (typeof msg !== "object" || msg === null || Array.isArray(msg)) {
      return { error: jsonResponse({ error: "Cada mensaje debe ser un objeto" }, 400) };
    }
    const msgKeys = Object.keys(msg);
    if (msgKeys.length !== 2 || !msgKeys.includes("role") || !msgKeys.includes("content")) {
      return { error: jsonResponse({ error: "Mensaje contiene campos no permitidos" }, 400) };
    }
    if (msg.role !== "user" && msg.role !== "assistant") {
      return { error: jsonResponse({ error: "Rol debe ser 'user' o 'assistant'" }, 400) };
    }
    if (msg.role !== expectedRole) {
      return { error: jsonResponse({ error: "Los roles de los mensajes deben alternar entre 'user' y 'assistant' comenzando por 'user'" }, 400) };
    }
    expectedRole = msg.role === "user" ? "assistant" : "user";

    if (typeof msg.content !== "string") {
      return { error: jsonResponse({ error: "El contenido del mensaje debe ser texto" }, 400) };
    }

    if (msg.content.trim().length === 0) {
      return { error: jsonResponse({ error: "El contenido del mensaje no puede estar vacío" }, 400) };
    }

    if (msg.role === "user" && msg.content.length > MAX_USER_MESSAGE_CONTENT_LEN) {
      return { error: jsonResponse({ error: `Un mensaje de usuario excede los ${MAX_USER_MESSAGE_CONTENT_LEN} caracteres` }, 400) };
    }

    if (msg.role === "assistant" && msg.content.length > MAX_TOTAL_CONTENT_LEN) {
      return { error: jsonResponse({ error: `Un mensaje del asistente excede los ${MAX_TOTAL_CONTENT_LEN} caracteres` }, 400) };
    }

    totalLength += msg.content.length;
  }

  if (totalLength > MAX_TOTAL_CONTENT_LEN) {
    return { error: jsonResponse({ error: `El contenido total excede los ${MAX_TOTAL_CONTENT_LEN} caracteres` }, 400) };
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== "user") {
    return { error: jsonResponse({ error: "El último mensaje debe ser del usuario ('user')" }, 400) };
  }

  return {
    data: {
      projectId,
      provider,
      model: model.trim(),
      protocol,
      region,
      messages,
    },
  };
}

const { getProjectContext } = require("./project-context.cjs");

function buildSystemPrompt(projectName, projectContext = null) {
  let prompt = `Eres el asistente de IA integrado en Modus para el proyecto "${projectName}". Ayuda al usuario a estructurar, refinar o consultar ideas sobre este proyecto. No tienes acceso a modificar directamente las tareas ni la base de datos; proporciona sugerencias claras en texto plano.`;

  if (projectContext) {
    const sections = [];
    if (projectContext.context && projectContext.context.trim()) {
      sections.push(`[Contexto del proyecto]\n${projectContext.context.trim()}`);
    }
    if (Array.isArray(projectContext.rules) && projectContext.rules.length > 0) {
      const rulesList = projectContext.rules.map((r) => `- ${r}`).join("\n");
      sections.push(`[Reglas a seguir]\n${rulesList}`);
    }
    if (Array.isArray(projectContext.resources) && projectContext.resources.length > 0) {
      const resList = projectContext.resources.map((res) => `- ${res.title}: ${res.url}`).join("\n");
      sections.push(`[Recursos del proyecto]\n${resList}`);
    }

    if (sections.length > 0) {
      prompt += `\n\n${sections.join("\n\n")}`;
    }
  }

  return prompt;
}

function parseOpenCodeResponses(parsed) {
  if (typeof parsed !== "object" || parsed === null) return null;

  if (Array.isArray(parsed.output)) {
    const textBlocks = [];
    for (const item of parsed.output) {
      if (item?.type === "message" && Array.isArray(item.content)) {
        for (const block of item.content) {
          if (block?.type === "output_text" && typeof block.text === "string") {
            textBlocks.push(block.text);
          }
        }
      }
    }
    if (textBlocks.length > 0) {
      return textBlocks.join("");
    }
  }

  if (typeof parsed.output_text === "string" && parsed.output_text.trim()) {
    return parsed.output_text;
  }

  if (Array.isArray(parsed.choices) && parsed.choices[0]?.message?.content) {
    const c = parsed.choices[0].message.content;
    if (typeof c === "string") return c;
  }

  return null;
}

function parseAnthropicMessages(parsed) {
  if (typeof parsed !== "object" || parsed === null) return null;
  if (Array.isArray(parsed.content)) {
    const textBlocks = [];
    for (const block of parsed.content) {
      if (block?.type === "text" && typeof block.text === "string") {
        textBlocks.push(block.text);
      }
    }
    if (textBlocks.length > 0) {
      return textBlocks.join("");
    }
  }
  return null;
}

function parseOpenAIChat(parsed) {
  if (typeof parsed !== "object" || parsed === null) return null;
  if (Array.isArray(parsed.choices) && parsed.choices.length > 0) {
    const choice = parsed.choices[0];
    const message = choice?.message;
    if (typeof message?.content === "string") {
      return message.content;
    }
    if (Array.isArray(message?.content)) {
      const texts = [];
      for (const part of message.content) {
        if (part?.type === "text" && typeof part.text === "string") {
          texts.push(part.text);
        }
      }
      if (texts.length > 0) return texts.join("");
    }
  }
  return null;
}

function parseGoogleGenerateContent(parsed) {
  if (typeof parsed !== "object" || parsed === null) return null;
  if (parsed.promptFeedback?.blockReason) {
    return { blocked: true };
  }
  if (Array.isArray(parsed.candidates) && parsed.candidates.length > 0) {
    const candidate = parsed.candidates[0];
    if (candidate.finishReason === "SAFETY" || candidate.finishReason === "BLOCKLIST") {
      return { blocked: true };
    }
    const parts = candidate.content?.parts;
    if (Array.isArray(parts)) {
      const texts = [];
      for (const p of parts) {
        if (p.thought) continue;
        if (typeof p.text === "string") {
          texts.push(p.text);
        }
      }
      if (texts.length > 0) {
        return { text: texts.join("") };
      }
    }
  }
  return null;
}

/**
 * @param {string} provider
 * @param {string} apiKey
 * @param {string} model
 * @param {string} protocol
 * @param {string|null} region
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} projectName
 * @param {number} projectId
 * @param {AbortSignal|undefined} clientSignal
 * @param {number} [timeoutMs]
 * @param {any} [projectContext]
 */
async function executeInference(provider, apiKey, model, protocol, region, messages, projectName, projectId, clientSignal, timeoutMs = CHAT_TIMEOUT_MS, projectContext = null) {
  const baseUrl = getProviderEndpoint(provider, region);
  const systemPrompt = buildSystemPrompt(projectName, projectContext);

  let targetUrl = "";
  let headers = {};
  let payload = null;
  let responseParser = null;

  if (provider === "google") {
    const encodedModel = encodeURIComponent(model.startsWith("models/") ? model.slice(7) : model);
    targetUrl = `${baseUrl}/models/${encodedModel}:generateContent`;
    headers["x-goog-api-key"] = apiKey;
    headers["Content-Type"] = "application/json";

    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    payload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
      generationConfig: {
        maxOutputTokens: 4096,
      },
    };

    responseParser = (parsed) => {
      const res = parseGoogleGenerateContent(parsed);
      if (!res || res.blocked) return null;
      return res.text;
    };
  } else if (provider === "bedrock") {
    targetUrl = `${baseUrl}/responses`;
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["Content-Type"] = "application/json";

    payload = {
      model,
      instructions: systemPrompt,
      input: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_output_tokens: 4096,
      store: false,
    };

    responseParser = (parsed) => parseOpenCodeResponses(parsed);
  } else if (provider === "opencode") {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["Content-Type"] = "application/json";
    headers["User-Agent"] = "Modus/1.0";
    headers["x-opencode-session"] = `modus-project-${projectId}`;

    const isZenModel = model.startsWith("zen:");
    const rawModelId = isZenModel ? model.slice(4) : model;
    const effectiveBaseUrl = isZenModel ? "https://opencode.ai/zen/v1" : baseUrl;

    if (protocol === "responses") {
      targetUrl = `${effectiveBaseUrl}/responses`;
      payload = {
        model: rawModelId,
        instructions: systemPrompt,
        input: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_output_tokens: 4096,
        store: false,
      };
      responseParser = (parsed) => parseOpenCodeResponses(parsed);
    } else if (protocol === "messages") {
      targetUrl = `${effectiveBaseUrl}/messages`;
      headers["anthropic-version"] = "2023-06-01";
      payload = {
        model: rawModelId,
        system: systemPrompt,
        max_tokens: 4096,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      };
      responseParser = (parsed) => parseAnthropicMessages(parsed);
    } else {
      targetUrl = `${effectiveBaseUrl}/chat/completions`;
      payload = {
        model: rawModelId,
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      };
      responseParser = (parsed) => parseOpenAIChat(parsed);
    }
  } else {
    const completionsPath = provider === "deepinfra" ? `${baseUrl}/openai/chat/completions` : `${baseUrl}/chat/completions`;
    targetUrl = completionsPath;
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["Content-Type"] = "application/json";

    payload = {
      model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    };
    responseParser = (parsed) => parseOpenAIChat(parsed);
  }

  const result = await fetchJSON(
    targetUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    },
    clientSignal,
    timeoutMs
  );

  if (!result.ok) return { error: result.errorResponse };

  const parsedJson = result.data;
  const assistantText = responseParser(parsedJson);

  if (!assistantText || typeof assistantText !== "string" || !assistantText.trim()) {
    return { error: jsonResponse({ error: "Respuesta vacía o bloqueada por políticas del proveedor" }, 502) };
  }

  return { text: assistantText };
}

module.exports = {
  MAX_CHAT_BODY_BYTES,
  MAX_UPSTREAM_BYTES,
  DISCOVERY_TIMEOUT_MS,
  CHAT_TIMEOUT_MS,
  ALLOWED_PROVIDERS: ALLOWED_PROVIDERS_SET,
  BEDROCK_ALLOWED_REGIONS,
  OPENCODE_RESPONSES_MODELS,
  OPENCODE_MESSAGES_MODELS,
  OPENCODE_CHAT_MODELS,
  getOpenCodeProtocolForModel,
  jsonResponse,
  withNoStore,
  readLimitedJsonBody,
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
  getDecryptedProviderKey,
  fetchJSON,
  discoverProviderModels,
  validateChatRequest,
  buildSystemPrompt,
  executeInference,
};
