import assert from "node:assert/strict";
import test from "node:test";
import { deleteProject, mutateProject } from "./project-actions.ts";

test("project actions use the existing endpoints and reject unsuccessful responses", async () => {
  const originalFetch = globalThis.fetch;
  const project = { id: 7, progress: 100 };
  const requests = [];
  let status = 200;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, ...options });
    return new Response(status === 204 ? null : JSON.stringify({ project, error: "Falló" }), { status });
  };
  try {
    assert.deepEqual(await mutateProject(project, "archive"), project);
    assert.equal(requests.at(-1).method, "PATCH");
    assert.deepEqual(JSON.parse(requests.at(-1).body), { estado: "archived" });
    await mutateProject(project, "restore");
    assert.deepEqual(JSON.parse(requests.at(-1).body), { estado: "completed" });
    await mutateProject({ ...project, progress: 50 }, "restore");
    assert.deepEqual(JSON.parse(requests.at(-1).body), { estado: "active" });
    status = 201;
    await mutateProject(project, "duplicate");
    assert.equal(requests.at(-1).url, "/api/projects/7/duplicate");
    assert.equal(requests.at(-1).method, "POST");
    status = 204;
    await deleteProject(project);
    assert.equal(requests.at(-1).url, "/api/projects/7");
    assert.equal(requests.at(-1).method, "DELETE");
    status = 500;
    await assert.rejects(mutateProject(project, "archive"), /Falló/);
    await assert.rejects(deleteProject(project), /Falló/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
