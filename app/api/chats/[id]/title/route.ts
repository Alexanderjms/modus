import type { DatabaseSync } from "node:sqlite";
import { cookies } from "next/headers";
import { UNLOCK_COOKIE, isUnlocked, lockKind } from "../../../../../db/local/pin-lock.cjs";
import { OAuthError } from "../../../../../db/local/chatgpt-oauth.cjs";
import {
  jsonResponse,
  withNoStore,
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
  getDecryptedProviderKey,
  executeInference,
  getOpenCodeProtocolForModel,
  readLimitedJsonBody,
  ALLOWED_PROVIDERS,
  BEDROCK_ALLOWED_REGIONS,
} from "../../../../../db/local/chat.cjs";
import { parsePositiveSafeInt, ensureChatsTable } from "../../../../../db/local/conversations.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TITLE_PROMPT =
  "Eres un asistente que pone título a conversaciones. Recibirás el primer mensaje de un usuario y un extracto de la respuesta. " +
  "Responde SOLO con un título en español de 2 a 5 palabras que resuma lo que el usuario quiere conseguir. " +
  "Sin comillas, sin punto final, sin emojis, sin saludos ni explicaciones. Si el mensaje es solo un saludo, responde exactamente: Conversación general.";

function cleanTitle(raw: string): string | null {
  const line = raw.split("\n").map((item) => item.trim()).find(Boolean) ?? "";
  const title = line
    .replace(/^[#>*\-\s]+/, "")
    .replace(/^(t[ií]tulo|title)\s*:\s*/i, "")
    .replace(/^["'“”«»`]+|["'“”«»`.]+$/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, 60);
  return title.length >= 3 ? title : null;
}

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const { id: rawId } = await props.params;
  const chatId = parsePositiveSafeInt(rawId);
  const projectId = parsePositiveSafeInt(new URL(request.url).searchParams.get("projectId"));
  if (chatId === null || projectId === null) {
    return jsonResponse({ error: "Parámetros inválidos" }, 400);
  }

  const bodyResult = await readLimitedJsonBody(request, 4096);
  if (bodyResult.error) return withNoStore(bodyResult.error);
  const { provider, model, protocol, region } = (bodyResult.data ?? {}) as Record<string, unknown>;
  if (typeof provider !== "string" || !ALLOWED_PROVIDERS.has(provider)) {
    return jsonResponse({ error: "Proveedor inválido" }, 400);
  }
  if (provider === "chatgpt" && lockKind() && !isUnlocked((await cookies()).get(UNLOCK_COOKIE)?.value)) {
    return jsonResponse({ error: "Desbloquea tu perfil antes de usar ChatGPT." }, 401);
  }
  if (typeof model !== "string" || !model.trim() || model.length > 1000) {
    return jsonResponse({ error: "Modelo inválido" }, 400);
  }
  if (provider === "bedrock" && (typeof region !== "string" || !BEDROCK_ALLOWED_REGIONS.has(region))) {
    return jsonResponse({ error: "Región inválida" }, 400);
  }

  let db: DatabaseSync | null = null;
  let firstUser = "";
  let firstAssistant = "";
  let apiKey: string | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) return withNoStore(dbResult.error);
    db = dbResult.db as DatabaseSync;

    const user = resolveUser(db);
    if (user instanceof Response) return withNoStore(user);

    const project = db.prepare("SELECT id FROM proyectos WHERE id = ? AND usuario_id = ?").get(projectId, user.id);
    if (!project) return jsonResponse({ error: "Proyecto no encontrado" }, 404);

    ensureChatsTable(db);
    const chat = db
      .prepare("SELECT titulo_manual, mensajes FROM chats WHERE id = ? AND proyecto_id = ?")
      .get(chatId, projectId) as { titulo_manual: number; mensajes: string } | undefined;
    if (!chat) return jsonResponse({ error: "Conversación no encontrada" }, 404);
    if (Number(chat.titulo_manual) === 1) return jsonResponse({ title: null }, 200);

    const messages = JSON.parse(chat.mensajes || "[]") as { role: string; content: string }[];
    firstUser = messages.find((message) => message.role === "user")?.content ?? "";
    firstAssistant = messages.find((message) => message.role === "assistant")?.content ?? "";
    if (!firstUser.trim()) return jsonResponse({ title: null }, 200);

    apiKey = await getDecryptedProviderKey(db, user.id, provider, provider === "chatgpt" ? (await cookies()).get(UNLOCK_COOKIE)?.value ?? null : undefined);
  } catch (error) {
    if (error instanceof OAuthError) return jsonResponse({ error: error.message, code: error.code }, error.status);
    return jsonResponse({ error: "Error interno del servidor" }, 500);
  } finally {
    try {
      db?.close();
    } catch {}
  }
  if (!apiKey) return jsonResponse({ title: null }, 200);

  let effectiveProtocol = "chat-completions";
  if (provider === "opencode") {
    effectiveProtocol = getOpenCodeProtocolForModel(model) ?? (typeof protocol === "string" ? protocol : "chat-completions");
  } else if (provider === "bedrock" || provider === "chatgpt") {
    effectiveProtocol = "responses";
  }

  const inference = await executeInference(
    provider,
    apiKey,
    model,
    effectiveProtocol,
    typeof region === "string" ? region : null,
    [
      {
        role: "user",
        content: `Primer mensaje del usuario:\n${firstUser.slice(0, 1500)}\n\nExtracto de la respuesta:\n${firstAssistant.slice(0, 500)}`,
      },
    ],
    "",
    projectId,
    request.signal,
    20000,
    null,
    TITLE_PROMPT,
  );
  const title = "text" in inference && typeof inference.text === "string" ? cleanTitle(inference.text) : null;
  if (!title) return jsonResponse({ title: null }, 200);

  let writeDb: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) return jsonResponse({ title: null }, 200);
    writeDb = dbResult.db as DatabaseSync;
    const result = writeDb
      .prepare("UPDATE chats SET titulo = ?, titulo_manual = 1 WHERE id = ? AND proyecto_id = ? AND titulo_manual = 0")
      .run(title, chatId, projectId);
    return jsonResponse({ title: Number(result.changes) === 1 ? title : null }, 200);
  } catch {
    return jsonResponse({ title: null }, 200);
  } finally {
    try {
      writeDb?.close();
    } catch {}
  }
}
