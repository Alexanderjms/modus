import type { DatabaseSync } from "node:sqlite";
import { cookies } from "next/headers";
import { UNLOCK_COOKIE, isUnlocked, lockKind, getSessionUserId } from "../../../db/local/pin-lock.cjs";
import { readTavilyRecord } from "../../../db/local/tavily.cjs";
import { decryptWithDpapi } from "../../../db/local/credentials.cjs";
import {
  jsonResponse,
  withNoStore,
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
  getDecryptedProviderKey,
  discoverProviderModelsCached,
  extractStreamingAnswer,
  extractStreamingSuggestions,
  searchTavily,
  formatWebSearchContext,
  validateChatRequest,
  readLimitedJsonBody,
  executeInference,
  buildDecisionSystemPrompt,
  buildFinalAnswerSystemPrompt,
  parseModelDecision,
  getOpenCodeProtocolForModel,
  MAX_CHAT_BODY_BYTES,
} from "../../../db/local/chat.cjs";
import { injectTaskContext } from "../../../db/local/chat-tasks.cjs";
import { attachFilesToMessages } from "../../../db/local/chat-attachments.cjs";
import { getProjectContext } from "../../../db/local/project-context.cjs";
import { compileProjectContext, withSnapshot } from "../../../db/local/project-graph.cjs";
import { getProjectCatalogs } from "../../../db/local/tasks.cjs";
import {
  captureProjectResources,
  resolveProjectResourceContent,
} from "../../../db/local/project-resource-content.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ProjectContextCompiled {
  context: string;
  rules: string[];
  resources: { title: string; url: string }[];
  compiledPrompt?: string;
  coverage?: {
    totalTasks: number;
    includedSummaryTasks: number;
    truncatedSummaryTasks: number;
    isComplete: boolean;
    budgetChars: number;
  };
  version?: string;
}

export async function POST(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  const bodyResult = await readLimitedJsonBody(request, MAX_CHAT_BODY_BYTES);
  if (bodyResult.error) return bodyResult.error;

  const validation = validateChatRequest(bodyResult.data);
  if (validation.error) return validation.error;

  const { projectId, provider, model, protocol: requestedProtocol, region } = validation.data;
  let messages: any[] = validation.data.messages;

  let db: DatabaseSync | null = null;
  let projectRow: { id: number; nombre: string } | undefined;
  let apiKey: string | null = null;
  let tavilyEncryptedKey: string | null = null;
  const sessionToken = (await cookies()).get(UNLOCK_COOKIE)?.value;
  let tavilyAuthorized = false;

  let projectContext: ProjectContextCompiled | null = null;
  let capturedResources: any = null;

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
    tavilyAuthorized = (!lockKind() || isUnlocked(sessionToken)) &&
      ((db as { kind?: string }).kind !== "turso" || getSessionUserId(sessionToken) === user.id);
    if (tavilyAuthorized) tavilyEncryptedKey = readTavilyRecord(db, user.id)?.clave_cifrada ?? null;

    try {
      messages = attachFilesToMessages(db, projectId, injectTaskContext(db, projectId, messages.slice(-15)));
    } catch {
      return jsonResponse({ error: "No se pudieron leer los adjuntos del mensaje" }, 500);
    }

    try {
      const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content || "";
      const snapshotResult = withSnapshot(db, () => {
        const compiled = compileProjectContext(db, projectId, { queryText: lastUserMessage });
        const initialCtx = {
          context: compiled.context,
          rules: compiled.rules,
          resources: compiled.resources,
          compiledPrompt: compiled.compiledPrompt,
          coverage: compiled.coverage,
          version: compiled.version,
        };
        try {
          const tagCatalog = getProjectCatalogs(db, projectId).tags || [];
          const boundedTags = tagCatalog
            .slice(0, 80)
            .map((t: { name: unknown; color?: unknown }) =>
              `- ${String(t.name).slice(0, 80)}${t.color ? ` (${String(t.color)})` : ""}`
            );
          if (boundedTags.length > 0) {
            initialCtx.compiledPrompt = `${initialCtx.compiledPrompt || ""}\n\n### ETIQUETAS DEL PROYECTO (reutilizables):\n${boundedTags.join("\n")}\n`;
          }
        } catch {}
        const captured = captureProjectResources(db, projectId, initialCtx);
        return { initialCtx, captured };
      });
      projectContext = snapshotResult.initialCtx;
      capturedResources = snapshotResult.captured;
    } catch (err: any) {
      if (err && err.code === "PROJECT_CONTEXT_BUDGET_EXCEEDED") {
        return jsonResponse({ error: err.message || "Presupuesto de contexto de proyecto excedido" }, 422);
      }
      return jsonResponse({ error: "No se pudo cargar el contexto del proyecto" }, 500);
    }

    try {
      if (provider === "chatgpt" && lockKind() && !isUnlocked((await cookies()).get(UNLOCK_COOKIE)?.value)) {
        return jsonResponse({ error: "Desbloquea tu perfil antes de usar ChatGPT." }, 401);
      }
      apiKey = await getDecryptedProviderKey(db, user.id, provider, provider === "chatgpt" ? (await cookies()).get(UNLOCK_COOKIE)?.value ?? null : undefined);
    } catch (reason) {
      if (reason && typeof reason === "object" && (reason as { name?: string }).name === "OAuthError") {
        const err = reason as { message: string; status: number; code: string };
        return jsonResponse({ error: err.message, code: err.code }, err.status);
      }
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

  const discovery = await discoverProviderModelsCached(provider, apiKey, region, request.signal);
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
  } else if (provider === "bedrock" || provider === "chatgpt") {
    effectiveProtocol = "responses";
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        if (request.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {}
      };
      const sendError = async (response: Response) => {
        let error = "No se pudo completar el chat.";
        try {
          const body = await response.json();
          if (typeof body?.error === "string") error = body.error;
        } catch {}
        send({ type: "error", error, status: response.status });
        try { controller.close(); } catch {}
      };

      let streamed: any[] = [];
      const streamAnswer = () => {
        let sent = 0;
        let sentObjects = 0;
        streamed = [];
        return (raw: string) => {
          const answer = extractStreamingAnswer(raw);
          if (answer.length > sent) {
            sent = answer.length;
            send({ type: "delta", text: answer });
          }
          const objects = extractStreamingSuggestions(raw);
          for (; sentObjects < objects.length; sentObjects++) {
            const proposal = objects[sentObjects];
            if (!proposal) continue;
            streamed.push(proposal);
            send({ type: "suggestion", suggestion: proposal });
          }
        };
      };
      const keepStreamedIds = (suggestions?: any[]) => {
        const used = new Set<string>();
        return suggestions?.map((item) => {
          const match = streamed.find((s) => !used.has(s.id) && s.title === item.title && s.kind === item.kind);
          if (!match) return item;
          used.add(match.id);
          return { ...item, id: match.id };
        });
      };

      try {
        let resourceContentResult = null;
        if (capturedResources) {
          resourceContentResult = await resolveProjectResourceContent(capturedResources, {
            signal: request.signal,
          });
        }

        if (request.signal.aborted) {
          try { controller.close(); } catch {}
          return;
        }

        if (resourceContentResult?.formattedBlock) {
          projectContext = {
            ...(projectContext ?? {}),
            context: projectContext?.context ?? "",
            rules: projectContext?.rules ?? [],
            resources: projectContext?.resources ?? [],
            compiledPrompt: `${projectContext?.compiledPrompt ?? ""}${resourceContentResult.formattedBlock}`,
          };
        }

        send({ type: "thinking" });

        const decisionPrompt = buildDecisionSystemPrompt(projectRow!.nombre, projectContext);
        const decisionInference = await executeInference(
          provider,
          apiKey,
          model,
          effectiveProtocol,
          region,
          messages,
          projectRow!.nombre,
          projectRow!.id,
          request.signal,
          undefined,
          projectContext,
          decisionPrompt,
          streamAnswer()
        );

        if (request.signal.aborted) {
          try { controller.close(); } catch {}
          return;
        }

        if ("error" in decisionInference) {
          await sendError(decisionInference.error);
          return;
        }

        let decision = parseModelDecision(decisionInference.text);
        if (!decision && !request.signal.aborted) {
          const retry = await executeInference(
            provider,
            apiKey,
            model,
            effectiveProtocol,
            region,
            [
              ...messages,
              { role: "assistant", content: String(decisionInference.text ?? "").slice(0, 6000) },
              { role: "user", content: "Tu respuesta no tenía el formato JSON pedido. Responde de nuevo SOLO con el objeto JSON válido, sin texto antes ni después ni bloques de código." },
            ],
            projectRow!.nombre,
            projectRow!.id,
            request.signal,
            undefined,
            projectContext,
            decisionPrompt
          );
          if (!("error" in retry)) decision = parseModelDecision(retry.text);
        }

        if (!decision) {
          send({
            type: "error",
            error: "El modelo no emitió una decisión o respuesta estructurada válida.",
            status: 502,
          });
          try { controller.close(); } catch {}
          return;
        }

        if (decision.action === "answer") {
          const answerDecision = decision as { action: "answer"; answer: string; suggestions?: any[] };
          send({
            type: "complete",
            message: {
              role: "assistant",
              content: answerDecision.answer,
              ...(answerDecision.suggestions ? { suggestions: keepStreamedIds(answerDecision.suggestions) } : {}),
            },
          });
          try { controller.close(); } catch {}
          return;
        }

        if (!tavilyAuthorized || (lockKind() && !isUnlocked(sessionToken))) {
          send({ type: "error", error: "Desbloquea tu perfil para utilizar la búsqueda web de Tavily.", status: 401 });
          try { controller.close(); } catch {}
          return;
        }
        let tavilyKey: string | null;
        try {
          tavilyKey = tavilyEncryptedKey ? await decryptWithDpapi(tavilyEncryptedKey) : process.env.TAVILY_API_KEY?.trim() || null;
        } catch {
          send({ type: "error", error: "No se pudo recuperar la clave segura de Tavily. Revisa su configuración en el menú de usuario.", status: 500 });
          try { controller.close(); } catch {}
          return;
        }
        if (!tavilyKey) {
          send({
            type: "error",
            error: "Configura la API key de Tavily desde el menú de usuario para utilizar la búsqueda web.",
            status: 503,
          });
          try { controller.close(); } catch {}
          return;
        }

        if (lockKind() && !isUnlocked(sessionToken)) {
          send({ type: "error", error: "La sesión se cerró antes de iniciar la búsqueda web.", status: 401 });
          try { controller.close(); } catch {}
          return;
        }

        send({ type: "searching" });

        const search = await searchTavily(
          decision.query,
          tavilyKey,
          request.signal,
        );

        if (request.signal.aborted) {
          try { controller.close(); } catch {}
          return;
        }

        if (!search.ok) {
          await sendError(search.errorResponse ?? jsonResponse({ error: "Error de conexión con Tavily" }, 502));
          return;
        }

        send({ type: "thinking" });

        const contextWithSearch = {
          ...(projectContext ?? {}),
          compiledPrompt: `${projectContext?.compiledPrompt ?? ""}${formatWebSearchContext(search.results)}`,
        };

        const finalPrompt = buildFinalAnswerSystemPrompt(projectRow!.nombre, contextWithSearch as any);

        const finalInference = await executeInference(
          provider,
          apiKey,
          model,
          effectiveProtocol,
          region,
          messages,
          projectRow!.nombre,
          projectRow!.id,
          request.signal,
          undefined,
          contextWithSearch,
          finalPrompt,
          streamAnswer()
        );

        if (request.signal.aborted) {
          try { controller.close(); } catch {}
          return;
        }

        if ("error" in finalInference) {
          await sendError(finalInference.error);
          return;
        }

        const finalDecision = parseModelDecision(finalInference.text);
        if (finalDecision && finalDecision.action === "answer") {
          const finalAnswerDecision = finalDecision as { action: "answer"; answer: string; suggestions?: any[] };
          send({
            type: "complete",
            message: {
              role: "assistant",
              content: finalAnswerDecision.answer,
              ...(finalAnswerDecision.suggestions ? { suggestions: keepStreamedIds(finalAnswerDecision.suggestions) } : {}),
            },
          });
        } else {
          send({ type: "complete", message: { role: "assistant", content: finalInference.text } });
        }
        try { controller.close(); } catch {}
      } catch {
        send({ type: "error", error: "No se pudo procesar la solicitud de chat.", status: 502 });
        try { controller.close(); } catch {}
      }
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
