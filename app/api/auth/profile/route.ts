import { validateLoopbackSecurity } from "../../../../db/local/providers.cjs";
import { cookies } from "next/headers";
import { UNLOCK_COOKIE, getSessionUserId, updateCloudProfile } from "../../../../db/local/pin-lock.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function PUT(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400, headers: NO_STORE });
  }

  let result;
  try {
    result = updateCloudProfile({
      userId: getSessionUserId((await cookies()).get(UNLOCK_COOKIE)?.value),
      username: body.usuario as string,
      newPassword: body.newPassword as string | undefined,
    });
  } catch {
    return Response.json({ error: "No se pudo guardar el perfil en Turso." }, { status: 502, headers: NO_STORE });
  }
  if (!result.ok) {
    return Response.json(
      { error: result.error, ...(result.retryAfter ? { retryAfter: result.retryAfter } : {}) },
      { status: result.status, headers: NO_STORE },
    );
  }
  return Response.json({ ok: true }, { headers: NO_STORE });
}
