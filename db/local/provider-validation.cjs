"use strict";

const { discoverProviderModels, BEDROCK_ALLOWED_REGIONS } = require("./chat.cjs");

const PROVIDER_NAMES = Object.freeze({
  bedrock: "AWS Amazon Bedrock",
  deepinfra: "DeepInfra",
  groq: "Groq",
  opencode: "OpenCode Go",
  openrouter: "OpenRouter",
});

const TIMEOUT_MS = 15000;

function withTimeout(signal) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function checkAuthenticated(provider, key, signal) {
  const listing = await discoverProviderModels(provider, key, null, signal);
  if (listing.error) return { ok: false, invalid: listing.error.status === 422 };
  let response;
  if (provider === "openrouter") {
    response = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${key}` },
      signal: withTimeout(signal),
    });
  } else {
    const model = listing.models.find((item) => item.protocol === "chat-completions" && item.source !== "zen");
    if (!model) return { ok: true };
    response = await fetch("https://opencode.ai/zen/go/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "Modus/1.0" },
      body: JSON.stringify({ model: model.id, messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
      signal: withTimeout(signal),
    });
  }
  if (response.status === 401 || response.status === 403) return { ok: false, invalid: true };
  return response.status < 500 ? { ok: true } : { ok: false, invalid: false };
}

async function checkOnce(provider, key, region, signal) {
  if (provider === "openrouter" || provider === "opencode") return checkAuthenticated(provider, key, signal);
  const result = await discoverProviderModels(provider, key, region, signal);
  if (!result.error) return { ok: true };
  return { ok: false, invalid: result.error.status === 422 };
}

async function validateProviderKey(provider, key, signal) {
  const name = PROVIDER_NAMES[provider] ?? provider;
  const attempts = provider === "bedrock"
    ? [...BEDROCK_ALLOWED_REGIONS].map((region) => checkOnce(provider, key, region, signal))
    : [checkOnce(provider, key, null, signal)];
  let results;
  try {
    results = await Promise.all(attempts);
  } catch {
    results = [{ ok: false, invalid: false }];
  }
  if (results.some((result) => result.ok)) return { ok: true };
  if (results.every((result) => result.invalid)) {
    return { ok: false, status: 422, error: `La clave de ${name} no es válida o no tiene permisos.` };
  }
  return {
    ok: false,
    status: 502,
    error: `No se pudo validar la clave de ${name}: el proveedor no respondió. Revisa tu conexión e inténtalo de nuevo.`,
  };
}

module.exports = { PROVIDER_NAMES, validateProviderKey };
