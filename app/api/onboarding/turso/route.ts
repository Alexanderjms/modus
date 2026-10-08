import { cookies } from "next/headers";
import { validateLoopbackSecurity } from "../../../../db/local/providers.cjs";
import { applySchema } from "../../../../db/local/migrate.cjs";
import { loadTursoConfig, setStorageMode } from "../../../../db/local/storage.cjs";
import { UNLOCK_COOKIE, USERNAME_REGEX, createSession } from "../../../../db/local/pin-lock.cjs";
import { openTurso } from "../../../../db/cloud/turso-db.cjs";
import { PENDING_PASSWORD, hashPasswordAsync, verifyPassword } from "../../../../db/password.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function fail(error: string, status: number) {
  return Response.json({ error }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    return fail("JSON inválido", 400);
  }

  const login = body.login === true;
  const username = typeof body.usuario === "string" ? body.usuario.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!USERNAME_REGEX.test(username)) {
    return fail("El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo.", 400);
  }
  if (password.length < 8 || password.length > 200) return fail("La contraseña debe tener entre 8 y 200 caracteres.", 400);
  if (body.confirmation !== password) return fail("Las contraseñas no coinciden.", 400);

  const config = loadTursoConfig();
  if (!config) return fail("Primero conecta tu base de datos de Turso.", 409);

  let userId: number;
  let db;
  try {
    db = openTurso(config);
  } catch {
    return fail("No se pudo conectar con Turso. Revisa tus credenciales.", 502);
  }
  try {
    applySchema(db);
    const pending = db.prepare("SELECT id FROM usuarios WHERE contrasena = ?").get(PENDING_PASSWORD) as { id: number } | undefined;
    const existing = db.prepare("SELECT id, contrasena FROM usuarios WHERE usuario = ? COLLATE NOCASE").get(username) as
      | { id: number; contrasena: string }
      | undefined;
    if (login && !existing) return fail("Usuario o contraseña incorrectos.", 403);
    if (!login && pending && (!existing || existing.id === pending.id)) {
      const hash = await hashPasswordAsync(password);
      db.prepare("UPDATE usuarios SET usuario = ?, contrasena = ?, ultimo_acceso = ? WHERE id = ?")
        .run(username, hash, new Date().toISOString(), pending.id);
      userId = pending.id;
    } else if (existing) {
      if (!verifyPassword(password, existing.contrasena)) {
        return fail("Ese usuario ya existe y la contraseña no coincide.", 403);
      }
      userId = existing.id;
    } else {
      const hash = await hashPasswordAsync(password);
      const now = new Date().toISOString();
      const result = db
        .prepare("INSERT INTO usuarios (usuario, contrasena, fecha_creacion, ultimo_acceso) VALUES (?, ?, ?, ?)")
        .run(username, hash, now, now);
      userId = Number(result.lastInsertRowid);
    }
  } catch {
    return fail("No se pudo preparar la base de datos en Turso.", 500);
  } finally {
    db.close();
  }

  setStorageMode("turso");
  (await cookies()).set({
    name: UNLOCK_COOKIE,
    value: createSession(userId),
    httpOnly: true,
    sameSite: "strict",
    path: "/",
  });
  return Response.json({ ok: true }, { status: 201, headers: NO_STORE });
}
