import type { DatabaseSync } from "node:sqlite";
import {
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
} from "../../../../../db/local/projects.cjs";
import {
  jsonResponse,
  withNoStore,
  parsePositiveSafeInt,
} from "../../../../../db/local/conversations.cjs";
import {
  getAttachment,
  deleteAttachment,
  isValidAttachmentId,
} from "../../../../../db/local/chat-attachments.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const { id } = await props.params;
  const url = new URL(request.url);
  const projectId = parsePositiveSafeInt(url.searchParams.get("projectId"));
  if (projectId === null) {
    return jsonResponse({ error: "Parámetro projectId inválido" }, 400);
  }
  if (!isValidAttachmentId(id)) {
    return jsonResponse({ error: "Identificador de adjunto inválido" }, 400);
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

    const attachment = getAttachment(db, projectId, id);
    if (!attachment) {
      return jsonResponse({ error: "Adjunto no encontrado" }, 404);
    }

    const headers = new Headers();
    headers.set("Content-Type", attachment.type || "application/octet-stream");
    headers.set("Content-Length", String(attachment.size));
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");

    const safeAsciiName = attachment.name.replace(/["\r\n\\]/g, "_").replace(/[^\x20-\x7E]/g, "_");
    const encodedUtf8Name = encodeURIComponent(attachment.name);
    const disposition = INLINE_IMAGE_TYPES.has(attachment.type) ? "inline" : "attachment";
    headers.set(
      "Content-Disposition",
      `${disposition}; filename="${safeAsciiName}"; filename*=UTF-8''${encodedUtf8Name}`
    );

    return new Response(attachment.data, {
      status: 200,
      headers,
    });
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

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const { id } = await props.params;
  const url = new URL(request.url);
  const projectId = parsePositiveSafeInt(url.searchParams.get("projectId"));
  if (projectId === null) {
    return jsonResponse({ error: "Parámetro projectId inválido" }, 400);
  }
  if (!isValidAttachmentId(id)) {
    return jsonResponse({ error: "Identificador de adjunto inválido" }, 400);
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

    const result = deleteAttachment(db, projectId, id);
    if (result.error === "notfound") {
      return jsonResponse({ error: "Adjunto no encontrado" }, 404);
    }
    if (result.error === "linked") {
      return jsonResponse(
        { error: "El adjunto está asociado a un mensaje y no puede eliminarse." },
        409
      );
    }

    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
      },
    });
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
