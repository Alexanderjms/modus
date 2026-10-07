import type { DatabaseSync } from "node:sqlite";
import { cookies } from "next/headers";
import { UNLOCK_COOKIE, isUnlocked, lockKind } from "../../../../db/local/pin-lock.cjs";
import {
  jsonResponse,
  withNoStore,
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
  getDecryptedProviderKey,
  discoverProviderModelsCached,
  ALLOWED_PROVIDERS,
} from "../../../../db/local/chat.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  const region = url.searchParams.get("region") || undefined;

  if (!provider || !ALLOWED_PROVIDERS.has(provider)) {
    return jsonResponse({ error: "Parámetro 'provider' ausente o no soportado" }, 400);
  }

  let db: DatabaseSync | null = null;
  if (provider === "chatgpt" && lockKind() && !isUnlocked((await cookies()).get(UNLOCK_COOKIE)?.value)) {
    return jsonResponse({ error: "Desbloquea tu perfil antes de usar ChatGPT." }, 401);
  }
  let apiKey: string | null = null;

  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) {
      return withNoStore(dbResult.error);
    }
    db = dbResult.db;

    const user = resolveUser(db);
    if (user instanceof Response) {
      return withNoStore(user);
    }

    try {
      apiKey = await getDecryptedProviderKey(db, user.id, provider, provider === "chatgpt" ? (await cookies()).get(UNLOCK_COOKIE)?.value ?? null : undefined);
    } catch (reason) {
      if (reason && typeof reason === "object" && (reason as { name?: string }).name === "OAuthError") {
        const err = reason as { message: string; status: number; code: string };
        return jsonResponse({ error: err.message, code: err.code }, err.status);
      }
      return jsonResponse({ error: "Error al recuperar la clave del proveedor" }, 500);
    }
  } catch {
    return jsonResponse({ error: "Error interno del servidor" }, 500);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }

  if (!apiKey) {
    return jsonResponse(
      { error: "No hay clave configurada para el proveedor solicitado. Configúrala en Ajustes." },
      409
    );
  }

  const discovery = await discoverProviderModelsCached(provider, apiKey, region, request.signal);
  if ("error" in discovery && discovery.error) {
    return discovery.error;
  }

  const responseBody: { models: typeof discovery.models; warning?: string } = { models: discovery.models };
  if ("warning" in discovery && typeof discovery.warning === "string") {
    responseBody.warning = discovery.warning;
  }

  return jsonResponse(responseBody, 200);
}
