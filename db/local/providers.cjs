"use strict";

const {
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
} = require("./projects.cjs");
const { applySchema } = require("./migrate.cjs");
const { isDpapiAvailable, encryptWithDpapi, decryptWithDpapi } = require("./credentials.cjs");

const API_KEY_PROVIDERS = Object.freeze([
  "bedrock",
  "deepinfra",
  "groq",
  "opencode",
  "openrouter",
]);

const ALLOWED_PROVIDERS = Object.freeze([...API_KEY_PROVIDERS, "chatgpt"]);

const ALLOWED_PROVIDERS_SET = new Set(ALLOWED_PROVIDERS);
const MAX_KEY_LENGTH = 4096;
const MAX_PUT_BODY_BYTES = 40 * 1024;

function ensureProvidersTable(db) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='proveedor_claves'")
    .get();
  if (!row) {
    applySchema(db);
  }
}

async function readProvidersJsonBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.split(";")[0].trim().toLowerCase() !== "application/json") {
    return { error: Response.json({ error: "Content-Type debe ser application/json" }, { status: 400 }) };
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
          if (totalBytes > MAX_PUT_BODY_BYTES) {
            await reader.cancel();
            return {
              error: Response.json({ error: "El cuerpo de la solicitud excede el tamaño permitido" }, { status: 400 }),
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
    return { error: Response.json({ error: "Error leyendo la solicitud" }, { status: 400 }) };
  }

  try {
    const body = JSON.parse(rawBodyText);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return { error: Response.json({ error: "El cuerpo debe ser un objeto JSON" }, { status: 400 }) };
    }
    return { data: body };
  } catch {
    return { error: Response.json({ error: "JSON inválido" }, { status: 400 }) };
  }
}

function getProviderStatusList(db, userId) {
  const rows = db
    .prepare("SELECT proveedor FROM proveedor_claves WHERE usuario_id = ?")
    .all(userId);
  const configuredSet = new Set(rows.map((r) => r.proveedor));

  const providers = API_KEY_PROVIDERS.map((id) => ({
    id,
    configured: configuredSet.has(id),
  }));

  return {
    providers,
    storage: {
      kind: "windows-dpapi",
      available: isDpapiAvailable(),
    },
  };
}

async function getDecryptedProviderKey(db, userId, providerId, sessionToken) {
  if (providerId === "chatgpt") {
    const { getAccessToken, profileFor } = require("./chatgpt-oauth.cjs");
    return await getAccessToken(profileFor(db, userId, sessionToken));
  }
  if (!ALLOWED_PROVIDERS_SET.has(providerId)) {
    throw new Error(`Proveedor no soportado: ${providerId}`);
  }
  ensureProvidersTable(db);
  const row = db
    .prepare("SELECT clave_cifrada FROM proveedor_claves WHERE usuario_id = ? AND proveedor = ?")
    .get(userId, providerId);

  if (!row || !row.clave_cifrada) {
    return null;
  }
  return await decryptWithDpapi(row.clave_cifrada);
}

module.exports = {
  ALLOWED_PROVIDERS,
  ALLOWED_PROVIDERS_SET,
  MAX_KEY_LENGTH,
  MAX_PUT_BODY_BYTES,
  ensureProvidersTable,
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
  readProvidersJsonBody,
  getProviderStatusList,
  getDecryptedProviderKey,
  isDpapiAvailable,
  encryptWithDpapi,
  decryptWithDpapi,
};
