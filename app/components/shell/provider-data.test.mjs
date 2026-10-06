import assert from "node:assert/strict";
import test from "node:test";
import {
  providers,
  PROVIDER_IDS,
  providerErrorForStatus,
  providerRequestError,
  readProviderStatus,
} from "./provider-data.mjs";

const okBody = () => ({
  providers: PROVIDER_IDS.map((id) => ({ id, configured: id === "groq" })),
  storage: { kind: "windows-dpapi", available: true },
});

const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("parses a configured-provider status and storage availability", async () => {
  const { status, available } = await readProviderStatus(response(okBody()));
  assert.equal(status.groq, true);
  assert.equal(status.google, false);
  assert.equal(available, true);
  assert.equal(Object.keys(status).length, providers.length);
});

test("rejects incomplete provider lists so a missing provider cannot read as unconfigured", async () => {
  const body = okBody();
  body.providers = body.providers.slice(1);
  await assert.rejects(() => readProviderStatus(response(body)), /no es válida/);
});

test("ignores provider ids this client does not know, keeping the response forward-compatible", async () => {
  const body = okBody();
  body.providers.push({ id: "unknown-provider", configured: true });
  const { status } = await readProviderStatus(response(body));
  assert.equal("unknown-provider" in status, false);
  assert.equal(Object.keys(status).length, providers.length);
});

test("rejects storage backends other than windows-dpapi and non-boolean availability", async () => {
  await assert.rejects(
    () => readProviderStatus(response({ ...okBody(), storage: { kind: "plaintext", available: true } })),
    /no es válida/,
  );
  await assert.rejects(
    () =>
      readProviderStatus(
        response({ ...okBody(), storage: { kind: "windows-dpapi", available: "yes" } }),
      ),
    /no es válida/,
  );
});

test("maps HTTP status codes to actionable messages and ignores unknown ones", async () => {
  assert.match(providerErrorForStatus(501), /Windows/);
  assert.match(providerErrorForStatus(409), /perfil local/);
  assert.equal(providerErrorForStatus(500), providerErrorForStatus(418));
  await assert.rejects(() => readProviderStatus(response({}, 403)), /autorizar/);
});

test("passes through known errors and falls back for anything else", () => {
  const known = providerErrorForStatus(400);
  assert.equal(providerRequestError(new Error(known), "fallback"), known);
  assert.equal(
    providerRequestError(new Error("La respuesta del almacenamiento seguro no es válida."), "fallback"),
    "La respuesta del almacenamiento seguro no es válida.",
  );
  assert.equal(providerRequestError(new Error("boom"), "fallback"), "fallback");
  assert.equal(providerRequestError("not an error", "fallback"), "fallback");
});
