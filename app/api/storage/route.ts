import { validateLoopbackSecurity } from "../../../db/local/providers.cjs";
import { getStorageMode, loadTursoConfig, setStorageMode } from "../../../db/local/storage.cjs";
import { hasLocalProfile } from "../../../db/local/profile.cjs";
import { openTurso } from "../../../db/cloud/turso-db.cjs";
import { PENDING_PASSWORD } from "../../../db/password.cjs";
import { cookies } from "next/headers";
import { UNLOCK_COOKIE, getCloudProfile, getSessionUserId, lockKind } from "../../../db/local/pin-lock.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;

  const mode = getStorageMode() === "turso" ? "turso" : "local";
  let profile = null;
  if (mode === "turso") {
    try {
      profile = getCloudProfile(getSessionUserId((await cookies()).get(UNLOCK_COOKIE)?.value));
    } catch {
      profile = null;
    }
  }
  let lock: "pin" | "password" | null = null;
  try {
    lock = mode === "turso" ? "password" : lockKind();
  } catch {
    lock = null;
  }
  return Response.json({ mode, profile, lock }, { headers: NO_STORE });
}

export async function PUT(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;

  let mode: unknown;
  try {
    mode = ((await request.json()) as { mode?: unknown } | null)?.mode;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400, headers: NO_STORE });
  }

  if (mode === "local") {
    if (!hasLocalProfile()) return Response.json({ next: "/onboarding/local" }, { headers: NO_STORE });
    setStorageMode("local");
    return Response.json({ next: "/inicio" }, { headers: NO_STORE });
  }
  if (mode === "turso") {
    const config = loadTursoConfig();
    let exists = false;
    let pending = false;
    if (config) {
      try {
        const db = openTurso(config);
        try {
          exists = Boolean(db.prepare("SELECT 1 AS found FROM usuarios WHERE contrasena != ? LIMIT 1").get(PENDING_PASSWORD));
          pending = Boolean(db.prepare("SELECT 1 AS found FROM usuarios WHERE contrasena = ? LIMIT 1").get(PENDING_PASSWORD));
        } finally {
          db.close();
        }
      } catch {
        exists = false;
      }
    }
    if (!exists) {
      return Response.json({ next: config && pending ? "/onboarding/turso/perfil" : "/onboarding/turso" }, { headers: NO_STORE });
    }
    setStorageMode("turso");
    return Response.json({ next: "/inicio" }, { headers: NO_STORE });
  }
  return Response.json({ error: "Modo de almacenamiento inválido." }, { status: 400, headers: NO_STORE });
}
