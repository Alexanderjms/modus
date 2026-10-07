import type { DatabaseSync } from "node:sqlite";
import {
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
} from "../../../../db/local/projects.cjs";
import {
  jsonResponse,
  withNoStore,
  parsePositiveSafeInt,
} from "../../../../db/local/conversations.cjs";
import {
  saveAttachment,
  getStagedAttachmentBytes,
  pruneStagedAttachments,
  validateAttachmentBytes,
  attachmentTypeFor,
  attachmentError,
  MAX_STAGED_BYTES,
} from "../../../../db/local/chat-attachments.cjs";
import { maxAttachmentBytes } from "../../../chat-attachments.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const url = new URL(request.url);
  const projectId = parsePositiveSafeInt(url.searchParams.get("projectId"));
  if (projectId === null) {
    return jsonResponse({ error: "Parámetro projectId inválido" }, 400);
  }

  const name = url.searchParams.get("name");
  const rawHeaderType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const headerType = rawHeaderType === "application/octet-stream" ? "" : rawHeaderType;

  const nameError = attachmentError({ name, type: headerType, size: 1 });
  if (nameError) return jsonResponse({ error: nameError }, 400);

  const type = attachmentTypeFor(name);

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const parsedLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isSafeInteger(parsedLength) && parsedLength > maxAttachmentBytes) {
      return jsonResponse({ error: "El archivo supera el límite de 10 MiB." }, 413);
    }
  }

  let db: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) {
      return withNoStore(dbResult.error);
    }
    db = dbResult.db as DatabaseSync;

    const user = resolveUser(db);
    if (user instanceof Response) {
      return withNoStore(user);
    }

    const project = db
      .prepare("SELECT id FROM proyectos WHERE id = ? AND usuario_id = ?")
      .get(projectId, user.id);

    if (!project) {
      return jsonResponse({ error: "Proyecto no encontrado o no pertenece a tu perfil" }, 404);
    }

    const reader = request.body?.getReader();
    if (!reader) {
      return jsonResponse({ error: "Cuerpo de solicitud requerido" }, 400);
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxAttachmentBytes) {
          await reader.cancel();
          return jsonResponse({ error: "El archivo supera el límite de 10 MiB." }, 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    if (request.signal.aborted) {
      return jsonResponse({ error: "Solicitud cancelada" }, 499);
    }

    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) {
      return jsonResponse({ error: "El archivo está vacío." }, 400);
    }

    if (!validateAttachmentBytes(type, buffer)) {
      return jsonResponse({ error: "El contenido del archivo no coincide con su tipo." }, 400);
    }

    db.exec("BEGIN IMMEDIATE;");
    let committed = false;
    try {
      const projectStillExists = db
        .prepare("SELECT id FROM proyectos WHERE id = ? AND usuario_id = ?")
        .get(projectId, user.id);

      if (!projectStillExists) {
        db.exec("ROLLBACK;");
        return jsonResponse({ error: "Proyecto no encontrado o no pertenece a tu perfil" }, 404);
      }

      if (request.signal.aborted) {
        db.exec("ROLLBACK;");
        return jsonResponse({ error: "Solicitud cancelada" }, 499);
      }
      pruneStagedAttachments(db, projectId);
      if (getStagedAttachmentBytes(db, projectId) + buffer.length > MAX_STAGED_BYTES) {
        db.exec("ROLLBACK;");
        return jsonResponse({ error: "Hay demasiados adjuntos sin enviar en este proyecto. Envía o elimina algunos antes de subir más." }, 413);
      }

      const attachment = saveAttachment(db, projectId, name, type, buffer);

      db.exec("COMMIT;");
      committed = true;

      return jsonResponse({ attachment }, 201);
    } catch (err) {
      if (!committed) {
        try {
          db.exec("ROLLBACK;");
        } catch {}
      }
      throw err;
    }
  } catch {
    return jsonResponse({ error: "Error interno del servidor" }, 500);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}
