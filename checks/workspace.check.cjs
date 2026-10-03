// Run against the existing dev server: node checks/workspace.check.cjs
const assert = require("node:assert/strict");

async function check() {
  const base = process.env.MODUS_URL || "http://127.0.0.1:3000";
  const pages = await Promise.all(
    ["/inicio", "/workspace"].map(async (route) => {
      const response = await fetch(`${base}${route}`);
      assert.equal(response.status, 200, route);
      return response.text();
    }),
  );
  const [home, workspace] = pages;
  for (const html of pages) {
    assert.match(html, /Navegación principal/);
    assert.match(html, /Modus — Inicio/);
    assert.match(html, /href="\/workspace"/);
    assert.match(html, /aria-label="Ocultar navegación"/);
    assert.match(html, /aria-expanded="true" aria-controls="main-sidebar"/);
  }
  assert.match(home, /Buenos días, Alex/);
  assert.match(workspace, /Tablero Kanban/);
  assert.match(workspace, /Contexto/);
  assert.match(workspace, /Seleccionar proyecto/);
  assert.ok(
    workspace.indexOf('aria-label="Seleccionar proyecto"') <
      workspace.indexOf('aria-label="Modus — Inicio"'),
    "Selector in header before brand",
  );
  for (const column of ["BACKLOG", "POR HACER", "EN PROGRESO", "TERMINADO"]) {
    assert.ok(workspace.includes(`aria-label="${column}"`), column);
  }
  assert.match(workspace, /Mover Testing del módulo Investigadores/);
  assert.match(workspace, /Mensaje al chat/);
  assert.match(
    workspace,
    /aria-expanded="true" aria-controls="workspace-context"/,
  );
  assert.match(
    workspace,
    /aria-expanded="true" aria-controls="workspace-chat"/,
  );
  assert.match(workspace, /Buscar proyecto/);
  assert.match(workspace, /RECIENTES/);
  assert.doesNotMatch(workspace, /aria-label="Proyectos abiertos"/);
  assert.doesNotMatch(workspace, /Ver 10 tareas más|Tarea movida a/);
  console.log(
    "Inicio and Workspace: HTTP 200, shared chrome, selector and board markup OK.",
  );
}

check().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
