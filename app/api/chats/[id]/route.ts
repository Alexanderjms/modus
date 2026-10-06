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
  computeChatTitle,
  validateSaveChatPayload,
  rowToChatConversation,
  MAX_CHAT_JSON_BODY_BYTES,
} from "../../../../db/local/conversations.cjs";
import { readLimitedJsonBody } from "../../../../db/local/chat.cjs";

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
      .prepare("SELECT id, revision, titulo, mensajes FROM chats WHERE id = ? AND proyecto_id = ?")
      .get(chatId, projectId) as Record<string, unknown> | undefined;

    if (!existingChat) {
      return jsonResponse({ error: "Conversación no encontrada o no pertenece al proyecto" }, 404);
    }

    const firstUserMsg = messages.find((m: { role: string }) => m.role === "user");
    const newTitle = firstUserMsg ? computeChatTitle(firstUserMsg.content) : String(existingChat.titulo || "Nuevo chat");

    const nowIso = new Date().toISOString();
    const newRevision = revision + 1;
    const messagesJson = JSON.stringify(messages);

    db.exec("BEGIN IMMEDIATE;");
    let committed = false;
    try {
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