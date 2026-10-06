"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const os = require("os");
const { DatabaseSync } = require("node:sqlite");

const {
  validateContextDocument,
  getProjectContext,
  saveProjectContext,
  ensureProjectContextTable,
  saveProjectFile,
  getProjectFile,
  parseProjectFileResourceUrl,
  sanitizeFilename,
  sanitizeMimeType,
  MAX_CONTEXT_LENGTH,
  MAX_RULES_COUNT,
  MAX_RULE_LENGTH,
  MAX_RESOURCES_COUNT,
  MAX_RESOURCE_TITLE_LENGTH,
  MAX_RESOURCE_URL_LENGTH,
  MAX_FILE_SIZE_BYTES,
} = require("./project-context.cjs");
const { applySchema } = require("./migrate.cjs");
const { buildSystemPrompt } = require("./chat.cjs");

function runContextTests() {
  console.log("Iniciando suite de pruebas de contexto de proyectos backend...");

  // -------------------------------------------------------------
  // Test 1: Validación estricta y límites de documento de contexto
  // -------------------------------------------------------------
  {
    // Objeto nulo o no objeto
    assert(validateContextDocument(null).error);
    assert(validateContextDocument("not-an-object").error);
    assert(validateContextDocument([]).error);

    // Campos no permitidos
    assert(validateContextDocument({ context: "ok", extraField: 123 }).error);

    // Contexto válido vacío
    const emptyRes = validateContextDocument({});
    assert.ifError(emptyRes.error);
    assert.deepStrictEqual(emptyRes.data, { context: "", rules: [], resources: [] });

    // Contexto excede max length
    const tooLongContext = "a".repeat(MAX_CONTEXT_LENGTH + 1);
    assert(validateContextDocument({ context: tooLongContext }).error);

    // Contexto válido
    const validContext = "Proyecto de prueba";
    const resCtx = validateContextDocument({ context: validContext });
    assert.strictEqual(resCtx.data.context, validContext);

    // Reglas inválidas (no array, elementos vacíos, tipo erróneo, excede longitud o cantidad)
    assert(validateContextDocument({ rules: "string" }).error);
    assert(validateContextDocument({ rules: ["   "] }).error);
    assert(validateContextDocument({ rules: [123] }).error);
    assert(validateContextDocument({ rules: ["r".repeat(MAX_RULE_LENGTH + 1)] }).error);
    const tooManyRules = Array.from({ length: MAX_RULES_COUNT + 1 }, (_, i) => `Regla ${i}`);
    assert(validateContextDocument({ rules: tooManyRules }).error);

    // Recursos inválidos (no array, falta url o title, protocolo no http(s), excede tamaño o cantidad)
    assert(validateContextDocument({ resources: "string" }).error);
    assert(validateContextDocument({ resources: [{ title: "" }] }).error);
    assert(validateContextDocument({ resources: [{ title: "T", url: "ftp://example.com" }] }).error);
    assert(validateContextDocument({ resources: [{ title: "T", url: "javascript:alert(1)" }] }).error);
    assert(validateContextDocument({ resources: [{ title: "t".repeat(MAX_RESOURCE_TITLE_LENGTH + 1), url: "https://example.com" }] }).error);
    assert(validateContextDocument({ resources: [{ title: "T", url: "https://" + "a".repeat(MAX_RESOURCE_URL_LENGTH) }] }).error);
    const tooManyRes = Array.from({ length: MAX_RESOURCES_COUNT + 1 }, (_, i) => ({ title: `T ${i}`, url: "https://example.com" }));
    assert(validateContextDocument({ resources: tooManyRes }).error);

    // Documento válido completo
    const validDoc = {
      context: "  Este es un contexto útil.  ",
      rules: [" No romper producción ", "Mantener tipos "],
      resources: [{ title: "Docs", url: "https://docs.example.com/api" }],
    };
    const validResult = validateContextDocument(validDoc);
    assert.ifError(validResult.error);
    assert.strictEqual(validResult.data.context, "  Este es un contexto útil.  ");
    assert.deepStrictEqual(validResult.data.rules, ["No romper producción", "Mantener tipos"]);
    assert.deepStrictEqual(validResult.data.resources, [{ title: "Docs", url: "https://docs.example.com/api" }]);

    console.log("✓ Test 1 pasado: Validación de documento y límites");
  }

  // -------------------------------------------------------------
  // Test 2: Persistencia, reemplazo atómico y aislamiento entre proyectos
  // -------------------------------------------------------------
  {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    applySchema(db);

    // Insertar usuario y dos proyectos
    db.exec("INSERT INTO usuarios (id, nombre) VALUES (1, 'Usuario 1')");
    db.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (10, 1, 'Proyecto A', 'folder')");
    db.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (20, 1, 'Proyecto B', 'folder')");

    // Consulta inicial: vacío por defecto
    const initialA = getProjectContext(db, 10);
    assert.deepStrictEqual(initialA, { context: "", rules: [], resources: [] });

    // Guardar para Proyecto A
    saveProjectContext(db, 10, {
      context: "Contexto de A",
      rules: ["Regla A1"],
      resources: [{ title: "Doc A", url: "https://a.example.com" }],
    });

    // Guardar para Proyecto B
    saveProjectContext(db, 20, {
      context: "Contexto de B",
      rules: ["Regla B1", "Regla B2"],
      resources: [],
    });

    // Verificar aislamiento
    const ctxA = getProjectContext(db, 10);
    const ctxB = getProjectContext(db, 20);
    assert.strictEqual(ctxA.context, "Contexto de A");
    assert.deepStrictEqual(ctxA.rules, ["Regla A1"]);
    assert.deepStrictEqual(ctxA.resources, [{ title: "Doc A", url: "https://a.example.com" }]);

    assert.strictEqual(ctxB.context, "Contexto de B");
    assert.deepStrictEqual(ctxB.rules, ["Regla B1", "Regla B2"]);
    assert.deepStrictEqual(ctxB.resources, []);

    // Reemplazo atómico (PUT): sobrescribir Proyecto A completamente
    saveProjectContext(db, 10, {
      context: "Contexto de A actualizado",
      rules: [],
      resources: [{ title: "Nueva Doc A", url: "https://new.example.com" }],
    });

    const ctxAUpdated = getProjectContext(db, 10);
    assert.strictEqual(ctxAUpdated.context, "Contexto de A actualizado");
    assert.deepStrictEqual(ctxAUpdated.rules, []);
    assert.deepStrictEqual(ctxAUpdated.resources, [{ title: "Nueva Doc A", url: "https://new.example.com" }]);

    // Proyecto B debe permanecer intacto
    const ctxBAfter = getProjectContext(db, 20);
    assert.strictEqual(ctxBAfter.context, "Contexto de B");
    assert.deepStrictEqual(ctxBAfter.rules, ["Regla B1", "Regla B2"]);

    console.log("✓ Test 2 pasado: Persistencia, reemplazo atómico y aislamiento entre proyectos");
  }

  // -------------------------------------------------------------
  // Test 3: Persistencia tras reabrir la base de datos en archivo temporal
  // -------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "modus-ctx-test-"));
    const tempDbPath = path.join(tempDir, "test.sqlite");

    try {
      // 1. Abrir, migrar y guardar
      {
        const dbFile = new DatabaseSync(tempDbPath);
        dbFile.exec("PRAGMA foreign_keys = ON;");
        applySchema(dbFile);

        dbFile.exec("INSERT INTO usuarios (id, nombre) VALUES (1, 'Usuario Temp')");
        dbFile.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (99, 1, 'Proyecto Persistente', 'folder')");

        saveProjectContext(dbFile, 99, {
          context: "Contexto persistido en disco",
          rules: ["Regla disco 1", "Regla disco 2"],
          resources: [{ title: "API Docs", url: "https://api.test.org" }],
        });

        dbFile.close();
      }

      // 2. Reabrir conexión nueva al mismo archivo SQLite y verificar lectura
      {
        const dbFileReopened = new DatabaseSync(tempDbPath);
        dbFileReopened.exec("PRAGMA foreign_keys = ON;");

        const loaded = getProjectContext(dbFileReopened, 99);
        assert.strictEqual(loaded.context, "Contexto persistido en disco");
        assert.deepStrictEqual(loaded.rules, ["Regla disco 1", "Regla disco 2"]);
        assert.deepStrictEqual(loaded.resources, [{ title: "API Docs", url: "https://api.test.org" }]);

        dbFileReopened.close();
      }
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }

    console.log("✓ Test 3 pasado: Persistencia intacta tras reabrir archivo SQLite");
  }

  // -------------------------------------------------------------
  // Test 4: Idempotencia en bases de datos existentes y ON DELETE CASCADE
  // -------------------------------------------------------------
  {
    const dbLegacy = new DatabaseSync(":memory:");
    dbLegacy.exec("PRAGMA foreign_keys = ON;");

    // Simular esquema preexistente sin la tabla proyecto_contexto
    dbLegacy.exec(`
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
      CREATE TABLE proyectos (id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id), nombre TEXT NOT NULL, icono TEXT NOT NULL);
      INSERT INTO usuarios (id, nombre) VALUES (1, 'Legacy User');
      INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (55, 1, 'Legacy Project', 'folder');
    `);

    // La primera escritura debe funcionar dentro de la transacción del endpoint.
    dbLegacy.exec("BEGIN IMMEDIATE;");
    saveProjectContext(dbLegacy, 55, { context: "Primera escritura", rules: [], resources: [] });
    dbLegacy.exec("ROLLBACK;");
    ensureProjectContextTable(dbLegacy);

    const initial = getProjectContext(dbLegacy, 55);
    assert.deepStrictEqual(initial, { context: "", rules: [], resources: [] });

    saveProjectContext(dbLegacy, 55, {
      context: "Contexto migrado",
      rules: ["Regla migrada"],
      resources: [],
    });
    assert.strictEqual(getProjectContext(dbLegacy, 55).context, "Contexto migrado");

    // Verificar borrado en cascada al eliminar el proyecto
    dbLegacy.exec("DELETE FROM proyectos WHERE id = 55");
    const count = dbLegacy.prepare("SELECT COUNT(*) AS c FROM proyecto_contexto WHERE proyecto_id = 55").get();
    assert.strictEqual(Number(count.c), 0, "El contexto debe eliminarse en cascada con el proyecto");

    console.log("✓ Test 4 pasado: Migración idempotente en BD existente y ON DELETE CASCADE");
  }

  // -------------------------------------------------------------
  // Test 5: Inyección de contexto guardado en el system prompt de IA
  // -------------------------------------------------------------
  {
    const promptSinContexto = buildSystemPrompt("Proyecto Alpha", null);
    assert(promptSinContexto.includes('para el proyecto "Proyecto Alpha"'));
    assert(!promptSinContexto.includes("[Contexto del proyecto]"));

    const promptConContexto = buildSystemPrompt("Proyecto Alpha", {
      context: "Esta aplicación gestiona inventarios.",
      rules: ["Usar TypeScript estricto", "No añadir dependencias"],
      resources: [{ title: "Repo Docs", url: "https://repo.docs.local" }],
    });

    assert(promptConContexto.includes("[Contexto del proyecto]\nEsta aplicación gestiona inventarios."));
    assert(promptConContexto.includes("[Reglas a seguir]\n- Usar TypeScript estricto\n- No añadir dependencias"));
    assert(promptConContexto.includes("[Recursos del proyecto]\n- Repo Docs: https://repo.docs.local"));

    console.log("✓ Test 5 pasado: Inyección de contexto en system prompt para IA");
  }

  // -------------------------------------------------------------
  // Test 6: Archivos de contexto: guardado, lectura, saneamiento de metadatos y cascada
  // -------------------------------------------------------------
  {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    applySchema(db);

    db.exec("INSERT INTO usuarios (id, nombre) VALUES (1, 'Usuario Archivos')");
    db.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (301, 1, 'Proyecto Archivos', 'folder')");
    db.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (302, 1, 'Proyecto B Archivos', 'folder')");

    // Saneamiento de nombre de archivo y mime type
    assert.strictEqual(sanitizeFilename("../../../etc/passwd"), "passwd");
    assert.strictEqual(sanitizeFilename("..\\..\\windows\\cmd.exe"), "cmd.exe");
    assert.strictEqual(sanitizeFilename("   mi archivo \"peligroso\"\r\n.pdf   "), "mi archivo peligroso.pdf");
    assert.strictEqual(sanitizeFilename(""), "archivo.bin");
    assert.strictEqual(sanitizeMimeType("IMAGE/PNG"), "image/png");
    assert.strictEqual(sanitizeMimeType("bad\nmime"), "application/octet-stream");

    // Guardar archivo válido
    const dummyPdf = Buffer.from("%PDF-1.4 test binary content \x00\x01\x02");
    const saved = saveProjectFile(db, 301, {
      filename: "guia-usuario.pdf",
      mimeType: "application/pdf",
      buffer: dummyPdf,
    });

    assert.strictEqual(saved.projectId, 301);
    assert.strictEqual(saved.filename, "guia-usuario.pdf");
    assert.strictEqual(saved.mimeType, "application/pdf");
    assert.strictEqual(saved.size, dummyPdf.byteLength);
    assert.strictEqual(saved.url, `/api/projects/301/context/files/${saved.id}`);

    // Recuperar archivo
    const retrieved = getProjectFile(db, 301, saved.id);
    assert(retrieved !== null);
    assert.strictEqual(retrieved.id, saved.id);
    assert.strictEqual(retrieved.projectId, 301);
    assert.strictEqual(retrieved.filename, "guia-usuario.pdf");
    assert.strictEqual(retrieved.mimeType, "application/pdf");
    assert.deepStrictEqual(retrieved.data, dummyPdf);

    // No accesible desde otro proyecto (aislamiento cross-project)
    const crossAccess = getProjectFile(db, 302, saved.id);
    assert.strictEqual(crossAccess, null, "Un proyecto no puede acceder al archivo de otro proyecto");

    // ID inválido o traversal
    assert.strictEqual(getProjectFile(db, 301, "../archivo"), null);
    assert.strictEqual(getProjectFile(db, 301, "invalid-uuid"), null);

    // Límite de tamaño: rechazar > 10 MiB
    const oversized = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1);
    assert.throws(() => {
      saveProjectFile(db, 301, {
        filename: "enorme.bin",
        mimeType: "application/octet-stream",
        buffer: oversized,
      });
    }, /excede el tamaño máximo permitido/);

    // Archivo vacío rechazado
    assert.throws(() => {
      saveProjectFile(db, 301, {
        filename: "vacio.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.alloc(0),
      });
    }, /no puede estar vacío/);

    // Borrado en cascada al eliminar proyecto
    db.exec("DELETE FROM proyectos WHERE id = 301");
    const countArchivos = db.prepare("SELECT COUNT(*) AS c FROM proyecto_archivos WHERE proyecto_id = 301").get();
    assert.strictEqual(Number(countArchivos.c), 0, "Los archivos deben eliminarse en cascada con el proyecto");

    console.log("✓ Test 6 pasado: Almacenamiento, saneamiento, aislamiento cross-project y límites de archivos");
  }

  // -------------------------------------------------------------
  // Test 7: Validación de URLs relativas de archivos de proyecto en recursos
  // -------------------------------------------------------------
  {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    applySchema(db);

    db.exec("INSERT INTO usuarios (id, nombre) VALUES (1, 'Usuario Ref')");
    db.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (401, 1, 'Proyecto A', 'folder')");
    db.exec("INSERT INTO proyectos (id, usuario_id, nombre, icono) VALUES (402, 1, 'Proyecto B', 'folder')");

    const fileA = saveProjectFile(db, 401, {
      filename: "diagrama.png",
      mimeType: "image/png",
      buffer: Buffer.from("image bytes"),
    });

    const fileB = saveProjectFile(db, 402, {
      filename: "archivoB.png",
      mimeType: "image/png",
      buffer: Buffer.from("bytes B"),
    });

    // Parseo de URL relativa
    assert.deepStrictEqual(parseProjectFileResourceUrl(fileA.url, 401), {
      projectId: 401,
      fileId: fileA.id,
    });
    // Proyecto erróneo en url
    assert.strictEqual(parseProjectFileResourceUrl(fileA.url, 402), null);
    // Traversal o esquema no permitido
    assert.strictEqual(parseProjectFileResourceUrl("/api/projects/401/context/files/../../../etc/passwd", 401), null);
    assert.strictEqual(parseProjectFileResourceUrl("file:///C:/autoexec.bat", 401), null);

    // Validación de documento con URL externa válida + archivo propio válido
    const docWithBoth = {
      context: "Contexto con links",
      rules: ["Regla 1"],
      resources: [
        { title: "Externo", url: "https://example.com/spec" },
        { title: fileA.filename, url: fileA.url },
      ],
    };
    const validResult = validateContextDocument(docWithBoth, db, 401);
    assert.ifError(validResult.error);
    assert.strictEqual(validResult.data.resources.length, 2);
    assert.strictEqual(validResult.data.resources[1].url, fileA.url);

    // Rechazar si referencia archivo de OTRO proyecto (cross-project reference)
    const docWithCross = {
      context: "Contexto tramposo",
      rules: [],
      resources: [
        { title: "Archivo de B", url: `/api/projects/402/context/files/${fileB.id}` },
      ],
    };
    const crossResult = validateContextDocument(docWithCross, db, 401);
    assert(crossResult.error, "Debe rechazar recurso que apunte al proyecto 402 desde el proyecto 401");

    // Rechazar si el archivo no existe en la base de datos
    const fakeUuid = "12345678-1234-1234-1234-123456789abc";
    const docWithMissing = {
      context: "Contexto inexistente",
      rules: [],
      resources: [
        { title: "No existe", url: `/api/projects/401/context/files/${fakeUuid}` },
      ],
    };
    const missingResult = validateContextDocument(docWithMissing, db, 401);
    assert(missingResult.error, "Debe rechazar archivo inexistente en el proyecto");

    // Guardar documento con recurso relativo y re-obtenerlo
    saveProjectContext(db, 401, validResult.data);
    const reloaded = getProjectContext(db, 401);
    assert.strictEqual(reloaded.resources.length, 2);
    assert.strictEqual(reloaded.resources[1].title, fileA.filename);
    assert.strictEqual(reloaded.resources[1].url, fileA.url);

    // Inyección de prompt de IA muestra el recurso de archivo sin problemas
    const prompt = buildSystemPrompt("Proyecto A", reloaded);
    assert(prompt.includes(`- ${fileA.filename}: ${fileA.url}`));

    console.log("✓ Test 7 pasado: Validación de recursos relativos de archivos y rechazo cross-project/inexistentes");
  }

  console.log("\nTodos los tests de contexto de proyecto pasaron exitosamente sin errores.\n");
}

if (require.main === module) {
  runContextTests();
}

module.exports = { runContextTests };
