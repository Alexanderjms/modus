import { cookies } from "next/headers";
import { validateLoopbackSecurity } from "../../../db/local/providers.cjs";
import { UNLOCK_COOKIE, changePin, hasPin, isUnlocked } from "../../../db/local/pin-lock.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;
  return Response.json({ hasPin: hasPin() }, { headers: NO_STORE });
}

export async function PUT(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;

  if (hasPin() && !isUnlocked((await cookies()).get(UNLOCK_COOKIE)?.value)) {
    return Response.json({ error: "Desbloquea Modus antes de cambiar el PIN." }, { status: 403, headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400, headers: NO_STORE });
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const { currentPin, newPin } = record;
  if ((newPin !== null && typeof newPin !== "string") || (currentPin !== undefined && typeof currentPin !== "string")) {
    return Response.json({ error: "Datos de PIN inválidos" }, { status: 400, headers: NO_STORE });
  }

  const result = changePin({ currentPin: currentPin as string | undefined, newPin: newPin as string | null });
  if (!result.ok) {
    return Response.json(
      { error: result.error, ...(result.retryAfter ? { retryAfter: result.retryAfter } : {}) },
      { status: result.status, headers: NO_STORE },
    );
  }
  return Response.json({ hasPin: newPin !== null }, { headers: NO_STORE });
}
