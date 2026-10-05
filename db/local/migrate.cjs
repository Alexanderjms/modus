"use strict";

const fs = require("node:fs");
const { getDatabase, SCHEMA_PATH } = require("./db.cjs");

function getTableList(db) {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();
  return rows.map((r) => r.name);
}

function getTableColumns(db, tableName) {
  const rows = db.prepare(`SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info('${tableName}')`).all();
  return rows;
}

function inspectCompatibility(db) {
  const existingTables = getTableList(db);
  if (existingTables.includes("usuarios")) {
    const cols = getTableColumns(db, "usuarios").map((c) => c.name);
    const hasPinHash = cols.includes("pin_hash");
    const hasCorreo = cols.includes("correo");
    const hasContrasena = cols.includes("contrasena");
    if (!hasPinHash && (hasCorreo || hasContrasena)) {
      throw new Error(
        "Esquema incompatible detectado en 'usuarios': la tabla existente parece pertenecer a la base remota Turso (contiene correo/contrasena en vez de pin_hash). Operación abortada para prevenir pérdida o inconsistencia de datos."
      );
    }
  }
}

function migrate(customPath) {
  const db = getDatabase(customPath);
  const sqlContent = fs.readFileSync(SCHEMA_PATH, "utf8");

  inspectCompatibility(db);

  const beforeTables = getTableList(db);

  db.exec("BEGIN TRANSACTION;");
  try {
    db.exec(sqlContent);
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  const afterTables = getTableList(db);

  return {
    db,
    beforeTables,
    afterTables,
  };
}

module.exports = {
  migrate,
  getTableList,
  getTableColumns,
  inspectCompatibility,
};

if (require.main === module) {
  try {
    const targetPath = process.env.MODUS_SQLITE_PATH || require("./db.cjs").DEFAULT_DB_PATH;
    console.log(`Iniciando migración local en: ${targetPath}`);
    const result = migrate();
    console.log(`Tablas antes: ${result.beforeTables.length ? result.beforeTables.join(", ") : "(ninguna)"}`);
    console.log(`Tablas después: ${result.afterTables.join(", ")}`);

    for (const table of ["prioridades", "estados"]) {
      const rows = result.db.prepare(`SELECT nombre FROM ${table} ORDER BY id`).all();
      console.log(`Catálogo ${table}: ${rows.map((r) => r.nombre).join(", ")}`);
    }

    result.db.close();
    console.log("Migración local completada con éxito.");
  } catch (error) {
    console.error(`Error en migración local: ${error.message}`);
    process.exitCode = 1;
  }
}
