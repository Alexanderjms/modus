import assert from "node:assert/strict";
import { getContextResourceDomain } from "./context-document.mjs";

const file = {
  title: "captura.png",
  url: "/api/projects/3/context/files/123e4567-e89b-42d3-a456-426614174000",
};
const external = { title: "Guía", url: "https://docs.example.com/path" };
const invalid = { title: "Pendiente", url: "no es una URL" };

const NativeURL = globalThis.URL;
let parsedUrlCount = 0;
globalThis.URL = class extends NativeURL {
  constructor(...args) {
    parsedUrlCount++;
    super(...args);
  }
};
try {
  assert.equal(getContextResourceDomain(file, true), "");
  assert.equal(parsedUrlCount, 0, "uploaded relative files must not be parsed as absolute URLs");
  assert.equal(getContextResourceDomain(external, true), "docs.example.com");
  assert.equal(getContextResourceDomain(invalid, false), "");
} finally {
  globalThis.URL = NativeURL;
}
