import assert from "node:assert/strict";
import test from "node:test";
import { getSubtasksToSave } from "./task-subtask-utils.mjs";

test("saves named checklist items and omits an empty draft", () => {
  const subtasks = [
    { id: 4, localKey: "db:4", title: "Persistida", completed: false },
    { localKey: "new:1", title: "Nueva", completed: true },
    { localKey: "new:2", title: "  ", completed: false },
  ];
  assert.deepEqual(getSubtasksToSave(subtasks, new Set()), [
    { id: 4, title: "Persistida", completed: false },
    { title: "Nueva", completed: true },
  ]);
});

test("blank persisted subtasks still block save unless removed", () => {
  const subtasks = [{ id: 4, localKey: "db:4", title: "  ", completed: false }];
  assert.equal(getSubtasksToSave(subtasks, new Set()), null);
  assert.deepEqual(getSubtasksToSave(subtasks, new Set(["db:4"])), []);
});
