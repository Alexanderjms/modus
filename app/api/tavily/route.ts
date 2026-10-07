import { cookies } from "next/headers";
import { validateLoopbackSecurity, openProjectDatabase, resolveUser, readProvidersJsonBody } from "../../../db/local/providers.cjs";
import { UNLOCK_COOKIE, lockKind, isUnlocked, getSessionUserId } from "../../../db/local/pin-lock.cjs";
import { getTavilyStatus, getTavilyKey, saveTavilyKey, validateTavilyKey, removeTavilyKey } from "../../../db/local/tavily.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function handle(request: Request) {
  const securityError = validateLoopbackSecurity(request);
  if (securityError) { securityError.headers.set("Cache-Control", "no-store"); return securityError; }
  const token = (await cookies()).get(UNLOCK_COOKIE)?.value;
  if (lockKind() && !isUnlocked(token)) return json({ error: "Desbloquea tu perfil para configurar Tavily." }, 401);
  let key: string | undefined;
  if (request.method === "PUT" || (request.method === "POST" && request.body !== null)) {
    const body = await readProvidersJsonBody(request);
    if (body.error) { body.error.headers.set("Cache-Control", "no-store"); return body.error; }
    const value = body.data as Record<string, unknown>;
    if (Object.keys(value).length !== 1 || typeof value.apiKey !== "string") return json({ error: "Introduce una API key de Tavily." }, 400);
    key = value.apiKey;
  }
  const result = openProjectDatabase();
  if ("error" in result && result.error) { result.error.headers.set("Cache-Control", "no-store"); return result.error; }
  const { db } = result;
  try {
    const user = resolveUser(db);
    if (user instanceof Response) { user.headers.set("Cache-Control", "no-store"); return user; }
    if ((db as { kind?: string }).kind === "turso" && getSessionUserId(token) !== user.id) return json({ error: "La sesión no coincide con el perfil activo. Inicia sesión de nuevo." }, 401);
    if (request.method === "PUT") {
      const check = await saveTavilyKey(db, user.id, key!, request.signal, () =>
        (!lockKind() || isUnlocked(token)) && ((db as { kind?: string }).kind !== "turso" || getSessionUserId(token) === user.id));
      if (!check.ok) return json({ error: check.error }, check.status);
    } else if (request.method === "POST") {
      const current = getTavilyStatus(db, user.id);
      if (key === undefined && current.source === "saved" && !current.storageAvailable) return json({ error: "La clave cifrada de este perfil solo puede utilizarse desde Windows DPAPI." }, 501);
      const saved = key === undefined ? await getTavilyKey(db, user.id) : key;
      if (!saved) return json({ error: "No hay una API key de Tavily configurada." }, 409);
      const check = await validateTavilyKey(saved, request.signal);
      if (!check.ok) return json({ error: check.error }, check.status);
    } else if (request.method === "DELETE") {
      removeTavilyKey(db, user.id);
    }
    return json({ status: getTavilyStatus(db, user.id), ...(request.method === "POST" || request.method === "PUT" ? { validated: true } : {}) });
  } catch {
    return json({ error: "No se pudo acceder a la configuración segura de Tavily. La clave no se ha mostrado." }, 500);
  } finally { try { db.close(); } catch {} }
}

export const GET = handle;
export const PUT = handle;
export const POST = handle;
export const DELETE = handle;
