import type { DatabaseSync } from "node:sqlite";
import {
  validateLoopbackSecurity,
  parseProjectId,
  resolveUser,
  openProjectDatabase,
} from "../../../../../db/local/projects.cjs";
import {
  validateContextDocument,
  getProjectContext,
  saveProjectContext,
} from "../../../../../db/local/project-context.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

const MAX_CONTEXT_BODY_BYTES = 32768;

function jsonNoStore(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function withNoStore(response: Response) {
  const cloned = new Response(response.body, response);
  cloned.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return cloned;
}

async function readContextBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.split(";")[0].trim().toLowerCase() !== "application/json") {
    return { error: jsonNoStore({ error: "Content-Type debe ser application/json" }, 400) };
  }

  let rawBodyText = "";
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > MAX_CONTEXT_BODY_BYTES) {
            await reader.cancel();
            return {
              error: jsonNoStore({ error: "El cuerpo de la solicitud excede el tamaño permitido" }, 400),
            };
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    rawBodyText = Buffer.concat(chunks).toString("utf8");
  } catch {
    return { error: jsonNoStore({ error: "Error leyendo la solicitud" }, 400) };
  }

  try {
    const body = JSON.parse(rawBodyText);
    return { data: body };
  } catch {
    return { error: jsonNoStore({ error: "JSON inválido" }, 400) };
  }
}

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const { id: rawId } = await props.params;
  const projectId = parseProjectId(rawId);
  if (projectId === null) {
    return jsonNoStore({ error: "Identificador de proyecto inválido" }, 400);
  }

  let db: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) {
      return withNoStore(dbResult.error);
    }
    db = dbResult.db as DatabaseSync;

    const userRes = resolveUser(db);
    if (userRes instanceof Response) {
      return withNoStore(userRes);
    }

    const project = db
      .prepare("SELECT id FROM proyectos WHERE id = ? AND usuario_id = ?")
      .get(projectId, userRes.id);

    if (!project) {
      return jsonNoStore({ error: "Proyecto no encontrado o no pertenece a tu perfil" }, 404);
    }

    const contextDoc = getProjectContext(db, projectId);
    return jsonNoStore(contextDoc, 200);
  } catch {
    return jsonNoStore({ error: "Error interno del servidor" }, 500);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const { id: rawId } = await props.params;
  const projectId = parseProjectId(rawId);
  if (projectId === null) {
    return jsonNoStore({ error: "Identificador de proyecto inválido" }, 400);
  }

  const bodyResult = await readContextBody(request);
  if (bodyResult.error) return bodyResult.error;

  let db: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) {
      return withNoStore(dbResult.error);
    }
    db = dbResult.db as DatabaseSync;

    const userRes = resolveUser(db);
    if (userRes instanceof Response) {
      return withNoStore(userRes);
    }

    const validation = validateContextDocument(bodyResult.data, db, projectId);
    if (validation.error) {
      return jsonNoStore({ error: validation.error }, 400);
    }

    db.exec("BEGIN IMMEDIATE;");
    let inTransaction = true;

    try {
      const project = db
        .prepare("SELECT id FROM proyectos WHERE id = ? AND usuario_id = ?")
        .get(projectId, userRes.id);

      if (!project) {
        db.exec("ROLLBACK;");
        inTransaction = false;
        return jsonNoStore({ error: "Proyecto no encontrado o no pertenece a tu perfil" }, 404);
      }

      const updated = saveProjectContext(db, projectId, validation.data);
      db.exec("COMMIT;");
      inTransaction = false;

      return jsonNoStore(updated, 200);
    } catch (txErr) {
      if (inTransaction) {
        try {
          db.exec("ROLLBACK;");
        } catch {}
      }
      throw txErr;
    }
  } catch {
    return jsonNoStore({ error: "Error interno del servidor" }, 500);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}
