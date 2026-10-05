"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_DB_PATH = path.join(PROJECT_ROOT, ".local", "modus.sqlite");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

function getDatabase(customPath) {
  const dbPath = customPath || process.env.MODUS_SQLITE_PATH || DEFAULT_DB_PATH;

  if (dbPath !== ":memory:") {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

module.exports = {
  PROJECT_ROOT,
  DEFAULT_DB_PATH,
  SCHEMA_PATH,
  getDatabase,
};
