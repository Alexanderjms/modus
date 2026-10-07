"use strict";

process.env.MODUS_STORAGE = "turso";

const { getDatabase } = require("./local/db.cjs");
const { applySchema, getTableList, getTableColumns } = require("./local/migrate.cjs");

function main() {
  const db = getDatabase();
  try {
    const before = getTableList(db);
    console.log(`Tablas antes: ${before.length ? before.join(", ") : "(ninguna)"}`);
    applySchema(db);
    const after = getTableList(db);
    console.log(`Tablas después: ${after.join(", ")}`);
    for (const table of after) {
      console.log(`- ${table}(${getTableColumns(db, table).map((column) => column.name).join(", ")})`);
    }
    for (const table of ["prioridades", "estados"]) {
      const rows = db.prepare(`SELECT nombre FROM ${table} ORDER BY id`).all();
      console.log(`Catálogo ${table}: ${rows.map((row) => row.nombre).join(", ")}`);
    }
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  console.error(`Migración fallida: ${error.message}`);
  process.exitCode = 1;
}
