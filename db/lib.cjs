"use strict";

function loadConfig(env = process.env) {
  const url = env.TURSO_DATABASE_URL;
  const token = env.TURSO_AUTH_TOKEN;
  if (!url || !token) {
    throw new Error("Faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN en el entorno.");
  }
  const endpoint = new URL(url.replace(/^(libsql|wss):\/\//, "https://"));
  if (endpoint.protocol !== "https:") throw new Error("Turso requiere HTTPS o libsql://.");
  endpoint.pathname = "/v2/pipeline";
  endpoint.search = "";
  return { endpoint: endpoint.toString(), token };
}

function encodeArg(value) {
  if (value === null || value === undefined) return { type: "null" };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { type: "integer", value: String(value) }
      : { type: "float", value };
  }
  if (typeof value === "boolean") return { type: "integer", value: value ? "1" : "0" };
  return { type: "text", value: String(value) };
}

function decodeValue(cell) {
  if (cell == null || cell.type === "null") return null;
  if (cell.type === "integer" || cell.type === "float") return Number(cell.value);
  return cell.value;
}

async function runRaw(config, statements) {
  const requests = [{ type: "execute", stmt: { sql: "PRAGMA foreign_keys=ON", args: [] } }, ...statements.map((s) => ({
    type: "execute",
    stmt: { sql: s.sql, args: (s.args || []).map(encodeArg) },
  }))];
  requests.push({ type: "close" });

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Turso HTTP ${response.status} ${response.statusText}`);
  }
  const body = await response.json();
  if (body.error) {
    throw new Error(`Turso: ${body.error.message || JSON.stringify(body.error)}`);
  }
  if (body.results?.length !== requests.length) throw new Error("Respuesta incompleta de Turso.");
  if (body.results[0].type !== "ok") throw new Error("No se pudieron activar las claves foráneas.");
  return body.results.slice(1)
    .filter((r) => r.response?.type === "execute" || r.type === "error")
    .map((r) => {
      if (r.type !== "ok" || r.response?.type !== "execute") {
        return { error: r.error || { message: "respuesta inesperada" } };
      }
      const result = r.response.result || {};
      return {
        cols: (result.cols || []).map((c) => c.name),
        rows: (result.rows || []).map((row) => row.map(decodeValue)),
        affected: result.affected_row_count ?? 0,
      };
    });
}

async function run(config, statements) {
  const results = await runRaw(config, statements);
  const failed = results.findIndex((r) => r.error);
  if (failed !== -1) {
    throw new Error(`Sentencia ${failed + 1} falló: ${results[failed].error.message}`);
  }
  return results;
}

async function query(config, sql, args) {
  const [result] = await run(config, [{ sql, args }]);
  return result || { cols: [], rows: [], affected: 0 };
}

function splitStatements(sqlText) {
  return sqlText
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

module.exports = { loadConfig, run, runRaw, query, splitStatements };
