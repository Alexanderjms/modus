import type { DatabaseSync } from "node:sqlite";
import {
  jsonResponse,
  withNoStore,
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
  getDecryptedProviderKey,
  discoverProviderModels,
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
      apiKey = await getDecryptedProviderKey(db, user.id, provider);
    } catch {
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

  const discovery = await discoverProviderModels(provider, apiKey, region, request.signal);
  if ("error" in discovery && discovery.error) {
    return discovery.error;
  }

  const responseBody: { models: typeof discovery.models; warning?: string } = { models: discovery.models };
  if ("warning" in discovery && typeof discovery.warning === "string") {
    responseBody.warning = discovery.warning;
  }

  return jsonResponse(responseBody, 200);
}
