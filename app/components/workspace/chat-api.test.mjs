import assert from "node:assert/strict";
import test from "node:test";
import { errorForStatus, validConversation, validMessages, validSummary } from "./chat-api.mjs";

const summary = {
  id: 1,
  projectId: 2,
  title: "Chat",
  revision: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  provider: "opencode",
  model: "free-model",
  protocol: null,
  region: null,
};

test("validSummary accepts a full summary and rejects unknown provider, protocol and missing fields", () => {
  assert.equal(validSummary(summary), true);
  assert.equal(validSummary({ ...summary, provider: null, model: null }), true);
  assert.equal(validSummary({ ...summary, provider: "unknown" }), false);
  assert.equal(validSummary({ ...summary, protocol: "grpc" }), false);
  assert.equal(validSummary({ ...summary, revision: "0" }), false);
  assert.equal(validSummary(null), false);
});

test("validMessages rejects foreign roles and non-string content", () => {
  assert.equal(validMessages([{ role: "user", content: "hi" }, { role: "assistant", content: "ok" }]), true);
  assert.equal(validMessages([{ role: "system", content: "hi" }]), false);
  assert.equal(validMessages([{ role: "user", content: 3 }]), false);
  assert.equal(validMessages([]), true);
  assert.equal(validMessages("nope"), false);
});

test("validConversation requires a valid summary plus messages array", () => {
  assert.equal(validConversation({ ...summary, messages: [{ role: "user", content: "hi" }] }), true);
  assert.equal(validConversation({ ...summary }), false);
  assert.equal(validConversation({ ...summary, messages: [{ role: "system", content: "hi" }] }), false);
});

test("errorForStatus maps known statuses and falls back for the rest", () => {
  assert.match(errorForStatus(401), /no son válidos/);
  assert.match(errorForStatus(409), /cambió en otra sesión|Actualiza/);
  assert.equal(errorForStatus(418), "No se pudo completar la operación. Inténtalo de nuevo.");
});
