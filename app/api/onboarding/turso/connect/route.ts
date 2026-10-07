import { validateLoopbackSecurity } from "../../../../../db/local/providers.cjs";
import { normalizeTursoUrl, saveTursoConfig } from "../../../../../db/local/storage.cjs";
import { openTurso } from "../../../../../db/cloud/turso-db.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400, headers: NO_STORE });
  }

  const url = normalizeTursoUrl(body.databaseUrl);
  const token = typeof body.authToken === "string" ? body.authToken.trim() : "";
  if (!url) {
    return Response.json({ error: "La Database URL no es válida. Usa el formato libsql://tu-base.turso.io." }, { status: 400, headers: NO_STORE });
  }
  if (!token || token.length > 4096 || /\s/.test(token)) {
    return Response.json({ error: "El Auth Token no es válido." }, { status: 400, headers: NO_STORE });
  }

  try {
    const db = openTurso({ url, token });
    try {
      db.prepare("SELECT 1 AS ok").get();
    } finally {
      db.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const rejected = /\b(401|403)\b/.test(message);
    return Response.json(
      {
        error: rejected
          ? "Turso rechazó el token. Genera uno nuevo en tu panel de Turso."
          : "No se pudo conectar con Turso. Revisa la URL y tu conexión.",
      },
      { status: rejected ? 401 : 502, headers: NO_STORE },
    );
  }

  try {
    await saveTursoConfig({ url, token });
  } catch {
    return Response.json({ error: "No se pudieron guardar las credenciales de forma segura." }, { status: 500, headers: NO_STORE });
  }
  return Response.json({ ok: true }, { headers: NO_STORE });
}
