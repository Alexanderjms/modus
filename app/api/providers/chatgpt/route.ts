import { cookies } from "next/headers";
import {
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
} from "../../../../db/local/providers.cjs";
import { UNLOCK_COOKIE, isUnlocked, lockKind } from "../../../../db/local/pin-lock.cjs";
import { profileFor, publicConnection, disconnect } from "../../../../db/local/chatgpt-oauth.cjs";

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

async function requireUnlocked(): Promise<Response | null> {
  if (!lockKind()) return null;
  const token = (await cookies()).get(UNLOCK_COOKIE)?.value;
  return isUnlocked(token) ? null : json({ error: "Desbloquea tu perfil para gestionar la conexión de ChatGPT." }, 401);
}

export async function GET(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;

  const sessionError = await requireUnlocked();
  if (sessionError) return sessionError;

  const dbResult = openProjectDatabase();
  if ("error" in dbResult) return dbResult.error;
  const { db } = dbResult;

  try {
    const user = resolveUser(db);
    if (user instanceof Response) return user;
    return json({ connection: publicConnection(profileFor(db, user.id, (await cookies()).get(UNLOCK_COOKIE)?.value ?? null)) });
  } catch (reason) {
    if (isOAuthError(reason)) return json({ error: reason.message, code: reason.code }, reason.status);
    return json({ error: "No se pudo consultar la conexión de ChatGPT." }, 500);
  } finally {
    try {
      db.close();
    } catch {}
  }
}

export async function DELETE(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;

  const sessionError = await requireUnlocked();
  if (sessionError) return sessionError;

  const dbResult = openProjectDatabase();
  if ("error" in dbResult) return dbResult.error;
  const { db } = dbResult;

  let profile: string;
  try {
    const user = resolveUser(db);
    if (user instanceof Response) return user;
    profile = profileFor(db, user.id, (await cookies()).get(UNLOCK_COOKIE)?.value ?? null);
  } catch (reason) {
    if (isOAuthError(reason)) return json({ error: reason.message, code: reason.code }, reason.status);
    return json({ error: "No se pudo preparar la desconexión de ChatGPT." }, 500);
  } finally {
    try {
      db.close();
    } catch {}
  }

  try {
    return json(await disconnect(profile));
  } catch (reason) {
    if (isOAuthError(reason)) return json({ error: reason.message, code: reason.code }, reason.status);
    return json({ error: "No se pudo desconectar ChatGPT." }, 500);
  }
}
