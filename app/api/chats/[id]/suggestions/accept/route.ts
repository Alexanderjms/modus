import type { DatabaseSync } from "node:sqlite";
import {
  jsonResponse,
  withNoStore,
  parsePositiveSafeInt,
  rowToChatConversation,
} from "../../../../../../db/local/conversations.cjs";
import {
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
  readLimitedJsonBody,
} from "../../../../../../db/local/chat.cjs";
import {
  ensureSuggestionTasksTable,
  validateSuggestionAcceptReview,
  isValidUuid,
} from "../../../../../../db/local/task-suggestions.cjs";
import { applySuggestionAcceptance } from "../accept-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 50;

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const chatId = parsePositiveSafeInt((await props.params).id);
  if (chatId === null) return jsonResponse({ error: "Identificador de chat inválido" }, 400);

  const bodyResult = await readLimitedJsonBody(request, 512 * 1024);
  if (bodyResult.error) return bodyResult.error;
  const rawItems = (bodyResult.data as { items?: unknown }).items;
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_ITEMS) {
    return jsonResponse({ error: "Lista de sugerencias inválida" }, 400);
  }

  const items: { suggestionId: string; reviewData: any; reviewMode: string }[] = [];
  const seen = new Set<string>();
  for (const raw of rawItems) {
    const suggestionId = typeof raw?.suggestionId === "string" ? raw.suggestionId.trim() : "";
    if (!isValidUuid(suggestionId) || seen.has(suggestionId)) {
      return jsonResponse({ error: "Identificador de sugerencia inválido" }, 400);
    }
    seen.add(suggestionId);
    const review = validateSuggestionAcceptReview(raw.review);
    if (review.error || !review.data) {
      return jsonResponse({ error: review.error || "Datos de revisión inválidos" }, 400);
    }
    const reviewMode = review.mode === "add-tags" || review.mode === "add-subtasks" || review.mode === "edit" || review.mode === "context"
      ? review.mode
      : "create";
    items.push({ suggestionId, reviewData: review.data as any, reviewMode });
  }

  let db: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) return withNoStore(dbResult.error);
    db = dbResult.db as DatabaseSync;

    const user = resolveUser(db);
    if (user instanceof Response) return withNoStore(user);

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
      const results: { suggestionId: string; task: unknown; alreadyAccepted: boolean }[] = [];
      let changed = false;
      for (const item of items) {
        const outcome = applySuggestionAcceptance(db, { chatRow, chatId, projectId, ...item, state });
        if ("error" in outcome) {
          db.exec("ROLLBACK;");
          return jsonResponse({ error: outcome.error }, outcome.status);
        }
        if (!outcome.alreadyAccepted) changed = true;
        results.push({ suggestionId: item.suggestionId, task: outcome.task, alreadyAccepted: outcome.alreadyAccepted });
      }

      if (changed) {
        db.prepare(`
          UPDATE chats
          SET mensajes = ?, revision = ?, actualizado_en = ?
          WHERE id = ? AND revision = ?
        `).run(
          JSON.stringify(state.messages),
          Number(chatRow.revision) + 1,
          new Date().toISOString(),
          chatId,
          chatRow.revision as number,
        );
      }

      db.exec("COMMIT;");
      committed = true;

      const freshChatRow = db.prepare("SELECT * FROM chats WHERE id = ?").get(chatId) as Record<string, unknown>;
      return jsonResponse({ conversation: rowToChatConversation(freshChatRow), results }, 200);
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
      return jsonResponse({ error: "Error al procesar la aceptación de las sugerencias" }, 500);
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
