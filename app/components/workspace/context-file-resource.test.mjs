import assert from "node:assert/strict";
import test from "node:test";
import { isProjectContextFileUrl } from "./context-file-resource.mjs";

test("accepts the project-scoped UUID file route and rejects malformed routes", () => {
  const resourceUrl = "/api/projects/1/context/files/01234567-89ab-cdef-0123-456789abcdef";
  assert.equal(isProjectContextFileUrl(resourceUrl), true);
  assert.equal(isProjectContextFileUrl(resourceUrl, 1), true);
  assert.equal(isProjectContextFileUrl(resourceUrl, 2), false);
  assert.equal(isProjectContextFileUrl("/api/projects/1/context/files/123"), false);
  assert.equal(isProjectContextFileUrl(`${resourceUrl}?download=1`), false);
  assert.equal(isProjectContextFileUrl(resourceUrl.replace("/context/files/", "/files/")), false);
});
