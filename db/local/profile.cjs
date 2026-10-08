"use strict";

const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const { getDefaultDbPath } = require("./db.cjs");

function hasLocalProfile(customPath) {
  const dbPath = customPath || process.env.MODUS_SQLITE_PATH || getDefaultDbPath();
  if (!fs.existsSync(dbPath)) return false;

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'usuarios'").get();
    return Boolean(table && db.prepare("SELECT 1 FROM usuarios LIMIT 1").get());
  } finally {
    db.close();
  }
}

function hasProfile() {
  const { getStorageMode } = require("./storage.cjs");
  if (getStorageMode() !== "turso") return hasLocalProfile();
  const { getDatabase } = require("./db.cjs");
  let db;
  try {
    db = getDatabase();
    return Boolean(db.prepare("SELECT 1 AS found FROM usuarios LIMIT 1").get());
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

function openLocalDb(readOnly) {
  const dbPath = process.env.MODUS_SQLITE_PATH || getDefaultDbPath();
  if (!fs.existsSync(dbPath)) return null;
  return new DatabaseSync(dbPath, { readOnly });
}

function getLocalProfileName() {
  const db = openLocalDb(true);
  if (!db) return null;
  try {
    const row = db.prepare("SELECT nombre FROM usuarios ORDER BY id LIMIT 1").get();
    return row ? String(row.nombre) : null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function updateLocalProfileName(name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || trimmed.length > 100) return { ok: false, status: 400, error: "El nombre debe tener entre 1 y 100 caracteres." };
  const db = openLocalDb(false);
  if (!db) return { ok: false, status: 404, error: "No hay un perfil local configurado." };
  try {
    const info = db.prepare("UPDATE usuarios SET nombre = ? WHERE id = (SELECT id FROM usuarios ORDER BY id LIMIT 1)").run(trimmed);
    return info.changes ? { ok: true } : { ok: false, status: 404, error: "No hay un perfil local configurado." };
  } finally {
    db.close();
  }
}

function tursoHasProfile() {
  const { loadTursoConfig } = require("./storage.cjs");
  const { PENDING_PASSWORD } = require("../password.cjs");
  const config = loadTursoConfig();
  if (!config) return false;
  let db;
  try {
    db = require("../cloud/turso-db.cjs").openTurso(config);
    return Boolean(db.prepare("SELECT 1 AS found FROM usuarios WHERE contrasena <> ? LIMIT 1").get(PENDING_PASSWORD));
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

module.exports = { hasLocalProfile, hasProfile, getLocalProfileName, updateLocalProfileName, tursoHasProfile };
