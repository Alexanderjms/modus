"use strict";

const fs = require("node:fs");
const { getDatabase, getSchemaPath, getDefaultDbPath } = require("./db.cjs");

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
        "Esquema incompatible detectado en 'usuarios': la tabla existente contiene correo/contrasena en vez de pin_hash."
      );
    }
  }
}

function applySchema(db) {
  const sqlContent = fs.readFileSync(getSchemaPath(), "utf8");
  inspectCompatibility(db);
  db.exec("BEGIN TRANSACTION;");
  try {
    db.exec(sqlContent);
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

function migrate(customPath) {
  const db = getDatabase(customPath);
  try {
    const beforeTables = getTableList(db);
    applySchema(db);
    const afterTables = getTableList(db);
    return {
      db,
      beforeTables,
      afterTables,
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

module.exports = {
  migrate,
  applySchema,
  getTableList,
  getTableColumns,
  inspectCompatibility,
};

if (require.main === module) {
  try {
    const targetPath = process.env.MODUS_SQLITE_PATH || getDefaultDbPath();
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
