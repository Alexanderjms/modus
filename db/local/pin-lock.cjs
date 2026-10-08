"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { getDatabase, getDefaultDbPath, getDataDir } = require("./db.cjs");
const { hashPin, isValidPinFormat, verifyPin } = require("./pin.cjs");
const { hashPassword, verifyPassword } = require("../password.cjs");

const UNLOCK_COOKIE = "modus-unlock";
const SESSION_MAX_AGE = 180 * 24 * 60 * 60;
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

const tokenKey = (token) => crypto.createHash("sha256").update(token).digest("hex");
const sessionsFile = () => path.join(getDataDir(), "sessions.json");

// Las sesiones se guardan en disco (solo el hash del token) para que reiniciar la app no pida acceso otra vez.
function loadSessions() {
  if (state.loaded) return;
  state.loaded = true;
  state.created ??= new Map();
  try {
    const saved = JSON.parse(fs.readFileSync(sessionsFile(), "utf8"));
    const now = Date.now();
    for (const [key, entry] of Object.entries(saved)) {
      if (!entry || now - entry.createdAt > SESSION_MAX_AGE * 1000) continue;
      state.sessions.add(key);
      state.created.set(key, entry.createdAt);
      if (entry.userId != null) {
        state.users.set(key, entry.userId);
        state.lastUserId = entry.userId;
      }
    }
  } catch {}
}

function saveSessions() {
  const saved = {};
  for (const key of state.sessions) saved[key] = { userId: state.users.get(key) ?? null, createdAt: state.created.get(key) ?? Date.now() };
  try {
    fs.mkdirSync(path.dirname(sessionsFile()), { recursive: true });
    fs.writeFileSync(sessionsFile(), JSON.stringify(saved), { mode: 0o600 });
  } catch {}
}

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
  loadSessions();
  return typeof token === "string" && state.sessions.has(tokenKey(token));
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
  loadSessions();
  const token = crypto.randomBytes(32).toString("hex");
  const key = tokenKey(token);
  state.sessions.add(key);
  state.created.set(key, Date.now());
  if (userId != null) {
    state.users.set(key, userId);
    state.lastUserId = userId;
  }
  saveSessions();
  return token;
}

function getSessionUserId(token) {
  loadSessions();
  return typeof token === "string" ? state.users.get(tokenKey(token)) ?? null : null;
}

function getCloudUserId() {
  loadSessions();
  return state.lastUserId ?? null;
}

function endSession(token) {
  loadSessions();
  if (typeof token === "string") {
    const key = tokenKey(token);
    const userId = state.users.get(key);
    state.sessions.delete(key);
    state.users.delete(key);
    state.created.delete(key);
    if (userId != null && state.lastUserId === userId && ![...state.users.values()].includes(userId)) state.lastUserId = null;
    saveSessions();
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
  SESSION_MAX_AGE,
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
