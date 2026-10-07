"use strict";

const { workerData } = require("node:worker_threads");

const { port, sab } = workerData;
const flag = new Int32Array(sab);
const connections = new Map();
let nextId = 1;
const REQUEST_TIMEOUT_MS = 30000;
const fkPragma = (conn) => ({ type: "execute", stmt: { sql: `PRAGMA foreign_keys=${conn.fk ? "ON" : "OFF"}`, args: [] } });

function encodeArg(value) {
  if (value === null || value === undefined) return { type: "null" };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { type: "integer", value: String(value) } : { type: "float", value };
  }
  if (typeof value === "bigint") return { type: "integer", value: value.toString() };
  if (typeof value === "boolean") return { type: "integer", value: value ? "1" : "0" };
  if (value instanceof Uint8Array) return { type: "blob", base64: Buffer.from(value).toString("base64") };
  return { type: "text", value: String(value) };
}

function decodeCell(cell) {
  if (cell == null || cell.type === "null") return null;
  if (cell.type === "integer") return Number(cell.value);
  if (cell.type === "float") return Number(cell.value);
  if (cell.type === "blob") return Buffer.from(cell.base64 ?? "", "base64");
  return cell.value;
}

function endpointFor(url) {
  const endpoint = new URL(String(url).replace(/^(libsql|wss|ws):\/\//, "https://"));
  if (endpoint.protocol !== "https:") throw new Error("Turso requiere HTTPS o libsql://.");
  endpoint.pathname = "/v2/pipeline";
  endpoint.search = "";
  return endpoint.toString();
}

async function post(conn, requests) {
  const response = await fetch(conn.endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...(conn.baton ? { baton: conn.baton } : {}), requests }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(`Turso HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    error.status = response.status;
    throw error;
  }
  const body = await response.json();
  if (body.error) throw new Error(`Turso: ${body.error.message || JSON.stringify(body.error)}`);
  if (body.base_url) {
    const base = new URL(body.base_url);
    base.pathname = "/v2/pipeline";
    conn.endpoint = base.toString();
  }
  return body;
}

async function run(conn, kind, sql, args) {
  const keepOpen = conn.inTx || /^\s*(begin|savepoint)\b/i.test(sql);
  const build = () => {
    const requests = [];
    if (!conn.baton) requests.push(fkPragma(conn));
    const executeIndex = requests.length;
    requests.push(
      kind === "sequence"
        ? { type: "sequence", sql }
        : { type: "execute", stmt: { sql, args: (args || []).map(encodeArg), want_rows: true } },
    );
    requests.push({ type: "get_autocommit" });
    if (!keepOpen) requests.push({ type: "close" });
    return { requests, executeIndex };
  };

  let attempt = build();
  let body;
  try {
    body = await post(conn, attempt.requests);
  } catch (error) {
    if (conn.baton && !conn.inTx && error.status && error.status >= 400) {
      conn.baton = null;
      attempt = build();
      body = await post(conn, attempt.requests);
    } else {
      throw error;
    }
  }

  const fkResult = attempt.executeIndex === 1 ? body.results[0] : null;
  if (fkResult && fkResult.type === "error") throw new Error(`Turso: ${fkResult.error?.message || "PRAGMA falló"}`);
  const main = body.results[attempt.executeIndex];
  const autocommit = body.results[attempt.executeIndex + 1];
  conn.baton = keepOpen ? body.baton || null : null;
  conn.inTx = keepOpen && autocommit?.type === "ok" ? autocommit.response?.is_autocommit === false : false;
  if (!main || main.type === "error") {
    const error = new Error(main?.error?.message || "Respuesta inesperada de Turso");
    error.code = main?.error?.code;
    throw error;
  }
  if (kind === "sequence") return { rows: [], changes: 0, lastInsertRowid: 0, inTx: conn.inTx };
  const result = main.response?.result || {};
  const cols = (result.cols || []).map((col) => col.name);
  const rows = (result.rows || []).map((row) => {
    const object = {};
    row.forEach((cell, index) => { object[cols[index]] = decodeCell(cell); });
    return object;
  });
  return {
    rows,
    changes: Number(result.affected_row_count ?? 0),
    lastInsertRowid: Number(result.last_insert_rowid ?? 0),
    inTx: conn.inTx,
  };
}

async function handle(message) {
  switch (message.op) {
    case "open": {
      const id = nextId++;
      connections.set(id, {
        endpoint: endpointFor(message.config.url),
        token: message.config.token,
        baton: null,
        inTx: false,
        fk: true,
      });
      return { id };
    }
    case "fk": {
      const conn = connections.get(message.id);
      if (!conn) throw new Error("La conexión con Turso está cerrada.");
      if (conn.baton) {
        try {
          await post(conn, [{ type: "close" }]);
        } catch {}
        conn.baton = null;
        conn.inTx = false;
      }
      conn.fk = message.enabled !== false;
      return {};
    }
    case "execute":
    case "sequence": {
      const conn = connections.get(message.id);
      if (!conn) throw new Error("La conexión con Turso está cerrada.");
      return run(conn, message.op, message.sql, message.args);
    }
    case "close": {
      const conn = connections.get(message.id);
      connections.delete(message.id);
      if (conn?.baton) {
        try {
          await post(conn, [{ type: "close" }]);
        } catch {}
      }
      return {};
    }
    default:
      throw new Error("Operación desconocida");
  }
}

port.on("message", async (message) => {
  let reply;
  try {
    reply = { result: await handle(message) };
  } catch (error) {
    reply = { error: { message: error instanceof Error ? error.message : String(error), code: error?.code } };
  }
  port.postMessage(reply);
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
});
