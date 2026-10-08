"use strict";

const { randomBytes, randomUUID, createHash, createPublicKey, verify, timingSafeEqual } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const fs = require("node:fs");
const { getDataDir } = require("./db.cjs");
const { isDpapiAvailable, encryptWithDpapi, decryptWithDpapi } = require("./credentials.cjs");

const ISSUER = "https://auth.openai.com";
const RESOURCE = "https://api.openai.com/v1";
const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const COOKIE = "modus-chatgpt-oauth";
const MAX_RESPONSE_BYTES = 256 * 1024;
const shared = globalThis[Symbol.for("modus.chatgpt.oauth")] ??= { locks: new Map(), discovery: null, jwks: null };

class OAuthError extends Error {
  constructor(message, status = 400, code = "oauth_error") {
    super(message);
    this.name = "OAuthError";
    this.status = status;
    this.code = code;
  }
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function openStore() {
  const directory = getDataDir();
  fs.mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, "chatgpt-oauth.sqlite"));
  db.exec(`
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS host (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS connections (
      profile TEXT PRIMARY KEY, client_id TEXT, subject TEXT, email TEXT,
      encrypted TEXT, expires_at INTEGER, scopes TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 0, refresh_until INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'disconnected'
    );
    CREATE TABLE IF NOT EXISTS attempts (
      cookie_hash TEXT PRIMARY KEY, state_hash TEXT NOT NULL, profile TEXT NOT NULL,
      encrypted TEXT NOT NULL, expires_at INTEGER NOT NULL, version INTEGER NOT NULL
    );
  `);
  return db;
}

function readConnection(profile) {
  const db = openStore();
  try { return db.prepare("SELECT * FROM connections WHERE profile = ?").get(profile) ?? null; }
  finally { db.close(); }
}

function profileFor(db, userId, sessionToken) {
  if (db.kind === "turso" && sessionToken !== undefined
    && require("./pin-lock.cjs").getSessionUserId(sessionToken) !== userId) {
    throw new OAuthError("La sesión no coincide con el perfil activo. Inicia sesión de nuevo.", 401);
  }
  const source = db.kind === "turso"
    ? require("./storage.cjs").loadTursoConfig()?.url
    : process.env.MODUS_SQLITE_PATH || require("./db.cjs").getDefaultDbPath();
  if (!source) throw new OAuthError("No se pudo identificar el perfil local.", 409);
  return hash(`${db.kind || "local"}:${source}:${userId}`);
}

function publicConnection(profile) {
  const row = readConnection(profile);
  const permission = row?.scopes.split(" ").includes("chatgpt.tokens.use.direct") === true;
  return {
    id: "chatgpt",
    status: row?.encrypted ? (permission ? "connected" : "permission_required") : row?.status || "disconnected",
    configured: Boolean(row?.encrypted && permission && isDpapiAvailable()),
    email: row?.email ?? null,
    expiresAt: row?.expires_at ? new Date(row.expires_at).toISOString() : null,
    available: isDpapiAvailable(),
  };
}

async function withLock(profile, action) {
  const previous = shared.locks.get(profile) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  shared.locks.set(profile, current);
  await previous;
  try { return await action(); }
  finally {
    release();
    if (shared.locks.get(profile) === current) shared.locks.delete(profile);
  }
}

async function boundedJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new OAuthError("No se pudo contactar con ChatGPT. Inténtalo de nuevo.", 503, "network_error");
  }
  const reader = response.body?.getReader();
  const chunks = [];
  let size = 0;
  try {
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new OAuthError("La respuesta de ChatGPT excedió el límite permitido.", 502);
        }
        chunks.push(value);
      }
    }
  } finally { reader?.releaseLock(); }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new OAuthError("ChatGPT devolvió una respuesta no válida.", 502); }
  if (!response.ok) {
    const code = typeof data.error === "string" ? data.error : data.error?.code;
    const terminal = new Set(["invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired", "refresh_token_invalidated", "refresh_token_reused"]);
    throw new OAuthError(
      terminal.has(code) ? "La conexión de ChatGPT expiró o fue revocada. Conecta la cuenta de nuevo." : "ChatGPT no pudo completar la autorización.",
      terminal.has(code) ? 401 : response.status === 429 ? 429 : 502,
      terminal.has(code) ? "reauthorization_required" : code === "invalid_client" ? "invalid_client" : "provider_error",
    );
  }
  return data;
}

async function discovery() {
  if (shared.discovery?.expires > Date.now()) return shared.discovery.value;
  const value = await boundedJson(`${ISSUER}/.well-known/openid-configuration`);
  if (value.issuer !== ISSUER) throw new OAuthError("Emisor OAuth no válido.", 502);
  for (const field of ["authorization_endpoint", "token_endpoint", "jwks_uri", "revocation_endpoint"]) {
    if (typeof value[field] !== "string") throw new OAuthError("Configuración OAuth no válida.", 502);
    let url;
    try { url = new URL(value[field]); } catch { throw new OAuthError("Configuración OAuth no válida.", 502); }
    if (url.origin !== ISSUER || url.username || url.password) throw new OAuthError("Configuración OAuth no válida.", 502);
  }
  shared.discovery = { value, expires: Date.now() + 3600000 };
  return value;
}

async function verifyIdentity(token, clientId, nonce) {
  if (typeof token !== "string" || token.length > 32768) throw new OAuthError("Identidad de ChatGPT no válida.");
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) throw new OAuthError("Identidad de ChatGPT no válida.");
  let header, claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch { throw new OAuthError("Identidad de ChatGPT no válida."); }
  if (header.alg !== "RS256" || typeof header.kid !== "string" || header.crit) throw new OAuthError("Firma de ChatGPT no admitida.");
  const metadata = await discovery();
  if (!shared.jwks || shared.jwks.expires <= Date.now() || !shared.jwks.keys.some((key) => key.kid === header.kid)) {
    const data = await boundedJson(metadata.jwks_uri);
    if (!Array.isArray(data.keys) || data.keys.length > 50) throw new OAuthError("Claves de firma no válidas.", 502);
    shared.jwks = { keys: data.keys, expires: Date.now() + 3600000 };
  }
  const jwk = shared.jwks.keys.find((key) => key.kid === header.kid && key.kty === "RSA" && (!key.use || key.use === "sig") && (!key.alg || key.alg === "RS256"));
  let valid = false;
  try {
    valid = jwk && verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2], "base64url"));
  } catch {}
  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!valid || claims.iss !== ISSUER || !audience.includes(clientId) || (audience.length > 1 && claims.azp !== clientId)
    || !Number.isFinite(claims.exp) || claims.exp <= now - 5 || !Number.isFinite(claims.iat) || claims.iat > now + 5
    || (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 5))
    || claims.nonce !== nonce || typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 512) {
    throw new OAuthError("No se pudo verificar la identidad de ChatGPT.", 400, "invalid_identity");
  }
  return claims;
}

function validateTokens(tokens) {
  if (typeof tokens.token_type !== "string" || tokens.token_type.toLowerCase() !== "bearer" || typeof tokens.access_token !== "string" || !tokens.access_token
    || tokens.access_token.length > 32768
    || typeof tokens.refresh_token !== "string" || !tokens.refresh_token || tokens.refresh_token.length > 32768
    || typeof tokens.scope !== "string" || tokens.scope.length > 4096
    || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0 || tokens.expires_in > 86400
    || Buffer.byteLength(JSON.stringify(tokens), "utf8") > 44000) {
    throw new OAuthError("ChatGPT no devolvió credenciales renovables válidas.", 502);
  }
  return { expiresAt: Date.now() + tokens.expires_in * 1000, scopes: tokens.scope };
}

async function beginAuthorization(profile, origin, sessionToken = null) {
  if (!isDpapiAvailable()) throw new OAuthError("La conexión segura requiere Windows DPAPI.", 501);
  const url = new URL(origin);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") throw new OAuthError("Abre Modus en http://127.0.0.1 antes de conectar ChatGPT.", 400, "loopback_required");
  const metadata = await discovery();
  const cookie = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(64).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const redirectUri = `${url.origin}/auth/callback`;
  const row = readConnection(profile);
  const transaction = { verifier, nonce, redirectUri, clientId: row?.client_id ?? null, subject: row?.subject ?? null, sessionToken };
  const encrypted = await encryptWithDpapi(JSON.stringify(transaction));
  const db = openStore();
  let hostId;
  try {
    db.prepare("INSERT OR IGNORE INTO host (id, value) VALUES (1, ?)").run(`urn:uuid:${randomUUID()}`);
    hostId = db.prepare("SELECT value FROM host WHERE id = 1").get().value;
    db.prepare("INSERT OR IGNORE INTO connections (profile) VALUES (?)").run(profile);
    db.prepare("DELETE FROM attempts WHERE expires_at <= ? OR profile = ?").run(Date.now(), profile);
    db.prepare("INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?)").run(hash(cookie), hash(state), profile, encrypted, Date.now() + 600000, row?.version ?? 0);
  } finally { db.close(); }
  const authorize = new URL(metadata.authorization_endpoint);
  authorize.search = new URLSearchParams({
    client_id: row?.client_id || "dynamic_agent_client",
    ...(row?.client_id ? {} : { agent_name_hint: "Modus" }),
    ext_agent_host_id: hostId, response_type: "code", redirect_uri: redirectUri,
    scope: SCOPES, resource: RESOURCE, state, nonce,
    code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    ...(row?.status === "permission_required" ? { prompt: "consent" } : {}),
  }).toString();
  return { authorizationUrl: authorize.toString(), cookie };
}

async function completeAuthorization(profile, cookie, callback) {
  if (!cookie || !/^[A-Za-z0-9_-]{43}$/.test(cookie)) throw new OAuthError("La conexión no pertenece a este navegador o expiró.");
  const db = openStore();
  let attempt;
  try {
    attempt = db.prepare("DELETE FROM attempts WHERE cookie_hash = ? AND profile = ? RETURNING *").get(hash(cookie), profile);
  } finally { db.close(); }
  const state = callback.searchParams.get("state") || "";
  const duplicated = ["code", "state", "error", "client_id"].some((name) => callback.searchParams.getAll(name).length > 1);
  if (duplicated || !attempt || attempt.expires_at <= Date.now()) {
    throw new OAuthError("La autorización expiró, ya se usó o no pudo verificarse.", 400, "invalid_state");
  }
  const expected = Buffer.from(attempt.state_hash);
  const received = Buffer.from(hash(state));
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new OAuthError("La autorización expiró, ya se usó o no pudo verificarse.", 400, "invalid_state");
  }
  if (callback.searchParams.has("error")) throw new OAuthError("La autorización de ChatGPT fue cancelada.", 400, "access_denied");
  const transaction = JSON.parse(await decryptWithDpapi(attempt.encrypted));
  if (transaction.sessionToken && !require("./pin-lock.cjs").isUnlocked(transaction.sessionToken)) {
    throw new OAuthError("La sesión que inició la conexión se cerró. Desbloquea el perfil e inténtalo de nuevo.", 401);
  }
  if (`${callback.origin}${callback.pathname}` !== transaction.redirectUri) throw new OAuthError("Callback OAuth no válido.");
  const issuedId = callback.searchParams.get("client_id");
  const clientId = transaction.clientId || issuedId;
  if (!clientId || !/^oaiapp_[A-Za-z0-9_-]{1,200}$/.test(clientId) || (transaction.clientId && issuedId && issuedId !== transaction.clientId)) {
    throw new OAuthError("El registro de ChatGPT no pudo verificarse.");
  }
  const code = callback.searchParams.get("code");
  if (!code || code.length > 4096) throw new OAuthError("No se recibió un código de autorización válido.");
  const metadata = await discovery();
  const tokens = await boundedJson(metadata.token_endpoint, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: transaction.verifier, redirect_uri: transaction.redirectUri, resource: RESOURCE }),
  });
  const identity = await verifyIdentity(tokens.id_token, clientId, transaction.nonce);
  if (transaction.subject && identity.sub !== transaction.subject) throw new OAuthError("La cuenta no coincide con la conexión guardada.");
  const validated = validateTokens(tokens);
  const encrypted = await encryptWithDpapi(JSON.stringify(tokens));
  return withLock(profile, async () => {
    const store = openStore();
    try {
      if (transaction.sessionToken && !require("./pin-lock.cjs").isUnlocked(transaction.sessionToken)) {
        throw new OAuthError("La sesión que inició la conexión se cerró.", 401);
      }
      const updated = store.prepare(`UPDATE connections SET client_id = ?, subject = ?, email = ?, encrypted = ?, expires_at = ?, scopes = ?, status = ?, version = version + 1, refresh_until = 0 WHERE profile = ? AND version = ?`)
        .run(clientId, identity.sub, typeof identity.email === "string" ? identity.email.slice(0,254) : null, encrypted, validated.expiresAt, validated.scopes,
          validated.scopes.split(" ").includes("chatgpt.tokens.use.direct") ? "connected" : "permission_required", profile, attempt.version);
      if (!updated.changes) throw new OAuthError("La conexión cambió durante la autorización. Inténtalo de nuevo.", 409);
    } finally { store.close(); }
    return publicConnection(profile);
  });
}

async function getAccessToken(profile) {
  return withLock(profile, async () => {
    const row = readConnection(profile);
    if (!row?.encrypted) throw new OAuthError("Conecta tu cuenta de ChatGPT en Proveedores.", 409, "reauthorization_required");
    if (!row.scopes.split(" ").includes("chatgpt.tokens.use.direct")) throw new OAuthError("Autoriza el uso de tu plan de ChatGPT antes de enviar mensajes.", 403, "permission_required");
    const tokens = JSON.parse(await decryptWithDpapi(row.encrypted));
    if (row.expires_at > Date.now() + 60000) return tokens.access_token;
    const db = openStore();
    try {
      const acquired = db.prepare("UPDATE connections SET refresh_until = ? WHERE profile = ? AND version = ? AND refresh_until <= ?")
        .run(Date.now() + 60000, profile, row.version, Date.now());
      if (!acquired.changes) throw new OAuthError("ChatGPT está renovando la conexión. Inténtalo de nuevo.", 409);
    } finally { db.close(); }
    try {
      const metadata = await discovery();
      const next = await boundedJson(metadata.token_endpoint, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: row.client_id, refresh_token: tokens.refresh_token, resource: RESOURCE }),
      });
      const validated = validateTokens(next);
      const encrypted = await encryptWithDpapi(JSON.stringify({ ...tokens, ...next }));
      const store = openStore();
      try {
        const updated = store.prepare("UPDATE connections SET encrypted = ?, expires_at = ?, scopes = ?, version = version + 1, refresh_until = 0, status = ? WHERE profile = ? AND version = ?")
          .run(encrypted, validated.expiresAt, validated.scopes, validated.scopes.split(" ").includes("chatgpt.tokens.use.direct") ? "connected" : "permission_required", profile, row.version);
        if (!updated.changes) throw new OAuthError("La cuenta se desconectó durante la renovación.", 409);
      } finally { store.close(); }
      if (!validated.scopes.split(" ").includes("chatgpt.tokens.use.direct")) throw new OAuthError("El plan de ChatGPT requiere autorización de nuevo.", 403, "permission_required");
      return next.access_token;
    } catch (error) {
      const store = openStore();
      try {
        if (error.code === "reauthorization_required") {
          store.prepare("UPDATE connections SET encrypted = NULL, expires_at = NULL, status = 'expired', refresh_until = 0, version = version + 1 WHERE profile = ? AND version = ?").run(profile, row.version);
        } else {
          store.prepare("UPDATE connections SET refresh_until = 0 WHERE profile = ? AND version = ?").run(profile, row.version);
        }
      } finally { store.close(); }
      throw error;
    }
  });
}

async function disconnect(profile) {
  return withLock(profile, async () => {
    const row = readConnection(profile);
    let revoked = !row?.encrypted;
    if (row?.encrypted) {
      try {
        const tokens = JSON.parse(await decryptWithDpapi(row.encrypted));
        const metadata = await discovery();
        const response = await fetch(metadata.revocation_endpoint, {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: tokens.refresh_token, token_type_hint: "refresh_token", client_id: row.client_id }),
        });
        revoked = response.status === 200;
        await response.body?.cancel();
      } catch {}
    }
    const db = openStore();
    try {
      db.prepare("DELETE FROM attempts WHERE profile = ?").run(profile);
      db.prepare("UPDATE connections SET encrypted = NULL, expires_at = NULL, scopes = '', status = 'disconnected', version = version + 1, refresh_until = 0 WHERE profile = ?").run(profile);
    } finally { db.close(); }
    return { connection: publicConnection(profile), revoked, warning: revoked ? null : "Cuenta desconectada de Modus; no se confirmó la revocación remota. Desconecta Modus también en los ajustes de ChatGPT." };
  });
}

module.exports = { COOKIE, OAuthError, profileFor, publicConnection, beginAuthorization, completeAuthorization, getAccessToken, disconnect };
