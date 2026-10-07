"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const { getDatabase, getDefaultDbPath } = require("./db.cjs");
const { hashPin, isValidPinFormat, verifyPin } = require("./pin.cjs");

const UNLOCK_COOKIE = "modus-unlock";
const MAX_PIN_LENGTH = 12;
const FREE_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 30_000;
const MAX_LOCKOUT_MS = 15 * 60_000;

// Las sesiones viven en memoria: al reiniciar la app se vuelve a pedir el PIN.
const state = (globalThis.__modusPinLock ??= { sessions: new Set(), failures: 0, lockedUntil: 0 });

function readPinHash() {
  const dbPath = process.env.MODUS_SQLITE_PATH || getDefaultDbPath();
  if (!fs.existsSync(dbPath)) return null;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'usuarios'").get();
    if (!table) return null;
    const row = db.prepare("SELECT pin_hash FROM usuarios ORDER BY id LIMIT 1").get();
    return row && typeof row.pin_hash === "string" && row.pin_hash ? row.pin_hash : null;
  } finally {
    db.close();
  }
}

function hasPin() {
  return readPinHash() !== null;
}

function isUnlocked(token) {
  return typeof token === "string" && state.sessions.has(token);
}

function lockoutSeconds() {
  const remaining = state.lockedUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

function registerFailure() {
  state.failures += 1;
  if (state.failures >= FREE_ATTEMPTS) {
    const delay = Math.min(BASE_LOCKOUT_MS * 2 ** (state.failures - FREE_ATTEMPTS), MAX_LOCKOUT_MS);
    state.lockedUntil = Date.now() + delay;
  }
}

function checkPin(pin, hash) {
  const wait = lockoutSeconds();
  if (wait > 0) return { ok: false, retryAfter: wait };
  if (!isValidPinFormat(pin) || pin.length > MAX_PIN_LENGTH || !verifyPin(pin, hash)) {
    registerFailure();
    return { ok: false, retryAfter: lockoutSeconds() };
  }
  state.failures = 0;
  return { ok: true };
}

/** @returns {{ ok: true, token: string } | { ok: false, retryAfter: number }} */
function unlock(pin) {
  const hash = readPinHash();
  if (hash) {
    const result = checkPin(pin, hash);
    if (!result.ok) return result;
  }
  const token = crypto.randomBytes(32).toString("hex");
  state.sessions.add(token);
  return { ok: true, token };
}

/**
 * Configura, cambia o quita el PIN del perfil local. Si ya hay uno, exige el actual.
 * @returns {{ ok: true } | { ok: false, status: number, error: string, retryAfter?: number }}
 */
function changePin({ currentPin, newPin }) {
  if (newPin !== null && (!isValidPinFormat(newPin) || newPin.length < 4 || newPin.length > MAX_PIN_LENGTH)) {
    return { ok: false, status: 400, error: `El PIN debe tener entre 4 y ${MAX_PIN_LENGTH} dígitos.` };
  }
  const db = getDatabase();
  try {
    const user = db.prepare("SELECT id, pin_hash FROM usuarios ORDER BY id LIMIT 1").get();
    if (!user) return { ok: false, status: 404, error: "No hay un perfil local configurado." };
    if (user.pin_hash) {
      const result = checkPin(currentPin, user.pin_hash);
      if (!result.ok) {
        return result.retryAfter
          ? { ok: false, status: 429, error: "Demasiados intentos. Espera antes de volver a probar.", retryAfter: result.retryAfter }
          : { ok: false, status: 403, error: "El PIN actual no es correcto." };
      }
    } else if (newPin === null) {
      return { ok: true };
    }
    db.prepare("UPDATE usuarios SET pin_hash = ? WHERE id = ?").run(newPin === null ? null : hashPin(newPin), user.id);
    return { ok: true };
  } finally {
    db.close();
  }
}

module.exports = { UNLOCK_COOKIE, hasPin, isUnlocked, unlock, changePin };
