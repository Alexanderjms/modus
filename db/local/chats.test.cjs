"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const { applySchema } = require("./migrate.cjs");

// Cargar route.ts compilándolo con typescript CommonJS en tiempo de ejecución de pruebas
function loadChatRouteHandlers() {
  const routePath = path.resolve(__dirname, "../../app/api/chats/[id]/route.ts");
  const source = fs.readFileSync(routePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const routeModule = { exports: {} };
  const routeRequire = (specifier) => {
    const resolved = path.resolve(path.dirname(routePath), specifier);
    return require(resolved);
  };

  const fn = new Function("exports", "require", "module", "__filename", "__dirname", outputText);
  fn(routeModule.exports, routeRequire, routeModule, routePath, path.dirname(routePath));

  return routeModule.exports;
}

function makeJsonRequest(method, url, body = null) {
  const init = {
    method,
    headers: {
      host: "localhost:3000",
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
    },
  };
  if (body !== null) {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

function makeDeleteRequest(url) {
  return new Request(url, {
    method: "DELETE",
    headers: {
      host: "localhost:3000",
      "sec-fetch-site": "same-origin",
    },
  });
}

async function runRealRouteTests() {
  console.log("Iniciando pruebas reales de handlers en app/api/chats/[id]/route.ts...");

  const handlers = loadChatRouteHandlers();
  const { GET, PUT, PATCH, DELETE } = handlers;

  // Usar base de datos SQLite aislada en directorio temporal
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "modus-chat-test-"));
  const dbPath = path.join(tempDir, "modus.sqlite");
  process.env.MODUS_SQLITE_PATH = dbPath;

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  applySchema(db);

  // Sembrar datos: Usuario 1 con Proyecto 10, Usuario 2 con Proyecto 20
  db.exec("INSERT INTO usuarios (id, nombre) VALUES (1, 'Usuario 1')");
  db.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (10, 1, 'Proyecto Propio', 'folder')");
  db.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (20, 1, 'Proyecto 2', 'folder')");

  // Crear chat inicial
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO chats (
      id, proyecto_id, titulo, titulo_manual, revision, mensajes, creado_en, actualizado_en
    ) VALUES (1, 10, 'Nuevo chat', 0, 0, '[]', ?, ?)
  `).run(now, now);
  db.close();

  const paramsChat1 = { params: Promise.resolve({ id: "1" }) };

  // 1. GET inicial del chat
  const getReq = makeJsonRequest("GET", "http://localhost:3000/api/chats/1?projectId=10");
  const getRes = await GET(getReq, paramsChat1);
  assert.strictEqual(getRes.status, 200, "GET debe responder 200");
  const getData = await getRes.json();
  assert.strictEqual(getData.chat.title, "Nuevo chat");
  assert.strictEqual(getData.chat.revision, 0);

  // 2. PUT en chat sin rename: autogenera título desde primer mensaje de usuario
  const putReq1 = makeJsonRequest("PUT", "http://localhost:3000/api/chats/1?projectId=10", {
    revision: 0,
    messages: [
      { role: "user", content: "Título autogenerado inicial" },
      { role: "assistant", content: "Respuesta asistente 1" },
    ],
    provider: "groq",
    model: "llama-3.3-70b",
    protocol: null,
    region: null,
  });
  const putRes1 = await PUT(putReq1, paramsChat1);
  assert.strictEqual(putRes1.status, 200, "PUT inicial debe responder 200");
  const putData1 = await putRes1.json();
  assert.strictEqual(putData1.chat.title, "Título autogenerado inicial");
  assert.strictEqual(putData1.chat.revision, 1);

  // 3. PATCH para renombrar chat a título manual
  // 3a. Validaciones: rechazar body inválido / campos extra
  const badPatchReq1 = makeJsonRequest("PATCH", "http://localhost:3000/api/chats/1?projectId=10", {
    title: "Valido",
    revision: 1,
    extraField: "hacker",
  });
  const badPatchRes1 = await PATCH(badPatchReq1, paramsChat1);
  assert.strictEqual(badPatchRes1.status, 400, "PATCH con campos extra debe rechazar con 400");

  // 3b. Validaciones: rechazar título vacío o con espacios en blanco
  const badPatchReq2 = makeJsonRequest("PATCH", "http://localhost:3000/api/chats/1?projectId=10", {
    title: "   ",
    revision: 1,
  });
  const badPatchRes2 = await PATCH(badPatchReq2, paramsChat1);
  assert.strictEqual(badPatchRes2.status, 400, "PATCH con título en blanco debe rechazar con 400");

  // 3c. Validaciones: conflicto de concurrencia en PATCH (revisión stale)
  const conflictPatchReq = makeJsonRequest("PATCH", "http://localhost:3000/api/chats/1?projectId=10", {
    title: "Renombre Conflicto",
    revision: 0, // stale, actual es 1
  });
  const conflictPatchRes = await PATCH(conflictPatchReq, paramsChat1);
  assert.strictEqual(conflictPatchRes.status, 409, "PATCH con revisión desactualizada debe responder 409");

  // 3d. PATCH válido: renombra y avanza revisión a 2
  const validPatchReq = makeJsonRequest("PATCH", "http://localhost:3000/api/chats/1?projectId=10", {
    title: "Mi Chat Renombrado Manual",
    revision: 1,
  });
  const validPatchRes = await PATCH(validPatchReq, paramsChat1);
  assert.strictEqual(validPatchRes.status, 200, "PATCH válido debe responder 200");
  const patchData = await validPatchRes.json();
  assert.strictEqual(patchData.chat.title, "Mi Chat Renombrado Manual");
  assert.strictEqual(patchData.chat.revision, 2);
  assert.strictEqual(patchData.chat.messages.length, 2, "PATCH no debe modificar mensajes");

  // 4. PUT posterior: DEBE PRESERVAR el título manual y NO sobreescribirlo con nuevo mensaje
  const putReq2 = makeJsonRequest("PUT", "http://localhost:3000/api/chats/1?projectId=10", {
    revision: 2,
    messages: [
      { role: "user", content: "Pregunta completamente distinta que no debe reemplazar el título" },
      { role: "assistant", content: "Respuesta 2" },
    ],
    provider: "groq",
    model: "llama-3.3-70b",
    protocol: null,
    region: null,
  });
  const putRes2 = await PUT(putReq2, paramsChat1);
  assert.strictEqual(putRes2.status, 200, "PUT posterior debe responder 200");
  const putData2 = await putRes2.json();
  assert.strictEqual(
    putData2.chat.title,
    "Mi Chat Renombrado Manual",
    "PUT posterior no debe sobreescribir el título manual asignado por PATCH"
  );
  assert.strictEqual(putData2.chat.revision, 3);

  // 5. DELETE tests
  // 5a. DELETE con revisión stale => 409
  const staleDeleteReq = makeDeleteRequest("http://localhost:3000/api/chats/1?projectId=10&revision=1");
  const staleDeleteRes = await DELETE(staleDeleteReq, paramsChat1);
  assert.strictEqual(staleDeleteRes.status, 409, "DELETE con revisión desactualizada debe responder 409");

  // 5b. DELETE con proyecto ajeno / cross-project => 404
  const crossProjectDeleteReq = makeDeleteRequest("http://localhost:3000/api/chats/1?projectId=20&revision=3");
  const crossProjectDeleteRes = await DELETE(crossProjectDeleteReq, paramsChat1);
  assert.strictEqual(crossProjectDeleteRes.status, 404, "DELETE con proyecto incorrecto debe responder 404");

  // Verificar que el chat sigue existiendo intacto tras 409 y 404
  const checkGetReq = makeJsonRequest("GET", "http://localhost:3000/api/chats/1?projectId=10");
  const checkGetRes = await GET(checkGetReq, paramsChat1);
  assert.strictEqual(checkGetRes.status, 200);
  const checkGetData = await checkGetRes.json();
  assert.strictEqual(checkGetData.chat.title, "Mi Chat Renombrado Manual");
  assert.strictEqual(checkGetData.chat.revision, 3);
  assert.strictEqual(checkGetData.chat.messages.length, 2);

  // 5c. DELETE exitoso con id, projectId y revisión correcta
  const validDeleteReq = makeDeleteRequest("http://localhost:3000/api/chats/1?projectId=10&revision=3");
  const validDeleteRes = await DELETE(validDeleteReq, paramsChat1);
  assert.strictEqual(validDeleteRes.status, 204, "DELETE exitoso debe responder 204 No Content");

  // 5d. Verificar que GET ahora responde 404
  const postDeleteGetReq = makeJsonRequest("GET", "http://localhost:3000/api/chats/1?projectId=10");
  const postDeleteGetRes = await GET(postDeleteGetReq, paramsChat1);
  assert.strictEqual(postDeleteGetRes.status, 404, "GET de chat eliminado debe responder 404");

  // Limpieza de archivos temporales
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}

  console.log("✓ Todas las pruebas de endpoints reales de route.ts (GET, PUT, PATCH, DELETE) pasaron exitosamente.");
}

runRealRouteTests().catch((err) => {
  console.error("Error en pruebas reales de route:", err);
  process.exit(1);
});
