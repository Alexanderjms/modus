import { cookies } from "next/headers";
import { validateLoopbackSecurity } from "../../../../db/local/providers.cjs";
import { SESSION_MAX_AGE, UNLOCK_COOKIE, unlock } from "../../../../db/local/pin-lock.cjs";

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
  const { pin, usuario, password } = body;
  if ((pin !== undefined && typeof pin !== "string") || (usuario !== undefined && typeof usuario !== "string") || (password !== undefined && typeof password !== "string")) {
    return Response.json({ error: "Datos de acceso inválidos." }, { status: 400, headers: NO_STORE });
  }

  let result;
  try {
    result = unlock({ pin, username: usuario, password });
  } catch {
    return Response.json({ error: "No se pudo verificar el acceso. Revisa la conexión con Turso." }, { status: 502, headers: NO_STORE });
  }
  if (!result.ok) {
    return Response.json(
      {
        error: result.retryAfter
          ? "Demasiados intentos. Espera antes de volver a probar."
          : usuario !== undefined ? "Usuario o contraseña incorrectos." : "PIN incorrecto.",
        ...(result.retryAfter ? { retryAfter: result.retryAfter } : {}),
      },
      { status: result.retryAfter ? 429 : 403, headers: NO_STORE },
    );
  }

  (await cookies()).set({
    name: UNLOCK_COOKIE,
    value: result.token,
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    ...(result.persistent ? { maxAge: SESSION_MAX_AGE } : {}),
  });
  return Response.json({ ok: true }, { headers: NO_STORE });
}
