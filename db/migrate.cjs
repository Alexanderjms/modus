"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { loadConfig, run, query, splitStatements } = require("./lib.cjs");

async function tables(config) {
  const result = await query(
    config,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return result.rows.map((row) => row[0]);
}

async function main() {
  const config = loadConfig();
  const statements = splitStatements(
    fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"),
  ).map((sql) => ({ sql }));

  const before = await tables(config);
  console.log(`Tablas antes: ${before.length ? before.join(", ") : "(ninguna)"}`);

  await run(config, statements);
  console.log(`Sentencias aplicadas: ${statements.length}`);

  const after = await tables(config);
  console.log(`Tablas después: ${after.join(", ")}`);

  for (const table of after) {
    const cols = await query(config, `SELECT name FROM pragma_table_info('${table}')`);
    const fks = await query(config, `SELECT * FROM pragma_foreign_key_list('${table}')`);
    const fkText = fks.rows.map((r) => `${r[3]} → ${r[2]}.${r[4]}`).join(", ");
    console.log(`- ${table}(${cols.rows.map((r) => r[0]).join(", ")})`);
    if (fkText) console.log(`  FK: ${fkText}`);
  }

  for (const [table, names] of [
    ["prioridades", ["Alta", "Media", "Baja", "Sin prioridad"]],
    ["estados", ["Pendiente", "En curso", "Completada", "Bloqueada", "Cancelada"]],
  ]) {
    const rows = await query(config, `SELECT nombre FROM ${table} ORDER BY id`);
    const found = rows.rows.map((r) => r[0]);
    const missing = names.filter((n) => !found.includes(n));
    console.log(
      `Catálogo ${table}: ${found.join(", ")}${missing.length ? ` (FALTAN: ${missing.join(", ")})` : ""}`,
    );
  }
}

main().catch((error) => {
  console.error(`Migración fallida: ${error.message}`);
  process.exitCode = 1;
});
