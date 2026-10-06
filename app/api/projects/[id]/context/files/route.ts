import type { DatabaseSync } from "node:sqlite";
import {
  validateLoopbackSecurity,
  parseProjectId,
  resolveUser,
  openProjectDatabase,
} from "../../../../../../db/local/projects.cjs";
import {
  saveProjectFile,
  MAX_FILE_SIZE_BYTES,
} from "../../../../../../db/local/project-context.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

// Permitir hasta 10 MiB de archivo más hasta 64 KiB de encabezados/overhead multipart
const MAX_MULTIPART_REQUEST_BYTES = MAX_FILE_SIZE_BYTES + 64 * 1024;

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

export async function POST(
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

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return jsonNoStore({ error: "Content-Type debe ser multipart/form-data" }, 400);
  }

  // Pre-filtro: Comprobar Content-Length si viene presente
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const parsedLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isSafeInteger(parsedLength) && parsedLength > MAX_MULTIPART_REQUEST_BYTES) {
      return jsonNoStore({ error: "El archivo excede el tamaño máximo permitido de 10 MiB" }, 413);
    }
  }

  // Verificar ownership del proyecto antes de procesar o guardar el archivo
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

    // Leer el body con streaming protegiendo contra payloads excesivos
    const reader = request.body?.getReader();
    if (!reader) {
      return jsonNoStore({ error: "Cuerpo de solicitud requerido" }, 400);
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_MULTIPART_REQUEST_BYTES) {
          await reader.cancel();
          return jsonNoStore({ error: "El archivo excede el tamaño máximo permitido de 10 MiB" }, 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const fullPayload = Buffer.concat(chunks);
    const simulatedRequest = new Request("http://localhost/upload", {
      method: "POST",
      headers: {
        "content-type": contentType,
      },
      body: fullPayload,
      // @ts-expect-error duplex required for Request with body in some node types
      duplex: "half",
    });

    let formData: FormData;
    try {
      formData = await simulatedRequest.formData();
    } catch {
      return jsonNoStore({ error: "Cuerpo multipart/form-data inválido o corrupto" }, 400);
    }

    const fileEntry = formData.get("file");
    if (!fileEntry || typeof fileEntry === "string") {
      return jsonNoStore({ error: "Se requiere un archivo en el campo 'file'" }, 400);
    }

    const file = fileEntry as File;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return jsonNoStore({ error: "El archivo excede el tamaño máximo permitido de 10 MiB" }, 413);
    }
    if (file.size === 0) {
      return jsonNoStore({ error: "El archivo subido está vacío" }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    db.exec("BEGIN IMMEDIATE;");
    let inTransaction = true;
    try {
      // Re-verificar ownership dentro de la transacción inmediata
      const projectStillExists = db
        .prepare("SELECT id FROM proyectos WHERE id = ? AND usuario_id = ?")
        .get(projectId, userRes.id);

      if (!projectStillExists) {
        db.exec("ROLLBACK;");
        inTransaction = false;
        return jsonNoStore({ error: "Proyecto no encontrado o no pertenece a tu perfil" }, 404);
      }

      const saved = saveProjectFile(db, projectId, {
        filename: file.name,
        mimeType: file.type,
        buffer,
      });

      db.exec("COMMIT;");
      inTransaction = false;

      return jsonNoStore(
        {
          resource: {
            title: saved.filename,
            url: saved.url,
          },
        },
        201,
      );
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
