import type { DatabaseSync } from "node:sqlite";
import {
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
} from "../../../../db/local/projects.cjs";
import {
  jsonResponse,
  withNoStore,
  ensureChatsTable,
  parsePositiveSafeInt,
  parseNonNegativeSafeInt,
  computeChatTitle,
  validateSaveChatPayload,
  rowToChatConversation,
  MAX_CHAT_JSON_BODY_BYTES,
} from "../../../../db/local/conversations.cjs";
import { readLimitedJsonBody } from "../../../../db/local/chat.cjs";
import {
  attachmentIdsOfMessages,
  deleteUnreferencedAttachments,
  resolveMessageAttachments,
} from "../../../../db/local/chat-attachments.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const { id: rawId } = await props.params;
  const chatId = parsePositiveSafeInt(rawId);
  if (chatId === null) {
    return jsonResponse({ error: "Identificador de chat inválido" }, 400);
  }

  const url = new URL(request.url);
  const rawProjectId = url.searchParams.get("projectId");
  const projectId = parsePositiveSafeInt(rawProjectId);
  if (projectId === null) {
    return jsonResponse({ error: "Parámetro projectId inválido" }, 400);
  }

  let db: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) {
      return withNoStore(dbResult.error);
    }
    db = dbResult.db;

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

    ensureChatsTable(db);

    const chatRow = db
      .prepare("SELECT * FROM chats WHERE id = ? AND proyecto_id = ?")
      .get(chatId, projectId) as Record<string, unknown> | undefined;

    if (!chatRow) {
      return jsonResponse({ error: "Conversación no encontrada o no pertenece al proyecto" }, 404);
    }

    try {
      const chat = rowToChatConversation(chatRow);
      return jsonResponse({ chat });
    } catch {
      return jsonResponse({ error: "Error al leer la conversación" }, 500);
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

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const { id: rawId } = await props.params;
  const chatId = parsePositiveSafeInt(rawId);
  if (chatId === null) {
    return jsonResponse({ error: "Identificador de chat inválido" }, 400);
  }

  const url = new URL(request.url);
  const rawProjectId = url.searchParams.get("projectId");
  const projectId = parsePositiveSafeInt(rawProjectId);
  if (projectId === null) {
    return jsonResponse({ error: "Parámetro projectId inválido" }, 400);
  }

  const bodyResult = await readLimitedJsonBody(request, MAX_CHAT_JSON_BODY_BYTES);
  if (bodyResult.error) return withNoStore(bodyResult.error);

  const validation = validateSaveChatPayload(bodyResult.data);
  if (validation.error || !validation.data) {
    return jsonResponse({ error: validation.error || "Datos inválidos" }, 400);
  }

  const { revision, provider, model, protocol, region } = validation.data;
  const messages = validation.data.messages || [];

  let db: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) {
      return withNoStore(dbResult.error);
    }
    db = dbResult.db;

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

    ensureChatsTable(db);

    const existingChat = db
      .prepare("SELECT id, revision, titulo, titulo_manual, mensajes FROM chats WHERE id = ? AND proyecto_id = ?")
      .get(chatId, projectId) as Record<string, unknown> | undefined;

    if (!existingChat) {
      return jsonResponse({ error: "Conversación no encontrada o no pertenece al proyecto" }, 404);
    }

    const isManualTitle = Number(existingChat.titulo_manual || 0) === 1;
    let newTitle: string;
    if (isManualTitle) {
      newTitle = String(existingChat.titulo || "Nuevo chat");
    } else {
      const firstUserMsg = messages.find((m: { role: string }) => m.role === "user");
      newTitle = firstUserMsg ? computeChatTitle(firstUserMsg.content) : String(existingChat.titulo || "Nuevo chat");
    }

    const nowIso = new Date().toISOString();
    const newRevision = revision + 1;

    db.exec("BEGIN IMMEDIATE;");
    let committed = false;
    try {
      const resolved = resolveMessageAttachments(db, projectId, messages);
      if (resolved.error) {
        db.exec("ROLLBACK;");
        return jsonResponse({ error: resolved.error }, 400);
      }
      const messagesJson = JSON.stringify(resolved.data);

      const updateStmt = db.prepare(`
        UPDATE chats
        SET
          titulo = ?,
          revision = ?,
          mensajes = ?,
          proveedor = ?,
          modelo = ?,
          protocolo = ?,
          region = ?,
          actualizado_en = ?
        WHERE id = ? AND proyecto_id = ? AND revision = ?
      `);

      const result = updateStmt.run(
        newTitle,
        newRevision,
        messagesJson,
        provider,
        model,
        protocol,
        region,
        nowIso,
        chatId,
        projectId,
        revision
      );

      if (Number(result.changes) !== 1) {
        db.exec("ROLLBACK;");
        return jsonResponse(
          { error: "La conversación cambió. Recárgala antes de guardar." },
          409
        );
      }

      db.exec("COMMIT;");
      committed = true;
    } catch (err) {
      if (!committed) {
        try {
          db.exec("ROLLBACK;");
        } catch {}
      }
      throw err;
    }

    const updatedRow = db
      .prepare("SELECT * FROM chats WHERE id = ?")
      .get(chatId) as Record<string, unknown>;

    try {
      const chat = rowToChatConversation(updatedRow);
      return jsonResponse({ chat });
    } catch {
      return jsonResponse({ error: "Error al procesar la conversación guardada" }, 500);
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

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const { id: rawId } = await props.params;
  const chatId = parsePositiveSafeInt(rawId);
  if (chatId === null) {
    return jsonResponse({ error: "Identificador de chat inválido" }, 400);
  }

  const url = new URL(request.url);
  const rawProjectId = url.searchParams.get("projectId");
  const projectId = parsePositiveSafeInt(rawProjectId);
  if (projectId === null) {
    return jsonResponse({ error: "Parámetro projectId inválido" }, 400);
  }

  const bodyResult = await readLimitedJsonBody(request, MAX_CHAT_JSON_BODY_BYTES);
  if (bodyResult.error) return withNoStore(bodyResult.error);

  const body = bodyResult.data;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "El cuerpo debe ser un objeto JSON" }, 400);
  }

  const keys = Object.keys(body);
  if (keys.length !== 2 || !Object.prototype.hasOwnProperty.call(body, "title") || !Object.prototype.hasOwnProperty.call(body, "revision")) {
    return jsonResponse({ error: "El cuerpo debe contener exactamente { title, revision }" }, 400);
  }

  const { title, revision } = body as { title: unknown; revision: unknown };

  if (typeof title !== "string") {
    return jsonResponse({ error: "title debe ser una cadena de texto" }, 400);
  }
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0 || trimmedTitle.length > 80) {
    return jsonResponse({ error: "title no puede estar vacío ni superar 80 caracteres" }, 400);
  }
  if (/[\x00-\x1F\x7F]/.test(trimmedTitle)) {
    return jsonResponse({ error: "title contiene caracteres de control no permitidos" }, 400);
  }

  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    return jsonResponse({ error: "revision debe ser un entero seguro no negativo (>= 0)" }, 400);
  }

  let db: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) {
      return withNoStore(dbResult.error);
    }
    db = dbResult.db;

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

    ensureChatsTable(db);

    const existingChat = db
      .prepare("SELECT id, revision FROM chats WHERE id = ? AND proyecto_id = ?")
      .get(chatId, projectId) as Record<string, unknown> | undefined;

    if (!existingChat) {
      return jsonResponse({ error: "Conversación no encontrada o no pertenece al proyecto" }, 404);
    }

    const nowIso = new Date().toISOString();
    const newRevision = revision + 1;

    db.exec("BEGIN IMMEDIATE;");
    let committed = false;
    try {
      const updateStmt = db.prepare(`
        UPDATE chats
        SET
          titulo = ?,
          titulo_manual = 1,
          revision = ?,
          actualizado_en = ?
        WHERE id = ? AND proyecto_id = ? AND revision = ?
      `);

      const result = updateStmt.run(
        trimmedTitle,
        newRevision,
        nowIso,
        chatId,
        projectId,
        revision
      );

      if (Number(result.changes) !== 1) {
        db.exec("ROLLBACK;");
        return jsonResponse(
          { error: "La conversación cambió. Recárgala antes de renombrar." },
          409
        );
      }

      db.exec("COMMIT;");
      committed = true;
    } catch (err) {
      if (!committed) {
        try {
          db.exec("ROLLBACK;");
        } catch {}
      }
      throw err;
    }

    const updatedRow = db
      .prepare("SELECT * FROM chats WHERE id = ?")
      .get(chatId) as Record<string, unknown>;

    try {
      const chat = rowToChatConversation(updatedRow);
      return jsonResponse({ chat }, 200);
    } catch {
      return jsonResponse({ error: "Error al procesar la conversación actualizada" }, 500);
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

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const { id: rawId } = await props.params;
  const chatId = parsePositiveSafeInt(rawId);
  if (chatId === null) {
    return jsonResponse({ error: "Identificador de chat inválido" }, 400);
  }

  const url = new URL(request.url);
  const rawProjectId = url.searchParams.get("projectId");
  const projectId = parsePositiveSafeInt(rawProjectId);
  if (projectId === null) {
    return jsonResponse({ error: "Parámetro projectId inválido" }, 400);
  }

  const rawRevision = url.searchParams.get("revision");
  const revision = parseNonNegativeSafeInt(rawRevision);
  if (revision === null) {
    return jsonResponse({ error: "Parámetro revision inválido (debe ser entero >= 0)" }, 400);
  }

  let db: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) {
      return withNoStore(dbResult.error);
    }
    db = dbResult.db;

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

    ensureChatsTable(db);

    const existingChat = db
      .prepare("SELECT id, revision, mensajes FROM chats WHERE id = ? AND proyecto_id = ?")
      .get(chatId, projectId) as Record<string, unknown> | undefined;

    if (!existingChat) {
      return jsonResponse({ error: "Conversación no encontrada o no pertenece al proyecto" }, 404);
    }

    db.exec("BEGIN IMMEDIATE;");
    let committed = false;
    try {
      const deleteStmt = db.prepare(`
        DELETE FROM chats
        WHERE id = ? AND proyecto_id = ? AND revision = ?
      `);

      const result = deleteStmt.run(chatId, projectId, revision);

      if (Number(result.changes) !== 1) {
        db.exec("ROLLBACK;");
        return jsonResponse(
          { error: "La conversación cambió. Recárgala antes de eliminar." },
          409
        );
      }

      deleteUnreferencedAttachments(db, projectId, attachmentIdsOfMessages(String(existingChat.mensajes ?? "[]")));

      db.exec("COMMIT;");
      committed = true;
    } catch (err) {
      if (!committed) {
        try {
          db.exec("ROLLBACK;");
        } catch {}
      }
      throw err;
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