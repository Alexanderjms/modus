import type { DatabaseSync } from "node:sqlite";
import {
  jsonResponse,
  withNoStore,
  parsePositiveSafeInt,
  rowToChatConversation,
} from "../../../../../../../db/local/conversations.cjs";
import {
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
  readLimitedJsonBody,
} from "../../../../../../../db/local/chat.cjs";
import {
  ensureSuggestionTasksTable,
  validateSuggestionAcceptReview,
  isValidUuid,
} from "../../../../../../../db/local/task-suggestions.cjs";
import { applySuggestionAcceptance } from "../../accept-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string; suggestionId: string }> }
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const { id: rawChatId, suggestionId: rawSuggestionId } = await props.params;

  const chatId = parsePositiveSafeInt(rawChatId);
  if (chatId === null) {
    return jsonResponse({ error: "Identificador de chat inválido" }, 400);
  }

  const suggestionId = typeof rawSuggestionId === "string" ? rawSuggestionId.trim() : "";
  if (!isValidUuid(suggestionId)) {
    return jsonResponse({ error: "Identificador de sugerencia inválido" }, 400);
  }

  const bodyResult = await readLimitedJsonBody(request, 32 * 1024);
  if (bodyResult.error) return bodyResult.error;
  const reviewValidation = validateSuggestionAcceptReview(bodyResult.data);
  if (reviewValidation.error || !reviewValidation.data) {
    return jsonResponse({ error: reviewValidation.error || "Datos de revisión inválidos" }, 400);
  }
  const reviewData = reviewValidation.data as any;
  const reviewMode = reviewValidation.mode === "add-tags" || reviewValidation.mode === "add-subtasks" || reviewValidation.mode === "edit" || reviewValidation.mode === "context"
    ? reviewValidation.mode
    : "create";

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

    ensureSuggestionTasksTable(db);

    db.exec("BEGIN IMMEDIATE;");
    let committed = false;
    try {
      const chatRow = db
        .prepare(`
          SELECT c.*, p.usuario_id
          FROM chats c
          INNER JOIN proyectos p ON p.id = c.proyecto_id
          WHERE c.id = ?
        `)
        .get(chatId) as (Record<string, unknown> & { usuario_id: number; proyecto_id: number }) | undefined;

      if (!chatRow || Number(chatRow.usuario_id) !== Number(user.id)) {
        db.exec("ROLLBACK;");
        return jsonResponse({ error: "Conversación no encontrada o no pertenece a tu perfil" }, 404);
      }

      const projectId = Number(chatRow.proyecto_id);

      const state: { messages: any[] | null } = { messages: null };
      const outcome = applySuggestionAcceptance(db, { chatRow, chatId, projectId, suggestionId, reviewData, reviewMode, state });
      if ("error" in outcome) {
        db.exec("ROLLBACK;");
        return jsonResponse({ error: outcome.error }, outcome.status);
      }
      if (outcome.alreadyAccepted) {
        db.exec("COMMIT;");
        committed = true;
        return jsonResponse(
          { conversation: rowToChatConversation(chatRow), task: outcome.task, alreadyAccepted: true },
          200
        );
      }
      const messages = state.messages as any[];
      const finalTask = outcome.task;


      const nextRevision = Number(chatRow.revision) + 1;
      const updatedMessagesJson = JSON.stringify(messages);
      const nowIso = new Date().toISOString();

      db.prepare(`
        UPDATE chats
        SET
          mensajes = ?,
          revision = ?,
          actualizado_en = ?
        WHERE id = ? AND revision = ?
      `).run(updatedMessagesJson, nextRevision, nowIso, chatId, chatRow.revision as number);

      db.exec("COMMIT;");
      committed = true;

      const freshChatRow = db.prepare("SELECT * FROM chats WHERE id = ?").get(chatId) as Record<string, unknown>;
      const canonicalChat = rowToChatConversation(freshChatRow);

      return jsonResponse(
        {
          conversation: canonicalChat,
          task: finalTask,
          alreadyAccepted: false,
        },
        200
      );
    } catch (txErr) {
      if (!committed) {
        try {
          db.exec("ROLLBACK;");
        } catch {}
      }
      const code = (txErr as { code?: unknown } | null)?.code;
      if (typeof code === "string" && code.startsWith("INVALID_")) {
        return jsonResponse({ error: (txErr as Error).message }, 400);
      }
      return jsonResponse({ error: "Error al procesar la aceptación de la sugerencia" }, 500);
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
