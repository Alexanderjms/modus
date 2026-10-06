import {
  ALLOWED_PROVIDERS_SET,
  MAX_KEY_LENGTH,
  ensureProvidersTable,
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
  readProvidersJsonBody,
  getProviderStatusList,
  isDpapiAvailable,
  encryptWithDpapi,
} from "../../../db/local/providers.cjs";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

function withNoStore(response: Response | undefined): Response {
  const res = response ?? Response.json({ error: "Error de solicitud" }, { status: 400 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const dbResult = openProjectDatabase();
  if ("error" in dbResult) return withNoStore(dbResult.error);
  const { db } = dbResult;

  try {
    const userRes = resolveUser(db);
    if (userRes instanceof Response) return withNoStore(userRes);
    const userId = userRes.id;

    ensureProvidersTable(db);
    const data = getProviderStatusList(db, userId);
    return Response.json(data, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch {
    return Response.json(
      { error: "Error interno del servidor" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  } finally {
    try {
      db.close();
    } catch {}
  }
}

export async function PUT(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  if (!isDpapiAvailable()) {
    return Response.json(
      { error: "El almacenamiento seguro Windows DPAPI no está disponible en este sistema operativo" },
      { status: 501, headers: NO_STORE_HEADERS }
    );
  }

  const bodyResult = await readProvidersJsonBody(request);
  if ("error" in bodyResult) return withNoStore(bodyResult.error);

  const body = bodyResult.data as Record<string, unknown>;
  const rootKeys = Object.keys(body);
  if (rootKeys.length !== 1 || rootKeys[0] !== "keys") {
    return Response.json(
      { error: "El cuerpo de la solicitud contiene campos no permitidos" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const keys = body.keys;
  if (typeof keys !== "object" || keys === null || Array.isArray(keys)) {
    return Response.json(
      { error: "El campo 'keys' debe ser un objeto" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const keyEntries = Object.entries(keys);
  if (keyEntries.length === 0) {
    return Response.json(
      { error: "El objeto 'keys' no puede estar vacío" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const validatedUpdates: Array<{ providerId: string; plainValue: string | null }> = [];

  for (const [providerId, rawValue] of keyEntries) {
    if (!ALLOWED_PROVIDERS_SET.has(providerId)) {
      return Response.json(
        { error: "Proveedor no permitido en la solicitud" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (rawValue === null) {
      validatedUpdates.push({ providerId, plainValue: null });
      continue;
    }

    if (typeof rawValue !== "string") {
      return Response.json(
        { error: "Valor de clave inválido en la solicitud" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
      return Response.json(
        { error: "La clave del proveedor no puede estar vacía" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (trimmed.length > MAX_KEY_LENGTH) {
      return Response.json(
        { error: `La clave excede el límite máximo de ${MAX_KEY_LENGTH} caracteres` },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    validatedUpdates.push({ providerId, plainValue: trimmed });
  }

  const preparedDbOperations: Array<{ providerId: string; encryptedValue: string | null }> = [];
  try {
    for (const item of validatedUpdates) {
      if (item.plainValue === null) {
        preparedDbOperations.push({ providerId: item.providerId, encryptedValue: null });
      } else {
        const encrypted = await encryptWithDpapi(item.plainValue);
        preparedDbOperations.push({ providerId: item.providerId, encryptedValue: encrypted });
      }
    }
  } catch {
    return Response.json(
      { error: "Error en el subsistema de cifrado seguro" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  const dbResult = openProjectDatabase();
  if ("error" in dbResult) return withNoStore(dbResult.error);
  const { db } = dbResult;

  try {
    const userRes = resolveUser(db);
    if (userRes instanceof Response) return withNoStore(userRes);
    const userId = userRes.id;

    ensureProvidersTable(db);

    db.exec("BEGIN TRANSACTION;");
    try {
      const now = new Date().toISOString();
      const upsertStmt = db.prepare(`
        INSERT INTO proveedor_claves (usuario_id, proveedor, clave_cifrada, fecha_actualizacion)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(usuario_id, proveedor) DO UPDATE SET
          clave_cifrada = excluded.clave_cifrada,
          fecha_actualizacion = excluded.fecha_actualizacion
      `);
      const deleteStmt = db.prepare(`
        DELETE FROM proveedor_claves WHERE usuario_id = ? AND proveedor = ?
      `);

      for (const op of preparedDbOperations) {
        if (op.encryptedValue === null) {
          deleteStmt.run(userId, op.providerId);
        } else {
          upsertStmt.run(userId, op.providerId, op.encryptedValue, now);
        }
      }

      db.exec("COMMIT;");
    } catch (txErr) {
      try {
        db.exec("ROLLBACK;");
      } catch {}
      throw txErr;
    }

    const data = getProviderStatusList(db, userId);
    return Response.json(data, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch {
    return Response.json(
      { error: "Error interno del servidor" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  } finally {
    try {
      db.close();
    } catch {}
  }
}
