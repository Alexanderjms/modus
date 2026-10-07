"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const { getDatabase, getDefaultDbPath } = require("./db.cjs");
const { hashPin, isValidPinFormat, verifyPin } = require("./pin.cjs");
const { hashPassword, verifyPassword } = require("../password.cjs");

const UNLOCK_COOKIE = "modus-unlock";
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;
const MAX_PIN_LENGTH = 12;
const FREE_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 30_000;
const MAX_LOCKOUT_MS = 15 * 60_000;

const state = (globalThis.__modusPinLock ??= {
  sessions: new Set(),
  users: new Map(),
  failures: 0,
  lockedUntil: 0,
});

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

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  state.sessions.add(token);
  if (userId != null) {
    state.users.set(token, userId);
    state.lastUserId = userId;
  }
  return token;
}

function getSessionUserId(token) {
  return typeof token === "string" ? state.users.get(token) ?? null : null;
}

function getCloudUserId() {
  return state.lastUserId ?? null;
}

function endSession(token) {
  if (typeof token === "string") {
    const userId = state.users.get(token);
    state.sessions.delete(token);
    state.users.delete(token);
    if (userId != null && state.lastUserId === userId && ![...state.users.values()].includes(userId)) state.lastUserId = null;
  }
}

function lockKind() {
  const { getStorageMode } = require("./storage.cjs");
  if (getStorageMode() === "turso") {
    return "password";
  }
  return hasPin() ? "pin" : null;
}

function unlock(payload) {
  const { pin, username, password } = payload || {};
  const { getStorageMode } = require("./storage.cjs");
  if (getStorageMode() === "turso") {
    const wait = lockoutSeconds();
    if (wait > 0) return { ok: false, retryAfter: wait };
    if (!username || !password) {
      registerFailure();
      return { ok: false, retryAfter: lockoutSeconds() };
    }
    const db = getDatabase();
    try {
      const user = db.prepare("SELECT id, contrasena FROM usuarios WHERE usuario = ? COLLATE NOCASE").get(username.trim());
      if (!user || !verifyPassword(password, user.contrasena)) {
        registerFailure();
        return { ok: false, retryAfter: lockoutSeconds() };
      }
      state.failures = 0;
      const token = createSession(user.id);
      return { ok: true, token };
    } finally {
      db.close();
    }
  }

  const hash = readPinHash();
  if (hash) {
    const result = checkPin(pin, hash);
    if (!result.ok) return result;
  }
  state.failures = 0;
  const token = createSession();
  return { ok: true, token };
}

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

function getCloudProfile(userId) {
  const db = getDatabase();
  try {
    const user = userId
      ? db.prepare("SELECT id, usuario FROM usuarios WHERE id = ?").get(userId)
      : db.prepare("SELECT id, usuario FROM usuarios ORDER BY id LIMIT 1").get();
    if (!user) return null;
    return { id: user.id, username: user.usuario };
  } finally {
    db.close();
  }
}

function updateCloudProfile({ userId, username, newPassword }) {
  if (typeof username !== "string" || !USERNAME_REGEX.test(username.trim())) {
    return { ok: false, status: 400, error: "El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo." };
  }
  const cleanUsername = username.trim();
  const db = getDatabase();
  try {
    const user = userId
      ? db.prepare("SELECT id, usuario, contrasena FROM usuarios WHERE id = ?").get(userId)
      : db.prepare("SELECT id, usuario, contrasena FROM usuarios ORDER BY id LIMIT 1").get();
    if (!user) {
      return { ok: false, status: 404, error: "No se encontró el usuario en Turso." };
    }
    if (newPassword) {
      if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 200) {
        return { ok: false, status: 400, error: "La nueva contraseña debe tener entre 8 y 200 caracteres." };
      }
      const newHash = hashPassword(newPassword);
      db.prepare("UPDATE usuarios SET usuario = ?, contrasena = ? WHERE id = ?").run(cleanUsername, newHash, user.id);
    } else {
      db.prepare("UPDATE usuarios SET usuario = ? WHERE id = ?").run(cleanUsername, user.id);
    }
    return { ok: true };
  } finally {
    db.close();
  }
}

module.exports = {
  UNLOCK_COOKIE,
  USERNAME_REGEX,
  hasPin,
  isUnlocked,
  lockKind,
  createSession,
  endSession,
  unlock,
  changePin,
  getCloudProfile,
  updateCloudProfile,
  getSessionUserId,
  getCloudUserId,
};
