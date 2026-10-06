import type { DatabaseSync } from "node:sqlite";
import {
  jsonResponse,
  withNoStore,
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
  getDecryptedProviderKey,
  discoverProviderModels,
  validateChatRequest,
  readLimitedJsonBody,
  executeInference,
  getOpenCodeProtocolForModel,
  MAX_CHAT_BODY_BYTES,
} from "../../../db/local/chat.cjs";
import { getProjectContext } from "../../../db/local/project-context.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const bodyResult = await readLimitedJsonBody(request, MAX_CHAT_BODY_BYTES);
  if (bodyResult.error) return bodyResult.error;

  const validation = validateChatRequest(bodyResult.data);
  if (validation.error) return validation.error;

  const { projectId, provider, model, protocol: requestedProtocol, region, messages } = validation.data;

  let db: DatabaseSync | null = null;
  let projectRow: { id: number; nombre: string } | undefined;
  let apiKey: string | null = null;

  let projectContext: { context: string; rules: string[]; resources: { title: string; url: string }[] } | null = null;

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

    try {
      projectRow = db
        .prepare("SELECT id, nombre FROM proyectos WHERE id = ? AND usuario_id = ?")
        .get(projectId, user.id) as { id: number; nombre: string } | undefined;
    } catch {
      return jsonResponse({ error: "Error consultando el proyecto" }, 500);
    }

    if (!projectRow) {
      return jsonResponse({ error: "Proyecto no encontrado o no pertenece a tu perfil" }, 404);
    }

    try {
      projectContext = getProjectContext(db, projectId);
    } catch {
      return jsonResponse({ error: "No se pudo cargar el contexto del proyecto" }, 500);
    }

    try {
      apiKey = await getDecryptedProviderKey(db, user.id, provider);
    } catch {
      return jsonResponse({ error: "Error al recuperar la clave del proveedor" }, 500);
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

  if (!apiKey) {
    return jsonResponse(
      { error: "No hay clave configurada para el proveedor solicitado. Configúrala en Ajustes." },
      409
    );
  }

  const discovery = await discoverProviderModels(provider, apiKey, region, request.signal);
  if ("error" in discovery && discovery.error) {
    return discovery.error;
  }

  const foundModel = (discovery.models as Array<{ id: string; protocol: string | null }>).find(
    (m) => m.id === model
  );

  if (!foundModel) {
    return jsonResponse(
      { error: "El modelo solicitado no está disponible en este proveedor o región" },
      400
    );
  }

  let effectiveProtocol: "chat-completions" | "responses" | "messages" = "chat-completions";

  if (provider === "opencode") {
    const knownProtocol = getOpenCodeProtocolForModel(model);
    if (knownProtocol !== null) {
      if (requestedProtocol && requestedProtocol !== knownProtocol) {
        return jsonResponse(
          { error: "El protocolo solicitado no coincide con la familia del modelo" },
          400
        );
      }
      effectiveProtocol = knownProtocol;
    } else {
      if (!requestedProtocol) {
        return jsonResponse(
          { error: "El modelo seleccionado requiere especificar un protocolo explícito" },
          400
        );
      }
      effectiveProtocol = requestedProtocol;
    }
  } else if (provider === "bedrock") {
    effectiveProtocol = "responses";
  }

  const inference = await executeInference(
    provider,
    apiKey,
    model,
    effectiveProtocol,
    region,
    messages,
    projectRow.nombre,
    projectRow.id,
    request.signal,
    undefined,
    projectContext
  );

  if (inference.error) {
    return inference.error;
  }

  return jsonResponse(
    {
      message: {
        role: "assistant",
        content: inference.text,
      },
    },
    200
  );
}
