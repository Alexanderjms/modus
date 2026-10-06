import assert from "node:assert/strict";
import test from "node:test";
import { mergeContextSave } from "./context-autosave.mjs";

test("keeps edits made during a request and marks them for the next serialized save", () => {
  const submitted = { context: "antes", rules: [], resources: [] };
  const current = { ...submitted, context: "edición reciente" };
  const response = { ...submitted, context: "antes", rules: ["normalizada"] };

  assert.deepEqual(mergeContextSave(current, submitted, response), {
    document: current,
    originalDocument: response,
    needsSave: true,
  });
  assert.deepEqual(mergeContextSave(submitted, submitted, response), {
    document: response,
    originalDocument: response,
    needsSave: false,
  });
});
