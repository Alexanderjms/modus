"use strict";

const fs = require("node:fs");
const path = require("node:path");

function localDir() {
  if (process.env.MODUS_DATA_DIR) return process.env.MODUS_DATA_DIR;
  const cwd = process.cwd();
  const root = fs.existsSync(path.join(cwd, "package.json")) ? cwd : path.resolve(__dirname, "../..");
  return path.join(root, ".local");
}

const storageFile = () => path.join(localDir(), "storage.json");
const tursoFile = () => path.join(localDir(), "turso.json");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 });
}

function getStorageMode() {
  const forced = process.env.MODUS_STORAGE;
  if (forced === "local" || forced === "turso") return forced;
  const mode = readJson(storageFile())?.mode;
  return mode === "local" || mode === "turso" ? mode : null;
}

function setStorageMode(mode) {
  if (mode !== "local" && mode !== "turso") throw new TypeError("Modo de almacenamiento inválido.");
  writeJson(storageFile(), { mode });
}

function signOut() {
  const saved = readJson(storageFile())?.mode;
  writeJson(storageFile(), { mode: saved === "turso" ? "turso" : "local", signedOut: true });
}

function isSignedOut() {
  return readJson(storageFile())?.signedOut === true;
}

function normalizeTursoUrl(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 300) return null;
  try {
    const parsed = new URL(text.replace(/^(libsql|wss|ws):\/\//, "https://"));
    if (parsed.protocol !== "https:" || !parsed.hostname.includes(".")) return null;
    return `libsql://${parsed.host}`;
  } catch {
    return null;
  }
}

async function saveTursoConfig({ url, token }) {
  const { isDpapiAvailable, encryptWithDpapi } = require("./credentials.cjs");
  const record = { url };
  if (isDpapiAvailable()) {
    record.tokenEnc = await encryptWithDpapi(token);
    record.enc = "dpapi";
  } else {
    record.token = token;
    record.enc = "plain";
  }
  writeJson(tursoFile(), record);
  delete globalThis.__modusTursoConfig;
}

function loadTursoConfig() {
  const cached = globalThis.__modusTursoConfig;
  if (cached) return cached;
  const record = readJson(tursoFile());
  let config = null;
  if (record?.url) {
    if (record.enc === "dpapi" && record.tokenEnc) {
      const { decryptWithDpapiSync } = require("./credentials.cjs");
      config = { url: record.url, token: decryptWithDpapiSync(record.tokenEnc) };
    } else if (record.token) {
      config = { url: record.url, token: record.token };
    }
  }
  if (!config && process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    config = { url: process.env.TURSO_DATABASE_URL, token: process.env.TURSO_AUTH_TOKEN };
  }
  if (config) globalThis.__modusTursoConfig = config;
  return config;
}

module.exports = { getStorageMode, setStorageMode, signOut, isSignedOut, normalizeTursoUrl, saveTursoConfig, loadTursoConfig };
