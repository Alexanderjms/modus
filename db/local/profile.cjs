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

module.exports = { hasLocalProfile };
