import type { DatabaseSync } from "node:sqlite";
import {
  validateLoopbackSecurity,
  parseProjectId,
  resolveUser,
  openProjectDatabase,
} from "../../../../../../../db/local/projects.cjs";
import {
  getProjectFile,
  FILE_ID_REGEX,
} from "../../../../../../../db/local/project-context.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

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

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string; fileId: string }> },
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const { id: rawId, fileId: rawFileId } = await props.params;
  const projectId = parseProjectId(rawId);
  if (projectId === null) {
    return jsonNoStore({ error: "Identificador de proyecto inválido" }, 400);
  }

  if (typeof rawFileId !== "string" || !FILE_ID_REGEX.test(rawFileId)) {
    return jsonNoStore({ error: "Identificador de archivo inválido" }, 400);
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

    const file = getProjectFile(db, projectId, rawFileId);
    if (!file) {
      return jsonNoStore({ error: "Archivo no encontrado" }, 404);
    }

    // Encabezados seguros para descarga
    const headers = new Headers();
    headers.set("Content-Type", file.mimeType || "application/octet-stream");
    headers.set("Content-Length", String(file.size));
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");

    // Formatear Content-Disposition saneado
    const safeAsciiName = file.filename.replace(/["\r\n\\]/g, "_").replace(/[^\x20-\x7E]/g, "_");
    const encodedUtf8Name = encodeURIComponent(file.filename);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodedUtf8Name}`,
    );

    return new Response(file.data, {
      status: 200,
      headers,
    });
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
