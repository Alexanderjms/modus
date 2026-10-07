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

module.exports = { hasLocalProfile, hasProfile };
