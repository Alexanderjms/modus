import { cookies } from "next/headers";
import { validateLoopbackSecurity } from "../../../../db/local/providers.cjs";
import { UNLOCK_COOKIE, unlock } from "../../../../db/local/pin-lock.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;

  let pin: unknown;
  try {
    pin = ((await request.json()) as { pin?: unknown } | null)?.pin;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400, headers: NO_STORE });
  }
  if (typeof pin !== "string") {
    return Response.json({ error: "Introduce tu PIN." }, { status: 400, headers: NO_STORE });
  }

  const result = unlock(pin);
  if (!result.ok) {
    return Response.json(
      {
        error: result.retryAfter
          ? "Demasiados intentos. Espera antes de volver a probar."
          : "PIN incorrecto.",
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
  });
  return Response.json({ ok: true }, { headers: NO_STORE });
}
