"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

function getProjectRoot() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "package.json"))) {
    return cwd;
  }
  return path.resolve(__dirname, "../..");
}

function getSchemaPath() {
  const candidateCwd = path.join(process.cwd(), "db", "local", "schema.sql");
  if (fs.existsSync(candidateCwd)) {
    return candidateCwd;
  }
  return path.join(__dirname, "schema.sql");
}

function getDataDir() {
  return process.env.MODUS_DATA_DIR || path.join(getProjectRoot(), ".local");
}

function getDefaultDbPath() {
  return path.join(getDataDir(), "modus.sqlite");
}

function getDatabase(customPath) {
  if (!customPath) {
    const { getStorageMode, loadTursoConfig } = require("./storage.cjs");
    if (getStorageMode() === "turso") {
      const config = loadTursoConfig();
      if (!config) {
        const err = new Error("Faltan las credenciales de Turso.");
        err.code = "TURSO_NOT_CONFIGURED";
        throw err;
      }
      return require("../cloud/turso-db.cjs").openTurso(config);
    }
  }
  const dbPath = customPath || process.env.MODUS_SQLITE_PATH || getDefaultDbPath();

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
  getProjectRoot,
  getDataDir,
  getDefaultDbPath,
  getSchemaPath,
  getDatabase,
};
