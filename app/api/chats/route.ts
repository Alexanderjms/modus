import type { DatabaseSync } from "node:sqlite";
import {
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
} from "../../../db/local/projects.cjs";
import {
  jsonResponse,
  withNoStore,
  ensureChatsTable,
  parsePositiveSafeInt,
  computeChatTitle,
  rowToChatSummary,
  rowToChatConversation,
  MAX_CHAT_JSON_BODY_BYTES,
} from "../../../db/local/conversations.cjs";
import { readLimitedJsonBody } from "../../../db/local/chat.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

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

    const rows = db
      .prepare(
        `SELECT id, proyecto_id, titulo, revision, creado_en, actualizado_en, proveedor, modelo, protocolo, region
         FROM chats
         WHERE proyecto_id = ?
         ORDER BY actualizado_en DESC, id DESC`
      )
      .all(projectId) as Array<Record<string, unknown>>;

    const chats = rows.map(rowToChatSummary);
    return jsonResponse({ chats });
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

export async function POST(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const bodyResult = await readLimitedJsonBody(request, MAX_CHAT_JSON_BODY_BYTES);
  if (bodyResult.error) return withNoStore(bodyResult.error);

  const body = bodyResult.data;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "El cuerpo debe ser un objeto JSON" }, 400);
  }

  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "projectId") {
    return jsonResponse({ error: "El cuerpo debe contener exactamente { projectId }" }, 400);
  }

  const projectId = parsePositiveSafeInt(body.projectId);
  if (projectId === null) {
    return jsonResponse({ error: "projectId inválido" }, 400);
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

    const nowIso = new Date().toISOString();
    const title = computeChatTitle("");

    const insertStmt = db.prepare(`
      INSERT INTO chats (
        proyecto_id,
        titulo,
        revision,
        mensajes,
        proveedor,
        modelo,
        protocolo,
        region,
        creado_en,
        actualizado_en
      ) VALUES (?, ?, 0, '[]', NULL, NULL, NULL, NULL, ?, ?)
    `);

    const result = insertStmt.run(projectId, title, nowIso, nowIso);
    const newId = Number(result.lastInsertRowid);

    const row = db
      .prepare("SELECT * FROM chats WHERE id = ?")
      .get(newId) as Record<string, unknown>;

    const chat = rowToChatConversation(row);
    return jsonResponse({ chat }, 201);
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