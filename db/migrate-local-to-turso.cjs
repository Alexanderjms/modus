"use strict";

const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const { openTurso } = require("./cloud/turso-db.cjs");
const { loadTursoConfig } = require("./local/storage.cjs");
const { applySchema } = require("./local/migrate.cjs");
const { getDefaultDbPath } = require("./local/db.cjs");
const { ensureAttachmentsTable } = require("./local/chat-attachments.cjs");
const { PENDING_PASSWORD } = require("./password.cjs");

const TABLES = [
  "proyectos",
  "listas_tareas",
  "etiquetas",
  "tareas",
  "subtareas",
  "tarea_etiquetas",
  "chats",
  "chat_suggestion_tasks",
  "proyecto_contexto",
  "proyecto_archivos",
  "chat_adjuntos",
  "tarea_completaciones",
  "proveedor_claves",
];

function columnsOf(db, table) {
  return db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map((column) => column.name);
}

function idMapByName(local, remote, table) {
  const byName = new Map(remote.prepare(`SELECT id, nombre FROM ${table}`).all().map((row) => [row.nombre.toLowerCase(), row.id]));
  const map = new Map();
  for (const row of local.prepare(`SELECT id, nombre FROM ${table}`).all()) {
    let remoteId = byName.get(row.nombre.toLowerCase());
    if (!remoteId) {
      remoteId = Number(remote.prepare(`INSERT INTO ${table} (nombre) VALUES (?)`).run(row.nombre).lastInsertRowid);
    }
    map.set(row.id, remoteId);
  }
  return map;
}

function main() {
  const sqlitePath = process.argv[2] || getDefaultDbPath();
  if (!fs.existsSync(sqlitePath)) throw new Error(`No existe la base local: ${sqlitePath}`);
  const config = loadTursoConfig();
  if (!config) throw new Error("Faltan las credenciales de Turso (TURSO_DATABASE_URL y TURSO_AUTH_TOKEN).");

  const local = new DatabaseSync(sqlitePath, { readOnly: true });
  const remote = openTurso(config);
  try {
    applySchema(remote);
    ensureAttachmentsTable(remote);

    const existing = remote.prepare("SELECT COUNT(*) AS n FROM proyectos").get().n;
    if (existing > 0) throw new Error(`Turso ya tiene ${existing} proyecto(s); no se migra para evitar duplicados.`);

    const user = local.prepare("SELECT * FROM usuarios ORDER BY id LIMIT 1").get();
    if (!user) throw new Error("La base local no tiene perfil.");

    remote.exec("BEGIN IMMEDIATE;");
    try {
      const priorities = idMapByName(local, remote, "prioridades");
      const statuses = idMapByName(local, remote, "estados");
      const remoteUsers = remote.prepare("SELECT id, usuario FROM usuarios ORDER BY id").all();
      if (remoteUsers.length > 1) throw new Error("Turso tiene varios usuarios; no se sabe a cuál asignar los datos.");
      let ownerId;
      if (remoteUsers.length === 1) {
        ownerId = remoteUsers[0].id;
        console.log(`  Los datos se asignan al usuario existente "${remoteUsers[0].usuario}".`);
      } else {
        const cleanName = String(user.nombre ?? "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 32);
        ownerId = user.id;
        remote
          .prepare("INSERT INTO usuarios (id, usuario, contrasena, fecha_creacion, ultimo_acceso) VALUES (?, ?, ?, ?, ?)")
          .run(ownerId, cleanName.length >= 3 ? cleanName : `usuario${user.id}`, PENDING_PASSWORD, user.fecha_creacion ?? null, user.ultimo_acceso ?? null);
        console.log("  Se creó un perfil pendiente: define usuario y contraseña al elegir Turso en la app.");
      }

      for (const table of TABLES) {
        const exists = local.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
        if (!exists) continue;
        const columns = columnsOf(remote, table).filter((column) => columnsOf(local, table).includes(column));
        const insert = remote.prepare(
          `INSERT ${table === "proveedor_claves" ? "OR IGNORE " : ""}INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        );
        let copied = 0;
        for (const row of local.prepare(`SELECT * FROM ${table}`).all()) {
          if (table === "tareas") {
            row.prioridad_id = row.prioridad_id == null ? null : priorities.get(row.prioridad_id) ?? null;
            row.estado_id = row.estado_id == null ? null : statuses.get(row.estado_id) ?? null;
          }
          if ("usuario_id" in row) row.usuario_id = ownerId;
          insert.run(...columns.map((column) => row[column] ?? null));
          copied += 1;
        }
        console.log(`  ${table}: ${copied}`);
      }
      remote.exec("COMMIT;");
    } catch (error) {
      try {
        remote.exec("ROLLBACK;");
      } catch {}
      throw error;
    }

    console.log("Verificación (local → Turso):");
    for (const table of ["prioridades", "estados", ...TABLES]) {
      const exists = local.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
      if (!exists) continue;
      const a = local.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      const b = remote.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      console.log(`  ${a === b ? "OK " : "DIF"} ${table}: ${a} → ${b}`);
    }
    const violations = remote.prepare("PRAGMA foreign_key_check").all().length;
    console.log(`  Claves foráneas rotas: ${violations}`);
  } finally {
    remote.close();
    local.close();
  }
}

try {
  main();
  console.log("Migración completada.");
} catch (error) {
  console.error(`Migración fallida: ${error.message}`);
  process.exitCode = 1;
}
