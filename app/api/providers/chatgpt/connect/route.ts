import { cookies } from "next/headers";
import {
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
} from "../../../../../db/local/providers.cjs";
import { UNLOCK_COOKIE, isUnlocked, lockKind } from "../../../../../db/local/pin-lock.cjs";
import { COOKIE, beginAuthorization, profileFor } from "../../../../../db/local/chatgpt-oauth.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

type OAuthLikeError = { message: string; status: number; code: string };

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

function isOAuthError(reason: unknown): reason is OAuthLikeError {
  return Boolean(reason) && typeof reason === "object" && (reason as { name?: string }).name === "OAuthError";
}

export async function POST(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;

  const token = (await cookies()).get(UNLOCK_COOKIE)?.value;
  if (lockKind()) {
    if (!isUnlocked(token)) {
      return json({ error: "Desbloquea tu perfil para conectar ChatGPT." }, 401);
    }
  }

  const dbResult = openProjectDatabase();
  if ("error" in dbResult) return dbResult.error;
  const { db } = dbResult;

  let profile: string;
  try {
    const user = resolveUser(db);
    if (user instanceof Response) return user;
    profile = profileFor(db, user.id, token ?? null);
  } catch (reason) {
    if (isOAuthError(reason)) return json({ error: reason.message, code: reason.code }, reason.status);
    return json({ error: "No se pudo preparar la conexión de ChatGPT." }, 500);
  } finally {
    try {
      db.close();
    } catch {}
  }

  try {
    const url = new URL(request.url);
    url.host = request.headers.get("host")!;
    const origin = url.origin;
    const { authorizationUrl, cookie } = await beginAuthorization(profile, origin, token);
    (await cookies()).set({
      name: COOKIE,
      value: cookie,
      httpOnly: true,
      sameSite: "lax",
      path: "/auth/callback",
      maxAge: 600,
      secure: false,
    });
    return json({ authorizationUrl });
  } catch (reason) {
    if (isOAuthError(reason)) return json({ error: reason.message, code: reason.code }, reason.status);
    return json({ error: "No se pudo iniciar la conexión con ChatGPT." }, 500);
  }
}
