import assert from "node:assert/strict";
import test from "node:test";
import { getContextPanelLoadState } from "./context-load-state.mjs";

test("projects loading and errors take precedence over missing project IDs", () => {
  assert.equal(getContextPanelLoadState(true, "", undefined, "no-project"), "loading");
  assert.equal(getContextPanelLoadState(false, "API error", undefined, "no-project"), "error");
  assert.equal(getContextPanelLoadState(false, "", undefined, "no-project"), "no-project");
  assert.equal(getContextPanelLoadState(false, "", 42, "loading"), "loading");
  assert.equal(getContextPanelLoadState(false, "", 42, "ready"), "ready");
  assert.equal(getContextPanelLoadState(false, "", 42, "error"), "error");
});
