"use strict";

const { ensureProvidersTable, MAX_KEY_LENGTH } = require("./providers.cjs");
const { isDpapiAvailable, encryptWithDpapi, decryptWithDpapi } = require("./credentials.cjs");

function readTavilyRecord(db, userId) {
  ensureProvidersTable(db);
  return db.prepare("SELECT clave_cifrada, fecha_actualizacion FROM proveedor_claves WHERE usuario_id = ? AND proveedor = 'tavily'").get(userId) ?? null;
}

function getTavilyStatus(db, userId) {
  const record = readTavilyRecord(db, userId);
  const source = record ? "saved" : process.env.TAVILY_API_KEY?.trim() ? "environment" : null;
  return {
    configured: source !== null,
    source,
    storageAvailable: isDpapiAvailable(),
    updatedAt: record?.fecha_actualizacion ?? null,
  };
}

function validTavilyKey(value) {
  return typeof value === "string" && value.length <= MAX_KEY_LENGTH && /^[\x21-\x7e]+$/.test(value.trim());
}

async function validateTavilyKey(key, signal) {
  if (!validTavilyKey(key)) return { ok: false, status: 400, error: "Introduce una API key válida de Tavily, sin espacios y de hasta 4096 caracteres." };
  try {
    const response = await fetch("https://api.tavily.com/usage", {
      headers: { Authorization: `Bearer ${key.trim()}` },
      redirect: "error",
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    });
    await response.body?.cancel();
    if (response.status === 200) return { ok: true };
    if (response.status === 401 || response.status === 403) return { ok: false, status: 422, error: "La API key de Tavily no es válida o no tiene permisos." };
    if (response.status === 429) return { ok: false, status: 429, error: "Tavily limitó las solicitudes. Espera un momento antes de reintentar." };
    return { ok: false, status: 502, error: "Tavily no pudo validar la clave. Inténtalo de nuevo más tarde." };
  } catch {
    return { ok: false, status: signal?.aborted ? 499 : 504, error: "No se pudo contactar con Tavily para validar la clave. Comprueba la conexión y vuelve a intentarlo." };
  }
}

async function saveTavilyKey(db, userId, key, signal, authorize = () => true) {
  if (!isDpapiAvailable()) return { ok: false, status: 501, error: "El almacenamiento seguro de claves requiere Windows DPAPI." };
  const validation = await validateTavilyKey(key, signal);
  if (!validation.ok) return validation;
  const encrypted = await encryptWithDpapi(key.trim());
  signal?.throwIfAborted();
  if (!authorize()) return { ok: false, status: 401, error: "La sesión se cerró durante la validación. Desbloquea tu perfil e inténtalo de nuevo." };
  ensureProvidersTable(db);
  db.prepare(`INSERT INTO proveedor_claves (usuario_id, proveedor, clave_cifrada, fecha_actualizacion)
    VALUES (?, 'tavily', ?, ?)
    ON CONFLICT(usuario_id, proveedor) DO UPDATE SET clave_cifrada = excluded.clave_cifrada, fecha_actualizacion = excluded.fecha_actualizacion`)
    .run(userId, encrypted, new Date().toISOString());
  return { ok: true };
}

async function getTavilyKey(db, userId) {
  const record = readTavilyRecord(db, userId);
  return record ? await decryptWithDpapi(record.clave_cifrada) : process.env.TAVILY_API_KEY?.trim() || null;
}

function removeTavilyKey(db, userId) {
  ensureProvidersTable(db);
  db.prepare("DELETE FROM proveedor_claves WHERE usuario_id = ? AND proveedor = 'tavily'").run(userId);
}

module.exports = { readTavilyRecord, getTavilyStatus, validTavilyKey, validateTavilyKey, saveTavilyKey, getTavilyKey, removeTavilyKey };
