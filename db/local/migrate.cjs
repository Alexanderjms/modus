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

function migrateSubtasksSchema(db) {
  const existingTables = getTableList(db);
  if (!existingTables.includes("subtareas")) {
    return false;
  }

  const cols = getTableColumns(db, "subtareas").map((c) => c.name);
  const hasDescripcion = cols.includes("descripcion");
  const hasEstadoId = cols.includes("estado_id");
  const hasCompletada = cols.includes("completada");

  // Si ya no tiene columnas obsoletas y tiene completada, no hacer nada
  if (!hasDescripcion && !hasEstadoId && hasCompletada) {
    return false;
  }

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Crear tabla temporal con el nuevo esquema
    db.exec(`
      CREATE TABLE subtareas_nueva (
        id INTEGER PRIMARY KEY,
        tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
        nombre TEXT NOT NULL,
        completada INTEGER NOT NULL DEFAULT 0 CHECK(completada IN (0, 1))
      );
    `);

    // 2. Determinar expresión para completada:
    // Si ya existe la columna 'completada', preservarla.
    // Si no existe pero hay 'estado_id', intentar mapear si el estado asociado es 'completada'.
    // En caso contrario, default 0.
    let completadaExpr = "0";
    if (hasCompletada) {
      completadaExpr = "COALESCE(st.completada, 0)";
    } else if (hasEstadoId && existingTables.includes("estados")) {
      completadaExpr = `CASE 
        WHEN LOWER(TRIM(COALESCE(e.nombre, ''))) = 'completada' THEN 1 
        ELSE 0 
      END`;
    }

    if (hasEstadoId && existingTables.includes("estados") && !hasCompletada) {
      db.exec(`
        INSERT INTO subtareas_nueva (id, tarea_id, nombre, completada)
        SELECT 
          st.id, 
          st.tarea_id, 
          st.nombre,
          ${completadaExpr} AS completada
        FROM subtareas st
        LEFT JOIN estados e ON e.id = st.estado_id;
      `);
    } else {
      db.exec(`
        INSERT INTO subtareas_nueva (id, tarea_id, nombre, completada)
        SELECT 
          st.id, 
          st.tarea_id, 
          st.nombre,
          ${completadaExpr} AS completada
        FROM subtareas st;
      `);
    }

    // 3. Sustituir tabla antigua
    db.exec("DROP TABLE subtareas;");
    db.exec("ALTER TABLE subtareas_nueva RENAME TO subtareas;");

    // 4. Recrear índices y verificar FKs
    db.exec("CREATE INDEX IF NOT EXISTS idx_subtareas_tarea ON subtareas(tarea_id);");

    db.exec("COMMIT;");
    return true;
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

function applySchema(db, options = {}) {
  const sqlContent = fs.readFileSync(getSchemaPath(), "utf8");
  inspectCompatibility(db);
  db.exec("BEGIN TRANSACTION;");
  try {
    // Si la tabla tareas ya existe de una versión anterior sin 'posicion',
    // agregar la columna antes de ejecutar el schema.sql para que índices
    // dependientes de 'posicion' no fallen con 'no such column'.
    const existingTables = getTableList(db);
    if (existingTables.includes("tareas")) {
      const tareasCols = getTableColumns(db, "tareas").map((c) => c.name);
      if (!tareasCols.includes("posicion")) {
        db.exec("ALTER TABLE tareas ADD COLUMN posicion INTEGER NOT NULL DEFAULT 0;");
      }
    }

    // Si la tabla subtareas ya existe de una versión anterior sin 'completada',
    // agregar la columna aditivamente para garantizar compatibilidad sin destruir datos.
    if (existingTables.includes("subtareas")) {
      const subtareasCols = getTableColumns(db, "subtareas").map((c) => c.name);
      if (!subtareasCols.includes("completada")) {
        db.exec("ALTER TABLE subtareas ADD COLUMN completada INTEGER NOT NULL DEFAULT 0 CHECK(completada IN (0, 1));");

        // Inicializar completada a 1 si existía estado_id y el estado asociado normalizado es 'completada'
        if (subtareasCols.includes("estado_id") && existingTables.includes("estados")) {
          db.exec(`
            UPDATE subtareas
            SET completada = 1
            WHERE estado_id IN (
              SELECT id FROM estados WHERE LOWER(TRIM(nombre)) = 'completada'
            );
          `);
        }
      }
    }

    // Si la tabla etiquetas ya existe de una versión anterior sin 'color',
    // agregar la columna aditivamente para garantizar compatibilidad sin destruir datos.
    if (existingTables.includes("etiquetas")) {
      const etiquetasCols = getTableColumns(db, "etiquetas").map((c) => c.name);
      if (!etiquetasCols.includes("color")) {
        db.exec("ALTER TABLE etiquetas ADD COLUMN color TEXT;");
      }
    }

    db.exec(sqlContent);

    // Asegurar índice por si schema.sql no lo tuviera
    db.exec("CREATE INDEX IF NOT EXISTS idx_tareas_lista_posicion ON tareas(lista_id, posicion);");

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  // Migración opt-in explícita de subtareas (sin pérdida accidental en apertura automática)
  if (options && options.migrateSubtasks) {
    migrateSubtasksSchema(db);
  }
}

function migrate(customPath, options = {}) {
  const db = getDatabase(customPath);
  try {
    const beforeTables = getTableList(db);
    applySchema(db, options);
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
  migrateSubtasksSchema,
  getTableList,
  getTableColumns,
  inspectCompatibility,
};

if (require.main === module) {
  try {
    const targetPath = process.env.MODUS_SQLITE_PATH || getDefaultDbPath();
    const shouldMigrateSubtasks = process.argv.includes("--migrate-subtasks");
    console.log(`Iniciando migración local en: ${targetPath}`);
    if (shouldMigrateSubtasks) {
      console.log("Opt-in detectado: migrando tabla subtareas a nuevo esquema (solo id, tarea_id, nombre)...");
    }
    const result = migrate(undefined, { migrateSubtasks: shouldMigrateSubtasks });
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
